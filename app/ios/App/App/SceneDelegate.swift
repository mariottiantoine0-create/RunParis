import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // RunParis (D-86) : fond de carte du design system derrière la page pendant son chargement, pour éviter un flash blanc
        let mapBg = UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(red: 0x12 / 255.0, green: 0x14 / 255.0, blue: 0x17 / 255.0, alpha: 1)
                : UIColor(red: 0xF4 / 255.0, green: 0xF4 / 255.0, blue: 0xF2 / 255.0, alpha: 1)
        }
        window = UIWindow(windowScene: windowScene)
        window?.backgroundColor = mapBg
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()
        if let webView = (window?.rootViewController as? CAPBridgeViewController)?.webView {
            webView.backgroundColor = mapBg
            webView.scrollView.backgroundColor = mapBg
        }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
