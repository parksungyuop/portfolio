# 자비스 0단계(스파이크 6개) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 명세 §9의 0단계 — 여섯 스파이크를 실행 가능한 스크립트로 만들고, 측정값을 `docs/verification.md`에 남겨 1a 착수 여부를 결정한다. `spike:stt`가 가장 먼저이며 실패하면 나머지를 멈춘다.

**Architecture:** pnpm 워크스페이스 하나. `native/jarvis-ear`(Swift 단일 파일)와 `scripts/spike-*.ts`(tsx로 실행), 공용 순수 함수는 `packages/core`(vitest로 검증). 스파이크는 `pnpm check`(tsc + vitest)에서 제외되고 `pnpm spike:<이름>`으로만 돈다.

**Tech Stack:** Node 26 · pnpm 11 · TypeScript 5 · tsx · vitest · Electron 44 · `@anthropic-ai/claude-agent-sdk` 0.3.x · `onnxruntime-node` · `ws` · Swift 6.3(`swiftc`, Xcode 프로젝트 없음)

**Spec:** `docs/01-jarvis-design.md` v2 — §5(음성), §6.1(SDK 옵션), §9(스파이크 표·척도), F-11·F-12·F-15·F-16·F-19·F-23·F-26

## Global Constraints

- 저장소 `~/Documents/jarvis`, 커밋 메시지는 영어 소문자 동사로 시작, `Co-Authored-By` 줄 없음(개인 저장소)
- 비밀값은 코드·로그·커밋·문서에 절대 남기지 않는다. 스파이크는 키를 **환경변수로만** 받는다(`ELEVENLABS_API_KEY`), 없으면 폴백 경로를 실행한다
- `brain.auth = subscription`: `spike:sdk`는 실행 전 `ANTHROPIC_API_KEY`가 env에 **없음**을 단언한다(F-19)
- Agent SDK 옵션 불변식: `tools: []`, `allowedTools`에 `*` 없음, `permissionMode: "default"`, `includePartialMessages: true`(F-11·F-12)
- 마이크는 `jarvis-ear`만 연다. 스파이크는 설치·권한 요청을 사용자가 보는 앞에서만 한다
- `spike:*`는 `pnpm check`에서 제외. 측정 행 형식: `명령 · 날짜 · OS빌드 · 지표 · 측정값 · 픽스처 해시 · 통과`
- 한국어 문자열 리터럴은 UTF-8 그대로. 이모지 없음

---

### Task 1: 저장소 뼈대와 회귀 게이트

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`, `packages/core/src/cer.ts`, `packages/core/test/cer.test.ts`

**Interfaces:**
- Produces: `cer(reference: string, hypothesis: string): number` — 문자 오류율(0~1), 공백·구두점 제거 후 레벤슈타인/참조 길이. `spike:stt`가 쓴다.

- [ ] **Step 1: 워크스페이스 파일 작성**

`package.json`
```json
{
  "name": "jarvis",
  "private": true,
  "type": "module",
  "engines": { "node": ">=26 <27", "pnpm": ">=11 <12" },
  "scripts": {
    "check": "tsc -b && vitest run",
    "test": "vitest run",
    "spike:stt": "tsx scripts/spike-stt.ts",
    "spike:sdk": "tsx scripts/spike-sdk.ts",
    "spike:wake": "tsx scripts/spike-wake.ts",
    "spike:tts": "tsx scripts/spike-tts.ts",
    "spike:cal": "tsx scripts/spike-cal.ts",
    "spike:hud": "tsx scripts/spike-hud.ts",
    "build:ear": "bash scripts/build-ear.sh"
  },
  "devDependencies": {
    "@types/node": "^26.0.0",
    "tsx": "^4.20.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

`pnpm-workspace.yaml`
```yaml
packages:
  - packages/*
  - apps/*
```

`tsconfig.base.json`
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "declaration": true,
    "composite": true
  }
}
```

`packages/core/package.json`
```json
{ "name": "@jarvis/core", "version": "0.0.0", "private": true, "type": "module",
  "main": "./src/index.ts", "types": "./src/index.ts" }
```

`packages/core/tsconfig.json`
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": "src" }, "include": ["src"] }
```

`vitest.config.ts`
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'] } })
```

루트 `tsconfig.json`: `{ "files": [], "references": [{ "path": "packages/core" }] }`

- [ ] **Step 2: 실패하는 테스트 작성** — `packages/core/test/cer.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { cer } from '../src/cer.js'

describe('cer', () => {
  it('같은 문장은 0', () => { expect(cer('오늘 우산 챙겨야 해', '오늘 우산 챙겨야 해')).toBe(0) })
  it('공백·구두점은 무시한다', () => { expect(cer('오늘, 우산!', '오늘 우산')).toBe(0) })
  it('한 글자 치환은 1/길이', () => { expect(cer('배치점검', '배치검검')).toBeCloseTo(0.25) })
  it('빈 참조는 가설 길이가 오류', () => { expect(cer('', '가')).toBe(1) })
})
```

- [ ] **Step 3: 실패 확인** — Run: `pnpm install && pnpm vitest run packages/core` · Expected: FAIL (`cer` 모듈 없음)

- [ ] **Step 4: 최소 구현** — `packages/core/src/cer.ts`

```ts
const STRIP = /[\s\p{P}\p{S}]/gu
export function normalizeForCer(s: string): string { return s.normalize('NFC').replace(STRIP, '') }

