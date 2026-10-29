// jarvis-loc — CoreLocation 으로 현재 위치를 한 번 얻어 JSON 한 줄로 출력한다. 권한이 없으면 {"error":"DENIED"}.
import CoreLocation
import Foundation

final class Once: NSObject, CLLocationManagerDelegate {
    let m = CLLocationManager()
    func run() {
        m.delegate = self
        FileHandle.standardError.write("servicesEnabled=\(CLLocationManager.locationServicesEnabled()) status=\(m.authorizationStatus.rawValue)\n".data(using: .utf8)!)
        m.desiredAccuracy = kCLLocationAccuracyHundredMeters
        m.requestWhenInUseAuthorization()
        m.requestLocation()
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        FileHandle.standardError.write("auth changed → \(manager.authorizationStatus.rawValue)\n".data(using: .utf8)!)
        if manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorized { manager.requestLocation() }
        switch manager.authorizationStatus {
        case .denied, .restricted: out(["error": "DENIED"]); exit(2)
        default: break
        }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let l = locations.last else { return }
        out(["lat": l.coordinate.latitude, "lon": l.coordinate.longitude, "accuracy_m": l.horizontalAccuracy, "at": ISO8601DateFormatter().string(from: l.timestamp)])
        exit(0)
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { out(["error": "FAILED", "detail": "\(error)"]); exit(3) }
}
func out(_ o: [String: Any]) { if let d = try? JSONSerialization.data(withJSONObject: o), let s = String(data: d, encoding: .utf8) { print(s); fflush(stdout) } }

let once = Once()
once.run()
DispatchQueue.main.asyncAfter(deadline: .now() + 12) { out(["error": "TIMEOUT"]); exit(4) }
RunLoop.main.run()
