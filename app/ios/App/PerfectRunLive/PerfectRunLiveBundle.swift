// PerfectRun · extension « PerfectRunLive » : seulement l'Activité en direct de la course (D-100).
import WidgetKit
import SwiftUI

@main
struct PerfectRunLiveBundle: WidgetBundle {
    var body: some Widget {
        PerfectRunLiveLiveActivity() // extension en iOS 16.2 minimum
    }
}
