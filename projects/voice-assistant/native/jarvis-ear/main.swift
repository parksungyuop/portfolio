// jarvis-ear — 마이크를 열어 macOS 26 SpeechTranscriber(ko-KR)로 받아쓰고, 한 줄 JSON 으로 stdout 에 흘린다.
// 계약(명세 §5): stdout {"t":"ready"|"partial"|"final"|"error", ...}, stdin {"cmd":"start"|"pause"|"stop"}.
// 다른 출력은 전부 stderr. 마이크는 이 프로세스만 연다.
//
// 플래그: --selftest (로케일 지원·설치 상태만 출력) · --silence-ms N (기본 800) · --dump path.wav (16kHz PCM16 녹음, 픽스처용)

import AVFoundation
import Foundation
import Speech

func emit(_ obj: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: obj) else { return }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

func log(_ s: String) { FileHandle.standardError.write((s + "\n").data(using: .utf8)!) }

let args = CommandLine.arguments
let selftest = args.contains("--selftest")
var silenceMs = 800
if let i = args.firstIndex(of: "--silence-ms"), i + 1 < args.count, let v = Int(args[i + 1]) { silenceMs = v }
var dumpPath: String? = nil
let pcmStream = args.contains("--pcm")
let debugEnd = ProcessInfo.processInfo.environment["JARVIS_EAR_DEBUG"] != nil // 호출어 감지용: 16kHz s16 을 {"t":"pcm","b64":…} 로 상시 송출
if let i = args.firstIndex(of: "--dump"), i + 1 < args.count { dumpPath = args[i + 1] }

@available(macOS 26.0, *)
final class Ear {
    let locale = Locale(identifier: "ko-KR")
    var listening = false
    var lastVoiceAt = Date()
    var startedAt = Date()
    var lastText = ""
    var lastTextChangedAt = Date()
    var lastRms: Float = 0
    var heardVoice = false
    var finalizing = false
    var finalSentForTurn = false
    let engine = AVAudioEngine()
    var dumpFile: AVAudioFile? = nil
    var dumpConverter: AVAudioConverter? = nil
    var analyzerConverter: AVAudioConverter? = nil
    var pcmConverter: AVAudioConverter? = nil
    let pcmFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!

    func run() async {
        let supported = await SpeechTranscriber.supportedLocales.map { $0.identifier(.bcp47) }
        guard supported.contains("ko-KR") else { emit(["t": "error", "code": "LOCALE_UNSUPPORTED"]); exit(2) }
        let transcriber = SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [.volatileResults, .fastResults], attributeOptions: [])

