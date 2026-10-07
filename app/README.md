# RunParis — application iPhone (essai, D-85)

Le même code que le site (`../site/app.html`), emballé avec Capacitor, avec les modules du téléphone :
position écran verrouillé (mode course), écran gardé allumé, menu de partage (GPX, image, lien), police embarquée (hors connexion).

## Lancer l'app sur ton iPhone (compte Apple gratuit)
1. Ouvre `ios/App/App.xcodeproj` dans Xcode.
2. Projet **App** → onglet **Signing & Capabilities** → **Team** : choisis ton identifiant Apple (Personal Team).
3. Branche l'iPhone, choisis-le en haut de Xcode, puis ▶ (Run).
4. Sur l'iPhone, la première fois : Réglages → Général → VPN et gestion de l'appareil → faire confiance à ton identifiant ; et activer le Mode développeur si l'iPhone le demande.
Avec un compte gratuit, l'app fonctionne 7 jours ; relance-la depuis Xcode pour la renouveler.

## Mettre à jour l'app après un changement du site (fait par Claude)
`node copy-web.js && npx cap sync ios` (copie `../site` dans l'app), puis ▶ dans Xcode.
