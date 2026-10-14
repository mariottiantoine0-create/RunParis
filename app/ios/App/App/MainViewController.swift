// Perfect Run · contrôleur principal : enregistre les plugins propres à l'app (D-100).
import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LiveRunPlugin())
    }
}