        var installed = (await SpeechTranscriber.installedLocales).map { $0.identifier(.bcp47) }.contains("ko-KR")
        if !installed {
            // F-15: 없으면 설치한다. 진행은 stderr 로만.
            do {
                if let req = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
                    log("installing ko-KR speech assets…")
                    try await req.downloadAndInstall()
                    installed = true
                }
            } catch {
                emit(["t": "error", "code": "ASSET_MISSING", "detail": "\(error)"]); exit(3)
            }
        }
        do { try await AssetInventory.reserve(locale: locale) } catch { log("reserve failed: \(error)") }

        if selftest {
            emit(["t": "ready", "installed": installed, "supported": supported.count]); exit(0)
        }

        // 분석기 입력 포맷: 분석기가 원하는 포맷으로 마이크 버퍼를 변환한다.
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
            emit(["t": "error", "code": "ENGINE", "detail": "no analyzer audio format"]); exit(5)
        }
        let input = engine.inputNode
        let micFormat = input.outputFormat(forBus: 0)
        analyzerConverter = AVAudioConverter(from: micFormat, to: analyzerFormat)

        if let path = dumpPath {
            let dumpFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
            dumpFile = try? AVAudioFile(forWriting: URL(fileURLWithPath: path), settings: dumpFormat.settings, commonFormat: .pcmFormatInt16, interleaved: true)
            dumpConverter = AVAudioConverter(from: micFormat, to: dumpFormat)
        }

        if pcmStream { pcmConverter = AVAudioConverter(from: micFormat, to: pcmFormat) }

        let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()

        input.installTap(onBus: 0, bufferSize: 4096, format: micFormat) { [self] buffer, _ in
            // RMS 로 마지막 발화 시각을 갱신한다 (침묵 종료 판단).
            if let ch = buffer.floatChannelData?[0] {
                let n = Int(buffer.frameLength)
                var sum: Float = 0
                for i in 0..<n { sum += ch[i] * ch[i] }
                if n > 0 { lastRms = (sum / Float(n)).squareRoot(); if lastRms > 0.01 { lastVoiceAt = Date(); if listening, lastRms > 0.02 { heardVoice = true } } }
            }
            if let f = dumpFile, let conv = dumpConverter { writeConverted(buffer: buffer, converter: conv, file: f) }
            if let conv = pcmConverter, let out = convert(buffer: buffer, converter: conv, to: pcmFormat), let p = out.int16ChannelData?[0] {
                let bytes = Data(bytes: p, count: Int(out.frameLength) * 2)
                emit(["t": "pcm", "b64": bytes.base64EncodedString()])
            }
            guard listening, let conv = analyzerConverter else { return }
            if let converted = convert(buffer: buffer, converter: conv, to: analyzerFormat) {
                continuation.yield(AnalyzerInput(buffer: converted))
            }
        }

        do { try engine.start() } catch {
            emit(["t": "error", "code": "MIC_DENIED", "detail": "\(error)"]); exit(4)
        }
        do { try await analyzer.start(inputSequence: stream) } catch {
            emit(["t": "error", "code": "ENGINE", "detail": "\(error)"]); exit(5)
        }
        emit(["t": "ready", "installed": installed])

        // 결과 소비
        Task { [self] in
            do {
                for try await result in transcriber.results {
                    let text = String(result.text.characters)
                    let ms = Int(Date().timeIntervalSince(startedAt) * 1000)
                    if result.isFinal {
                        lastText = ""
                        finalSentForTurn = true
                        listening = false
                        emit(["t": "final", "text": text, "ms": ms])
                    } else {
                        if text != lastText { lastTextChangedAt = Date() }
                        lastText = text
                        emit(["t": "partial", "text": text, "ms": ms])
                    }
                }
            } catch {
                emit(["t": "error", "code": "ENGINE", "detail": "\(error)"])
            }
        }
        // 침묵 → final 강제 (엔진이 final 을 늦게 주는 경우 대비)
        Task { [self] in
            while true {
                try? await Task.sleep(nanoseconds: 100_000_000)
                // 종결 어미로 끝나면 침묵 기준을 절반으로 (명세 §5 조기 종료)
                let trimmed = lastText.trimmingCharacters(in: .whitespacesAndNewlines)
                let ended = ["요", "다", "까", "죠", "줘", "니", "나", "자", "네", "야", "?", "."].contains { trimmed.hasSuffix($0) }
                let limit = ended ? Double(silenceMs) * 0.55 : Double(silenceMs)
                let quietMs = Date().timeIntervalSince(lastVoiceAt) * 1000
                let stableMs = Date().timeIntervalSince(lastTextChangedAt) * 1000
                if listening, debugEnd, Int(Date().timeIntervalSince(startedAt) * 10) % 5 == 0 { log("end? quiet=\(Int(quietMs)) stable=\(Int(stableMs)) limit=\(Int(limit)) rms=\(String(format: "%.3f", lastRms)) heard=\(heardVoice) text=\(lastText.suffix(12))") }
                // 말소리가 있었고(heardVoice) 그 뒤 limit 만큼 조용하면 엔진에 확정을 강제한다.
                // 엔진은 부분 결과를 늦게 주므로 텍스트 유무와 무관하게 finalize 한다.
                if listening, !finalSentForTurn, !finalizing, heardVoice, quietMs > limit {
                    finalizing = true
                    let snapshot = lastText
                    Task { [self] in
                        try? await analyzer.finalize(through: nil)
                        // 1.5초 안에 엔진 final 이 안 오면 마지막 부분 결과로 강제 확정
                        try? await Task.sleep(nanoseconds: 1_500_000_000)
                        if listening, !finalSentForTurn {
                            listening = false
                            finalSentForTurn = true
                            emit(["t": "final", "text": lastText.isEmpty ? snapshot : lastText, "ms": Int(Date().timeIntervalSince(startedAt) * 1000), "forced": true])
                            lastText = ""
                        }
                        finalizing = false
                    }
                }
            }
        }
        // stdin 명령
        while let line = readLine() {
            guard let d = line.data(using: .utf8),
                  let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
                  let cmd = o["cmd"] as? String else { continue }
            switch cmd {
            case "start":
                listening = true; lastVoiceAt = Date(); lastTextChangedAt = Date(); startedAt = Date(); lastText = ""; finalSentForTurn = false; heardVoice = false; finalizing = false
            case "pause":
                listening = false
            case "stop":
                engine.stop(); continuation.finish(); exit(0)
            default: break
            }
        }
        engine.stop(); continuation.finish(); exit(0)
    }

    func convert(buffer: AVAudioPCMBuffer, converter: AVAudioConverter, to format: AVAudioFormat) -> AVAudioPCMBuffer? {
        let ratio = format.sampleRate / buffer.format.sampleRate
        let cap = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 16
        guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: cap) else { return nil }
        var consumed = false
        var err: NSError? = nil
        converter.convert(to: out, error: &err) { _, status in
            if consumed { status.pointee = .noDataNow; return nil }
            consumed = true; status.pointee = .haveData; return buffer
        }
        if err != nil { return nil }
        return out
    }

    func writeConverted(buffer: AVAudioPCMBuffer, converter: AVAudioConverter, file: AVAudioFile) {
        if let out = convert(buffer: buffer, converter: converter, to: file.processingFormat) {
            try? file.write(from: out)
        }
    }
}

if #available(macOS 26.0, *) {
    let sem = DispatchSemaphore(value: 0)
    Task { await Ear().run(); sem.signal() }
    sem.wait()
} else {
    emit(["t": "error", "code": "ENGINE", "detail": "macOS 26 required"]); exit(1)
}
