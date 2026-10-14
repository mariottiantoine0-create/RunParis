// Perfect Run · Activité en direct (D-100) : la page web démarre, met à jour et termine la carte de l'écran verrouillé.
// JS : LiveRun.start(état), LiveRun.update(état), LiveRun.end(), LiveRun.watch({}, cb) → { action: "pause" | "resume" }.
import Foundation
import Capacitor
import ActivityKit

@objc(LiveRunPlugin)
public class LiveRunPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveRunPlugin"
    public let jsName = "LiveRun"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "watch", returnType: CAPPluginReturnCallback),
    ]
    private var activity: Any?
    private var watchId: String?
    private var last: [String: Any] = [:]
    private var lastStart = Date()      // départ du chrono (pauses déduites) au dernier état

    override public func load() {
        NotificationCenter.default.addObserver(forName: Notification.Name("LiveRunAction"), object: nil, queue: .main) { [weak self] n in
            guard let self = self else { return }
            let action = n.userInfo?["action"] as? String ?? ""
            self.optimistic(action) // la carte change tout de suite, la page confirme ensuite
            if let id = self.watchId, let call = self.bridge?.savedCall(withID: id) { call.resolve(["action": action]) }
        }
    }

    private func state(_ o: [String: Any]) -> Any? {
        guard #available(iOS 16.1, *) else { return nil }
        let secs = (o["elapsed"] as? Double) ?? Double((o["elapsed"] as? Int) ?? 0)
        let m = Int(secs) / 60, s = Int(secs) % 60, h = m / 60
        let clock = h > 0 ? String(format: "%d:%02d:%02d", h, m % 60, s) : String(format: "%d:%02d", m, s)
        return LiveRunAttributes.ContentState(
            head: o["head"] as? String ?? "Course libre", turn: o["turn"] as? String ?? "chrono",
            km: o["km"] as? String ?? "0,0 km", kmLabel: o["kmLabel"] as? String ?? "faits", pace: o["pace"] as? String ?? "–",
            paused: o["paused"] as? Bool ?? false, start: Date().addingTimeInterval(-secs), elapsed: clock,
            progress: (o["progress"] as? Double) ?? -1)
    }

    private func optimistic(_ action: String) {
        guard !last.isEmpty else { return }
        let paused = last["paused"] as? Bool ?? false
        let secs = paused ? ((last["elapsed"] as? Double) ?? Double((last["elapsed"] as? Int) ?? 0)) : Date().timeIntervalSince(lastStart)
        var o = last; o["elapsed"] = secs; o["paused"] = action == "pause"; o["head"] = action == "pause" ? "En pause" : (o["runHead"] ?? o["head"] ?? "")
        o["turn"] = action == "pause" ? "pause" : (o["runTurn"] ?? o["turn"] ?? "chrono")
        push(o)
    }

    private func push(_ o: [String: Any]) {
        guard #available(iOS 16.2, *), let a = activity as? Activity<LiveRunAttributes>, let st = state(o) as? LiveRunAttributes.ContentState else { return }
        lastStart = st.start; last = o
        Task { await a.update(ActivityContent(state: st, staleDate: nil)) }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(["ok": false, "error": "iOS 16.2 minimum"]); return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { call.resolve(["ok": false, "error": "Activités en direct désactivées dans Réglages"]); return }
        let o = call.options as? [String: Any] ?? [:]; last = o
        guard let st = state(o) as? LiveRunAttributes.ContentState else { call.resolve(["ok": false, "error": "état illisible"]); return }
        Task {
            // on termine d'abord les cartes restées d'une course précédente (app fermée en pleine course), sinon iOS peut refuser la nouvelle
            for a in Activity<LiveRunAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
            do {
                let act = try Activity.request(attributes: LiveRunAttributes(mode: o["mode"] as? String ?? "solo"), content: ActivityContent(state: st, staleDate: nil), pushType: nil)
                self.activity = act; self.lastStart = st.start
                call.resolve(["ok": true, "id": act.id])
            } catch { call.resolve(["ok": false, "error": "\(error)"]) }
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        let o = call.options as? [String: Any] ?? [:]; last = o; push(o); call.resolve()
    }

    @objc func end(_ call: CAPPluginCall) {
        last = [:]
        if #available(iOS 16.2, *) { for a in Activity<LiveRunAttributes>.activities { Task { await a.end(nil, dismissalPolicy: .immediate) } } }
        activity = nil; call.resolve()
    }

    @objc func watch(_ call: CAPPluginCall) {
        call.keepAlive = true; bridge?.saveCall(call); watchId = call.callbackId
    }
}