export function cer(reference: string, hypothesis: string): number {
  const r = [...normalizeForCer(reference)], h = [...normalizeForCer(hypothesis)]
  if (r.length === 0) return h.length === 0 ? 0 : 1
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j)
  for (let i = 1; i <= r.length; i++) {
    const cur = [i]
    for (let j = 1; j <= h.length; j++) {
      const cost = r[i - 1] === h[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost)
    }
    prev = cur
  }
  return prev[h.length]! / r.length
}
```
`packages/core/src/index.ts`: `export { cer, normalizeForCer } from './cer.js'`

- [ ] **Step 5: 통과 확인** — Run: `pnpm check` · Expected: tsc 성공, 4 passed

- [ ] **Step 6: 커밋** — `git add -A && git commit -m "chore: scaffold the pnpm workspace with a core package and the cer metric"`

---

### Task 2: `jarvis-ear` Swift 헬퍼 (JSON lines 계약)

**Files:**
- Create: `native/jarvis-ear/main.swift`, `scripts/build-ear.sh`, `native/jarvis-ear/fixtures/stt-sentences.ko.txt`, `packages/core/src/ear-protocol.ts`, `packages/core/test/ear-protocol.test.ts`

**Interfaces:**
- Produces (stdout, 한 줄 JSON): `{"t":"ready","installed":true}` · `{"t":"partial","text":"…"}` · `{"t":"final","text":"…","ms":1234}` · `{"t":"error","code":"MIC_DENIED"|"ASSET_MISSING"|"LOCALE_UNSUPPORTED"|"ENGINE"}` 
- Consumes (stdin, 한 줄 JSON): `{"cmd":"start"}` · `{"cmd":"pause"}` · `{"cmd":"stop"}`
- 플래그: `--selftest`(로케일 지원·설치 상태만 출력하고 종료) · `--silence-ms 800`
- `parseEarLine(line: string): EarEvent | null` (TS, 계약 파서)

- [ ] **Step 1: 계약 파서 테스트** — `packages/core/test/ear-protocol.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { parseEarLine } from '../src/ear-protocol.js'

describe('parseEarLine', () => {
  it('final', () => { expect(parseEarLine('{"t":"final","text":"오늘 뭐 있어","ms":812}')).toEqual({ t: 'final', text: '오늘 뭐 있어', ms: 812 }) })
  it('partial', () => { expect(parseEarLine('{"t":"partial","text":"오늘"}')).toEqual({ t: 'partial', text: '오늘' }) })
  it('ready', () => { expect(parseEarLine('{"t":"ready","installed":true}')).toEqual({ t: 'ready', installed: true }) })
  it('모르는 타입은 null', () => { expect(parseEarLine('{"t":"nope"}')).toBeNull() })
  it('깨진 JSON은 null', () => { expect(parseEarLine('{')).toBeNull() })
})
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm vitest run packages/core` · Expected: FAIL

- [ ] **Step 3: 파서 구현** — `packages/core/src/ear-protocol.ts`

```ts
export type EarEvent =
  | { t: 'ready'; installed: boolean }
  | { t: 'partial'; text: string }
  | { t: 'final'; text: string; ms: number }
  | { t: 'error'; code: 'MIC_DENIED' | 'ASSET_MISSING' | 'LOCALE_UNSUPPORTED' | 'ENGINE'; detail?: string }

export function parseEarLine(line: string): EarEvent | null {
  let v: unknown
  try { v = JSON.parse(line) } catch { return null }
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  switch (o.t) {
    case 'ready': return typeof o.installed === 'boolean' ? { t: 'ready', installed: o.installed } : null
    case 'partial': return typeof o.text === 'string' ? { t: 'partial', text: o.text } : null
    case 'final': return typeof o.text === 'string' && typeof o.ms === 'number' ? { t: 'final', text: o.text, ms: o.ms } : null
    case 'error': {
      const codes = ['MIC_DENIED', 'ASSET_MISSING', 'LOCALE_UNSUPPORTED', 'ENGINE'] as const
      const code = codes.find(c => c === o.code)
      return code ? { t: 'error', code, ...(typeof o.detail === 'string' ? { detail: o.detail } : {}) } : null
    }
    default: return null
  }
}
```
`index.ts`에 `export * from './ear-protocol.js'` 추가.

- [ ] **Step 4: 통과 확인** — Run: `pnpm check` · Expected: PASS

- [ ] **Step 5: Swift 헬퍼 작성** — `native/jarvis-ear/main.swift`

```swift
import AVFoundation
import Foundation
import Speech

// 한 줄 JSON을 stdout에 쓴다. 다른 출력은 전부 stderr.
func emit(_ obj: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: obj)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

let args = CommandLine.arguments
let selftest = args.contains("--selftest")
var silenceMs = 800
if let i = args.firstIndex(of: "--silence-ms"), i + 1 < args.count, let v = Int(args[i + 1]) { silenceMs = v }

