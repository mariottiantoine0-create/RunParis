// Perfect Run · Activité en direct (D-100) : données et action partagées par l'app et l'extension PerfectRunLive.
// Ce fichier existe en deux copies identiques : App/LiveRunShared.swift et PerfectRunLive/LiveRunShared.swift.
import Foundation
import ActivityKit
import AppIntents

@available(iOS 16.1, *)
struct LiveRunAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var head: String        // « Course libre », « En pause », « À droite dans 90 m · Rue Saint-Jérôme »
        var turn: String        // icône de tête : chrono, right, left, straight, pause
        var km: String          // « 3,2 km »
        var kmLabel: String     // « faits », « faits sur 6,2 »
        var pace: String        // « 5:31 »
        var paused: Bool
        var start: Date         // départ du chrono, pauses déduites (le temps défile seul)
        var elapsed: String     // temps figé pendant la pause
        var progress: Double    // 0…1 en suivi d'un parcours, -1 en course libre
    }
    var mode: String            // « solo » ou « route »
}

// Bouton Pause / Reprendre de la carte (iOS 17) : exécuté dans l'app, qui prévient la page web.
@available(iOS 17.0, *)
struct LiveRunToggleIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Pause ou reprise de la course"
    static var isDiscoverable: Bool = false
    @Parameter(title: "Action") var action: String
    init() { action = "pause" }
    init(action: String) { self.action = action }
    func perform() async throws -> some IntentResult {
        await MainActor.run { NotificationCenter.default.post(name: Notification.Name("LiveRunAction"), object: nil, userInfo: ["action": action]) }
        return .result()
    }
}
