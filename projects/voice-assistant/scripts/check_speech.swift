import Foundation
import Speech

let sem = DispatchSemaphore(value: 0)
Task {
    if #available(macOS 26.0, *) {
        let supported = await SpeechTranscriber.supportedLocales
        let ids = supported.map { $0.identifier(.bcp47) }.sorted()
        print("supported count:", ids.count)
        print("korean:", ids.filter { $0.lowercased().hasPrefix("ko") })
        let installed = await SpeechTranscriber.installedLocales
        print("installed:", installed.map { $0.identifier(.bcp47) }.sorted())
    } else {
        print("macOS < 26")
    }
    sem.signal()
}
sem.wait()