@available(macOS 26.0, *)
func run() async {
    let locale = Locale(identifier: "ko-KR")
    let supported = await SpeechTranscriber.supportedLocales.map { $0.identifier(.bcp47) }
    guard supported.contains("ko-KR") else { emit(["t": "error", "code": "LOCALE_UNSUPPORTED"]); exit(2) }
    let transcriber = SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [.volatileResults], attributeOptions: [])
    var installed = (await SpeechTranscriber.installedLocales).map { $0.identifier(.bcp47) }.contains("ko-KR")
    if !installed {
        // F-15: 없으면 설치, 있으면 예약. 설치 진행은 stderr.
        if let req = try? await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            do { try await req.downloadAndInstall(); installed = true } catch { emit(["t": "error", "code": "ASSET_MISSING", "detail": "\(error)"]); exit(3) }
        }
    }
    _ = try? await AssetInventory.reserve(locale: locale)
    if selftest { emit(["t": "ready", "installed": installed, "supported": supported.count]); exit(0) }

    // 마이크
    let engine = AVAudioEngine()
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
    var listening = false
    var lastVoiceAt = Date()
    var lastText = ""
    var startedAt = Date()

    input.installTap(onBus: 0, bufferSize: 4096, format: format) { buffer, _ in
        guard listening else { return }
        // 간단한 RMS 침묵 감지
        if let ch = buffer.floatChannelData?[0] {
            var sum: Float = 0; let n = Int(buffer.frameLength)
            for i in 0..<n { sum += ch[i] * ch[i] }
            if n > 0 && (sum / Float(n)).squareRoot() > 0.01 { lastVoiceAt = Date() }
        }
        continuation.yield(AnalyzerInput(buffer: buffer))
    }
    do { try engine.start() } catch { emit(["t": "error", "code": "MIC_DENIED", "detail": "\(error)"]); exit(4) }
    try? await analyzer.start(inputSequence: stream)
    emit(["t": "ready", "installed": installed])

    // 결과 소비
    Task {
        for try await result in transcriber.results {
            let text = String(result.text.characters)
            if result.isFinal { lastText = text }
            emit(["t": result.isFinal ? "final" : "partial", "text": text, "ms": Int(Date().timeIntervalSince(startedAt) * 1000)])
        }
    }
    // 침묵 → final 강제 (엔진이 final을 안 주는 경우 대비)
    Task {
        while true {
            try? await Task.sleep(nanoseconds: 100_000_000)
            if listening && Date().timeIntervalSince(lastVoiceAt) * 1000 > Double(silenceMs) && !lastText.isEmpty {
                listening = false
                emit(["t": "final", "text": lastText, "ms": Int(Date().timeIntervalSince(startedAt) * 1000)])
                lastText = ""
            }
        }
    }
    // stdin 명령
    while let line = readLine() {
        guard let d = line.data(using: .utf8), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let cmd = o["cmd"] as? String else { continue }
        switch cmd {
        case "start": listening = true; lastVoiceAt = Date(); startedAt = Date(); lastText = ""
        case "pause": listening = false
        case "stop": exit(0)
        default: break
        }
    }
}

if #available(macOS 26.0, *) {
    let sem = DispatchSemaphore(value: 0)
    Task { await run(); sem.signal() }
    sem.wait()
} else { emit(["t": "error", "code": "ENGINE", "detail": "macOS 26 required"]); exit(1) }
```
주의: `SpeechAnalyzer`/`AnalyzerInput`/`transcriber.results`의 정확한 시그니처는 이 맥의 SDK 헤더로 확인해 고친다(`xcrun swiftc` 오류가 알려준다). 계약(JSON lines)은 바꾸지 않는다.

- [ ] **Step 6: 빌드 스크립트** — `scripts/build-ear.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p native/jarvis-ear/build
xcrun swiftc -O -framework Speech -framework AVFoundation \
  -o native/jarvis-ear/build/jarvis-ear native/jarvis-ear/main.swift
echo "built native/jarvis-ear/build/jarvis-ear"
```

- [ ] **Step 7: 픽스처** — `native/jarvis-ear/fixtures/stt-sentences.ko.txt` (10줄, F-16·F-29)

```
오늘 우산 챙겨야 해
승인 대기 몇 편이야
역사 카테고리 다섯 편 돌려
내일 두 시 강남 미팅 추가해 줘
포털 상태 어때
헤이 자비스 오늘 뭐 있어
헤이 자비스 배치 점검 몇 시야
유튜브 열어 줄 수 있어
ElevenLabs 키 바꿔야 해
렌더 포털 깨워 줘
```

- [ ] **Step 8: 빌드·자가 진단** — Run: `pnpm build:ear && native/jarvis-ear/build/jarvis-ear --selftest` · Expected: `{"t":"ready","installed":true,"supported":30}` (숫자는 이 맥 값)

- [ ] **Step 9: 커밋** — `git add -A && git commit -m "feat: add the jarvis-ear speech helper and its json-lines contract"`

---

### Task 3: `spike:stt` — 낭독 10문장 CER 측정

**Files:**
- Create: `scripts/spike-stt.ts`, `scripts/lib/verification.ts`, `packages/core/src/spike-report.ts`, `packages/core/test/spike-report.test.ts`

**Interfaces:**
- Consumes: `cer`, `parseEarLine`
- Produces: `appendVerification(row: VerificationRow): void` — `docs/verification.md`에 표 한 줄 추가. `VerificationRow = {command, date, osBuild, metric, value, fixtureHash, pass}`

- [ ] **Step 1: 행 포맷 테스트** — `packages/core/test/spike-report.test.ts`

```ts
import { expect, it } from 'vitest'
import { formatVerificationRow } from '../src/spike-report.js'
it('표 한 줄을 만든다', () => {
  expect(formatVerificationRow({ command: 'pnpm spike:stt', date: '2026-09-05', osBuild: '25G76', metric: 'CER avg', value: '0.06', fixtureHash: 'abc123', pass: true }))
    .toBe('| `pnpm spike:stt` | 2026-09-05 | 25G76 | CER avg | 0.06 | abc123 | 통과 |')
})
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm vitest run packages/core` · Expected: FAIL

- [ ] **Step 3: 구현** — `packages/core/src/spike-report.ts`

```ts
export type VerificationRow = { command: string; date: string; osBuild: string; metric: string; value: string; fixtureHash: string; pass: boolean }
export function formatVerificationRow(r: VerificationRow): string {
  return `| \`${r.command}\` | ${r.date} | ${r.osBuild} | ${r.metric} | ${r.value} | ${r.fixtureHash} | ${r.pass ? '통과' : '실패'} |`
}
```
`scripts/lib/verification.ts`
```ts
import { appendFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { formatVerificationRow, type VerificationRow } from '@jarvis/core'

export const osBuild = () => execSync('sw_vers -buildVersion').toString().trim()
export const today = () => new Date().toISOString().slice(0, 10)
export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex').slice(0, 12)
export function appendVerification(row: Omit<VerificationRow, 'date' | 'osBuild'>) {
  appendFileSync('docs/verification.md', formatVerificationRow({ ...row, date: today(), osBuild: osBuild() }) + '\n')
}
```

- [ ] **Step 4: 스파이크 스크립트** — `scripts/spike-stt.ts`

```ts
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { cer, parseEarLine } from '@jarvis/core'
import { appendVerification, sha256 } from './lib/verification.js'

const sentences = readFileSync('native/jarvis-ear/fixtures/stt-sentences.ko.txt', 'utf8').trim().split('\n')
const ear = spawn('native/jarvis-ear/build/jarvis-ear', ['--silence-ms', '800'], { stdio: ['pipe', 'pipe', 'inherit'] })
const lines = createInterface({ input: ear.stdout! })
const results: number[] = []
let idx = 0, tReady = 0, tFirstReadyToStart = 0

function ask() {
  if (idx >= sentences.length) return finish()
  console.log(`\n[${idx + 1}/${sentences.length}] 읽어 주세요: "${sentences[idx]}"`)
  const t0 = Date.now(); ear.stdin!.write('{"cmd":"start"}\n'); if (!tFirstReadyToStart) tFirstReadyToStart = t0 - tReady
}
function finish() {
  const avg = results.reduce((a, b) => a + b, 0) / results.length
  const pass = avg <= 0.10
  console.log(`\nCER 평균 ${avg.toFixed(3)} → ${pass ? '통과' : '실패'}`)
  appendVerification({ command: 'pnpm spike:stt', metric: 'CER avg(10문장)', value: avg.toFixed(3), fixtureHash: sha256(sentences.join('\n')), pass })
  ear.stdin!.write('{"cmd":"stop"}\n'); process.exit(pass ? 0 : 1)
}
lines.on('line', (l) => {
  const ev = parseEarLine(l); if (!ev) return
  if (ev.t === 'ready') { tReady = Date.now(); console.log('마이크 준비됨 · installed=', ev.installed); ask() }
  if (ev.t === 'partial') process.stdout.write(`\r  … ${ev.text}`)
  if (ev.t === 'final') { const c = cer(sentences[idx]!, ev.text); results.push(c); console.log(`\n  → "${ev.text}" CER=${c.toFixed(2)}`); idx++; ask() }
  if (ev.t === 'error') { console.error('EAR ERROR', ev); process.exit(2) }
})
```

- [ ] **Step 5: 실행(수동 1회, 마이크 앞에서)** — Run: `pnpm spike:stt` · Expected: 마이크 권한 창(첫 실행) → 10문장 낭독 → `docs/verification.md`에 한 줄. **CER > 0.10이면 여기서 멈추고 D-J04·D-J10을 사용자와 상의한다.**

- [ ] **Step 6: 커밋** — `git add -A && git commit -m "feat: add the stt spike that scores ten spoken sentences by cer"`

---

### Task 4: `spike:sdk` — 구독 인증 스트리밍 query

**Files:**
- Create: `scripts/spike-sdk.ts`, `packages/core/src/sdk-guards.ts`, `packages/core/test/sdk-guards.test.ts`
- Modify: `package.json` (devDependencies에 `@anthropic-ai/claude-agent-sdk`)

**Interfaces:**
- Produces: `assertToolPolicy(opts: {allowedTools: string[]; tools: string[]; permissionMode: string; includePartialMessages: boolean}): void` — 불변식 위반 시 throw. 1a의 두뇌 래퍼가 기동 시 호출한다.

- [ ] **Step 1: 가드 테스트** — `packages/core/test/sdk-guards.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { assertToolPolicy, isMcpTool } from '../src/sdk-guards.js'
const ok = { allowedTools: ['mcp__weather__weather_today'], tools: [], permissionMode: 'default', includePartialMessages: true }
describe('assertToolPolicy', () => {
  it('정상 통과', () => { expect(() => assertToolPolicy(ok)).not.toThrow() })
  it('와일드카드 거부', () => { expect(() => assertToolPolicy({ ...ok, allowedTools: ['mcp__weather__*'] })).toThrow(/wildcard/) })
  it('내장 도구 거부', () => { expect(() => assertToolPolicy({ ...ok, tools: ['Bash'] })).toThrow(/tools/) })
  it('partial 필수', () => { expect(() => assertToolPolicy({ ...ok, includePartialMessages: false })).toThrow(/partial/) })
})
it('isMcpTool', () => { expect(isMcpTool('mcp__x__y')).toBe(true); expect(isMcpTool('Bash')).toBe(false) })
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm vitest run packages/core` · Expected: FAIL

- [ ] **Step 3: 구현** — `packages/core/src/sdk-guards.ts`

```ts
export const isMcpTool = (name: string) => name.startsWith('mcp__')
export function assertToolPolicy(o: { allowedTools: string[]; tools: string[]; permissionMode: string; includePartialMessages: boolean }) {
  if (o.allowedTools.some(t => t.includes('*'))) throw new Error('allowedTools must not contain wildcard entries')
  if (o.allowedTools.some(t => !isMcpTool(t))) throw new Error('allowedTools must be mcp__ tools only')
  if (o.tools.length !== 0) throw new Error('built-in tools must be empty')
  if (o.permissionMode !== 'default') throw new Error('permissionMode must be default')
  if (!o.includePartialMessages) throw new Error('includePartialMessages must be true for sentence-level tts')
}
```

- [ ] **Step 4: 스파이크** — `scripts/spike-sdk.ts` (`pnpm add -Dw @anthropic-ai/claude-agent-sdk` 먼저)

```ts
import { query } from '@anthropic-ai/claude-agent-sdk'
import { assertToolPolicy, isMcpTool } from '@jarvis/core'
import { appendVerification } from './lib/verification.js'

if (process.env.ANTHROPIC_API_KEY) { console.error('구독 경로 스파이크: ANTHROPIC_API_KEY를 env에서 제거하고 실행하세요'); process.exit(2) }
const opts = { allowedTools: [] as string[], tools: [] as string[], permissionMode: 'default' as const, includePartialMessages: true }
assertToolPolicy(opts)

const t0 = Date.now(); let tFirstDelta = 0, deltas = 0, nonMcp: string[] = [], text = ''
for await (const msg of query({ prompt: '한 문장으로 인사해 줘. 한국어로.', options: { ...opts, maxTurns: 1, model: 'claude-sonnet-5' } })) {
  if (msg.type === 'system' && msg.subtype === 'init') nonMcp = msg.tools.filter(t => !isMcpTool(t))
  if (msg.type === 'stream_event' && msg.event.type === 'content_block_delta' && msg.event.delta.type === 'text_delta') {
    if (!tFirstDelta) tFirstDelta = Date.now() - t0
    deltas++; text += msg.event.delta.text
  }
  if (msg.type === 'result') console.log('result:', msg.subtype, 'cost:', (msg as { total_cost_usd?: number }).total_cost_usd)
}
console.log({ tFirstDelta, deltas, nonMcp, text })
const pass = deltas > 0 && nonMcp.length === 0
appendVerification({ command: 'pnpm spike:sdk', metric: '첫 델타 ms · 델타 수 · 비MCP 도구', value: `${tFirstDelta} · ${deltas} · ${nonMcp.join(',') || '없음'}`, fixtureHash: '—', pass })
process.exit(pass ? 0 : 1)
```
`msg.tools`·`msg.event` 타입이 SDK 버전과 다르면 `as` 대신 SDK가 export하는 타입으로 맞춘다.

- [ ] **Step 5: 실행** — Run: `env -u ANTHROPIC_API_KEY pnpm spike:sdk` · Expected: 델타 수신, `nonMcp`가 빈 배열(비어 있지 않으면 `disallowedTools`에 그 이름을 넣고 재실행 — F-11 벨트).

- [ ] **Step 6: 커밋** — `git commit -am "feat: add the sdk spike and the tool policy guard"`

---

### Task 5: `spike:wake` — WAV 픽스처로 결정적 호출어 측정

**Files:**
- Create: `scripts/fetch-models.ts`, `packages/core/src/wakeword.ts`, `packages/core/test/wakeword.test.ts`, `scripts/spike-wake.ts`, `scripts/record-fixture.ts`, `fixtures/wake/README.md`
- Modify: `package.json` (`onnxruntime-node`), `.gitignore` (`models/`)

**Interfaces:**
- Produces: `class WakeWordDetector { constructor(models: {mel, emb, cls}: ort.InferenceSession); pushPcm16k(frame: Float32Array /* 1280 */): number /* score */ }` 
- `wavToFloat32(buf: Buffer): {sampleRate: number; samples: Float32Array}` (PCM16 mono만)

- [ ] **Step 1: 모델 받기** — `scripts/fetch-models.ts`: openWakeWord 저장소의 `melspectrogram.onnx`·`embedding_model.onnx`·`hey_jarvis_v0.1.onnx`를 `https://github.com/dscripka/openWakeWord/raw/main/openwakeword/resources/models/` 에서 `models/`로 내려받고 SHA-256을 `models/SHA256SUMS`에 기록(첫 실행이 기록, 이후 실행은 대조). `.gitignore`에 `models/*.onnx`, `SHA256SUMS`는 커밋.

- [ ] **Step 2: WAV 파서 테스트** — `packages/core/test/wakeword.test.ts`

```ts
import { expect, it } from 'vitest'
import { wavToFloat32, frames80ms } from '../src/wakeword.js'
function wav16(samples: number[]): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40); samples.forEach((s, i) => b.writeInt16LE(s, 44 + i * 2)); return b
}
it('16k mono PCM16을 float32로', () => { const r = wavToFloat32(wav16([0, 16384, -16384])); expect(r.sampleRate).toBe(16000); expect(Array.from(r.samples)).toEqual([0, 0.5, -0.5]) })
it('80ms 프레임 = 1280 샘플', () => { expect(frames80ms(new Float32Array(2560)).length).toBe(2) })
```

- [ ] **Step 3: 실패 확인** → **Step 4: 구현** — `packages/core/src/wakeword.ts`

```ts
import type { InferenceSession, Tensor } from 'onnxruntime-node'
export function wavToFloat32(buf: Buffer): { sampleRate: number; samples: Float32Array } {
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a wav')
  const sampleRate = buf.readUInt32LE(24), bits = buf.readUInt16LE(34), ch = buf.readUInt16LE(22)
  if (bits !== 16 || ch !== 1) throw new Error('need 16-bit mono')
  let off = 12; while (buf.toString('ascii', off, off + 4) !== 'data') off += 8 + buf.readUInt32LE(off + 4)
  const n = buf.readUInt32LE(off + 4) / 2, out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(off + 8 + i * 2) / 32768
  return { sampleRate, samples: out }
}
export function frames80ms(s: Float32Array): Float32Array[] { const r: Float32Array[] = []; for (let i = 0; i + 1280 <= s.length; i += 1280) r.push(s.subarray(i, i + 1280)); return r }

// openWakeWord 파이프라인: 1280샘플 → mel(8프레임×32) → 76프레임 창마다 임베딩(96) → 최근 16개 임베딩 → 점수
export class WakeWordDetector {
  private mel: number[][] = []; private emb: number[][] = []
  constructor(private m: { mel: InferenceSession; emb: InferenceSession; cls: InferenceSession }, private T: typeof Tensor) {}
  async pushPcm16k(frame: Float32Array): Promise<number> {
    const melOut = await this.m.mel.run({ [this.m.mel.inputNames[0]!]: new this.T('float32', frame, [1, frame.length]) })
    const t = melOut[this.m.mel.outputNames[0]!]!; const d = t.data as Float32Array; const frames = t.dims[2]!, bins = t.dims[3]!
    for (let f = 0; f < frames; f++) this.mel.push(Array.from(d.subarray(f * bins, (f + 1) * bins), v => v / 10 + 2))
    while (this.mel.length >= 76) {
      const win = this.mel.slice(0, 76); this.mel.splice(0, 8)
      const e = await this.m.emb.run({ [this.m.emb.inputNames[0]!]: new this.T('float32', Float32Array.from(win.flat()), [1, 76, 32, 1]) })
      this.emb.push(Array.from(e[this.m.emb.outputNames[0]!]!.data as Float32Array)); if (this.emb.length > 16) this.emb.shift()
    }
    if (this.emb.length < 16) return 0
    const s = await this.m.cls.run({ [this.m.cls.inputNames[0]!]: new this.T('float32', Float32Array.from(this.emb.flat()), [1, 16, 96]) })
    return (s[this.m.cls.outputNames[0]!]!.data as Float32Array)[0]!
  }
}
```
`pnpm add -w onnxruntime-node`. 형상(dims)이 모델과 다르면 `inputMetadata`로 확인해 상수만 고친다.

- [ ] **Step 5: 녹음 도구** — `scripts/record-fixture.ts`: `jarvis-ear`에 `--dump <path.wav>` 플래그를 추가(Task 2의 헬퍼에 16kHz PCM16 WAV 저장)해 `fixtures/wake/hey-jarvis-01..10.wav`(각 2초)와 `fixtures/wake/negative-10min.wav`를 녹음. README에 녹음 방법. 픽스처는 커밋(10분 WAV ≈ 19MB → Git LFS 없이 커밋 가능하지만 크면 `fixtures/wake/negative-*.wav`는 gitignore하고 SHA만 커밋).

- [ ] **Step 6: 스파이크** — `scripts/spike-wake.ts`: 각 positive WAV를 `frames80ms`로 흘려 max score ≥ 0.5면 감지; negative 10분 클립에서 0.5 초과 구간(연속 프레임은 1회)을 오탐으로 센다. `appendVerification({metric:'감지/10 · 오탐/10분', value:'9 · 1', pass: hit>=9 && fp<=1})`.

- [ ] **Step 7: 실행·커밋** — `pnpm spike:wake` → `git commit -am "feat: add the deterministic wake-word spike over wav fixtures"`

---

### Task 6: `spike:tts` — ElevenLabs WS 첫 오디오 지연 + Yuna 폴백

**Files:**
- Create: `scripts/spike-tts.ts`, `packages/core/src/sentences.ts`, `packages/core/test/sentences.test.ts`
- Modify: `package.json` (`ws`, `@types/ws`)

**Interfaces:**
- Produces: `splitSentences(text: string): string[]` (소수점 보호, F-28) · `cutForSpeech(text: string, max = 240): {speak: string; rest: string}` (문장 경계 컷) · `normalizeForSpeech(s: string): string` (`58/93`→`93편 중 58편`, `27.6°`→`27.6도`, `18:00`→`오후 여섯 시`)

- [ ] **Step 1: 테스트** — `packages/core/test/sentences.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { cutForSpeech, normalizeForSpeech, splitSentences } from '../src/sentences.js'
describe('splitSentences', () => {
  it('소수점에서 안 자른다', () => { expect(splitSentences('오늘 최고 27.6도, 최저 18.2도입니다. 우산 챙기세요.')).toEqual(['오늘 최고 27.6도, 최저 18.2도입니다.', '우산 챙기세요.']) })
  it('물음표·느낌표', () => { expect(splitSentences('가실까요? 네!')).toEqual(['가실까요?', '네!']) })
})
describe('cutForSpeech', () => {
  it('240자 이내 마지막 문장 경계', () => { const s = '가나다. '.repeat(80); const { speak, rest } = cutForSpeech(s); expect(speak.length).toBeLessThanOrEqual(240); expect(speak.endsWith('.')).toBe(true); expect(rest.length).toBeGreaterThan(0) })
  it('짧으면 그대로', () => { expect(cutForSpeech('짧다.')).toEqual({ speak: '짧다.', rest: '' }) })
})
describe('normalizeForSpeech', () => {
  it('분수·도·시각', () => { expect(normalizeForSpeech('58/93 · 27.6° · 18:00')).toBe('93편 중 58편 · 27.6도 · 오후 여섯 시') })
})
```

- [ ] **Step 2: 실패 확인** → **Step 3: 구현** — `packages/core/src/sentences.ts`

```ts
const HOURS = ['열두', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '열한']
export function splitSentences(text: string): string[] {
  const out: string[] = []; let buf = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!; buf += c
    const isEnd = /[.!?]/.test(c) && !(c === '.' && /\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? ''))
    if (isEnd && /\s|$/.test(text[i + 1] ?? '')) { out.push(buf.trim()); buf = '' }
  }
  if (buf.trim()) out.push(buf.trim()); return out
}
export function cutForSpeech(text: string, max = 240): { speak: string; rest: string } {
  if (text.length <= max) return { speak: text, rest: '' }
  const parts = splitSentences(text); let speak = ''
  for (const p of parts) { if ((speak + ' ' + p).trim().length > max) break; speak = (speak + ' ' + p).trim() }
  if (!speak) speak = parts[0]!.slice(0, max)
  return { speak, rest: text.slice(text.indexOf(speak) + speak.length).trim() }
}
export function normalizeForSpeech(s: string): string {
  return s
    .replace(/(\d+)\s*\/\s*(\d+)/g, (_, a, b) => `${b}편 중 ${a}편`)
    .replace(/(\d+(?:\.\d+)?)\s*°/g, '$1도')
    .replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h, m) => { const hh = Number(h); const ap = hh < 12 ? '오전' : '오후'; const hk = HOURS[hh % 12]!; return Number(m) === 0 ? `${ap} ${hk} 시` : `${ap} ${hk} 시 ${Number(m)}분` })
}
```

- [ ] **Step 4: 스파이크** — `scripts/spike-tts.ts`

```ts
import WebSocket from 'ws'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { normalizeForSpeech } from '@jarvis/core'
import { appendVerification } from './lib/verification.js'

const text = normalizeForSpeech('오후 3시부터 비 올 확률이 70%입니다, 보스. 챙기시는 게 좋겠습니다.')
const key = process.env.ELEVENLABS_API_KEY, voice = process.env.ELEVENLABS_VOICE_ID
async function yuna() { const t0 = Date.now(); await new Promise(r => spawn('say', ['-v', 'Yuna', text], { stdio: 'inherit' }).on('exit', r)); return Date.now() - t0 }
if (!key || !voice) { const ms = await yuna(); appendVerification({ command: 'pnpm spike:tts', metric: 'Yuna 폴백(키 없음)', value: `${ms}ms 전체`, fixtureHash: '—', pass: true }); process.exit(0) }

const url = `wss://api.elevenlabs.io/v1/text-to-speech/${voice}/stream-input?model_id=eleven_flash_v2_5&output_format=mp3_44100_128`
const ws = new WebSocket(url, { headers: { 'xi-api-key': key } })
const chunks: Buffer[] = []; let t0 = 0, tFirst = 0
ws.on('open', () => { ws.send(JSON.stringify({ text: ' ', voice_settings: { stability: 0.5, similarity_boost: 0.8 } })); t0 = Date.now(); ws.send(JSON.stringify({ text: text + ' ', flush: true })); ws.send(JSON.stringify({ text: '' })) })
ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.audio) { if (!tFirst) tFirst = Date.now() - t0; chunks.push(Buffer.from(m.audio, 'base64')) } if (m.isFinal) ws.close() })
ws.on('close', async () => {
  writeFileSync('/tmp/jarvis-spike.mp3', Buffer.concat(chunks)); spawn('afplay', ['/tmp/jarvis-spike.mp3'], { stdio: 'inherit' })
  const pass = tFirst > 0 && tFirst <= 800
  appendVerification({ command: 'pnpm spike:tts', metric: '첫 오디오 ms(WS Flash v2.5)', value: String(tFirst), fixtureHash: '—', pass }); process.exit(pass ? 0 : 1)
})
ws.on('error', async (e) => { console.error('WS 오류 → Yuna 폴백', e.message); await yuna(); process.exit(1) })
```

- [ ] **Step 5: 실행** — `ELEVENLABS_API_KEY=… ELEVENLABS_VOICE_ID=… pnpm spike:tts`(키는 셸에서만) 그리고 키 없이 한 번 더 → 두 행. 커밋: `git commit -am "feat: add the tts spike with sentence splitting and speech normalization"`

---

### Task 7: `spike:cal` — che-ical-mcp 검증 설치와 오늘 일정

**Files:**
- Create: `scripts/spike-cal.ts`, `scripts/lib/che-ical.ts`
- Modify: `package.json` (`@modelcontextprotocol/sdk`)

- [ ] **Step 1: 릴리스 확인(수동)** — Run: `gh release view --repo PsychQuant/che-ical-mcp --json tagName,assets` · 자산 이름과 URL을 `scripts/lib/che-ical.ts`의 상수 `CHE_ICAL_VERSION`·`CHE_ICAL_ASSET_URL`로 적고, 내려받은 뒤 `shasum -a 256`으로 `CHE_ICAL_SHA256`을 고정한다(F-23).

- [ ] **Step 2: 설치 스크립트** — `scripts/lib/che-ical.ts`: 다운로드 → SHA-256 대조(불일치면 throw) → `codesign --verify --deep --strict <bin>` exit 0 확인 → `~/bin/CheICalMCP`(절대경로)로 복사 + `chmod +x` → `CheICalMCP --setup` 실행(권한 창은 사용자가 승인).

- [ ] **Step 3: MCP 클라이언트로 오늘 일정** — `scripts/spike-cal.ts`: `@modelcontextprotocol/sdk`의 `Client` + `StdioClientTransport({command: '/Users/ijunseo/bin/CheICalMCP'})` → `listTools()`로 도구명 확인 → `callTool({name: 'list_events', arguments: {...오늘 범위})`(정확한 인자명은 `listTools()` 결과의 inputSchema를 보고 맞춘다) → 결과 개수 출력 → `appendVerification({metric:'오늘 이벤트 수 · 해시/서명', value:'3 · OK', pass: true})`.

- [ ] **Step 4: 실행·커밋** — `pnpm spike:cal` → `git commit -am "feat: add the calendar spike that installs and verifies che-ical-mcp"`

---

### Task 8: `spike:hud` — 단일 투명 창 58fps

**Files:**
- Create: `apps/desktop/package.json`, `apps/desktop/tsconfig.json`, `apps/desktop/spike-hud/main.ts`, `apps/desktop/spike-hud/preload.ts`, `apps/desktop/spike-hud/index.html`, `scripts/spike-hud.ts`
- Modify: `package.json` (`electron` devDependency)

- [ ] **Step 1: 창 생성(F-26 상수)** — `apps/desktop/spike-hud/main.ts`

```ts
import { app, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'node:path'
app.whenReady().then(() => {
  const { bounds } = screen.getPrimaryDisplay()
  const win = new BrowserWindow({ ...bounds, transparent: true, frame: false, hasShadow: false, resizable: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') } })
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.loadFile(path.join(__dirname, 'index.html'))
  ipcMain.on('fps', (_e, avg: number) => { console.log(JSON.stringify({ fps: avg })); app.exit(avg >= 58 ? 0 : 1) })
})
```
`preload.ts`: `contextBridge.exposeInMainWorld('jarvis', { reportFps: (n: number) => ipcRenderer.send('fps', n) })`.
`index.html`: 디자인 캔버스 `design/Main.dc.html`의 코어 SVG(링 5개 + 발광)를 옮겨 넣고 CSS 애니메이션은 transform/opacity만, 60초간 rAF로 프레임을 세어 평균 fps를 `window.jarvis.reportFps()`. CSP 메타 `default-src 'self'; connect-src 'none'; style-src 'self' 'unsafe-inline'`.

- [ ] **Step 2: 실행 스크립트** — `scripts/spike-hud.ts`: `tsc -p apps/desktop`로 빌드 후 `electron apps/desktop/dist/spike-hud/main.js`를 spawn, stdout의 `{fps}`를 읽어 `appendVerification({metric:'평균 fps(60s)', value, pass: fps>=58})`.

- [ ] **Step 3: 실행·커밋** — `pnpm spike:hud`(60초 화면에 링이 돈다) → `git commit -am "feat: add the hud spike with the single transparent always-on-top window"`

---

### Task 9: 판정과 기록

- [ ] **Step 1:** `docs/verification.md`에 6행(+Yuna 폴백 1행)이 있는지 확인. 실패한 행은 명세 §11의 해당 D-항목에 트리거 발동으로 기록한다.
- [ ] **Step 2:** 메모리 `jarvis-voice-assistant.md`에 "0단계 결과: …" 한 줄.
- [ ] **Step 3:** 전부 통과면 `docs/03-plan-phase1a-voice-loop.md` 작성으로 넘어간다(writing-plans).
