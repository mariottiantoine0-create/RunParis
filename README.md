# RunParis

Génère des parcours de course à pied dans Paris en quelques secondes : la distance voulue, le dénivelé voulu, en évitant les quartiers ou lieux de ton choix et en limitant les feux rouges.

**Site :** _(lien Netlify à ajouter)_

## Ce que fait l'app

- **Trois arrivées** : retour au départ (boucle), un lieu précis (A → B), ou n'importe où (aller simple, qui peut finir à une station de métro ou RER pour rentrer).
- **Distance ou durée**, dénivelé plat / normal / vallonné, feux rouges limités ou évités au maximum.
- **Trois types de parcours** : Classique, Vert (parcs et rues arborées), Découverte (monuments et lieux connus). On peut aussi imposer jusqu'à 5 lieux de passage.
- **À éviter** : arrondissements, quartiers, lieux ; gares, quais et cimetières évités par défaut.
- **Jusqu'à 3 propositions** par recherche, nommées par ce qui les distingue (le moins de feux, le plus plat…).
- **16 courses officielles** (Marathon, Semi, 20 km de Paris, Urban Trail de Montmartre, 10 km de la Tour Eiffel…) à voir, exporter ou courir en partie.
- **Carte** : arbres le long du parcours, stations de métro et RER, rues empruntées deux fois sur des voies séparées, profil altimétrique.
- **Export GPX** pour une montre ou Strava. Thème clair / sombre. Ordinateur et téléphone.

Tout le calcul se fait dans le navigateur : pas de serveur, pas de compte, rien n'est envoyé.

## Organisation du dépôt

```
site/              ce que Netlify publie
  index.html       l'app (générée par src/build.py)
  graph.bin        réseau des rues de Paris (47 000 carrefours, 63 000 tronçons, altitudes)
  meta.json        noms de rues, quartiers, gares, cimetières, lieux, fond de carte
  green.txt        part « verte » de chaque tronçon
  trees.txt        159 000 arbres
  metro.json       271 stations de métro et RER
  races.json       tracés des courses officielles
  sights.json      52 lieux connus (mode Découverte)
src/
  engine.js        moteur de calcul des parcours
  app_head.html    structure et styles de la page
  app.js           interface
  build.py         assemble site/index.html
netlify.toml       réglages Netlify (dossier publié, cache)
```

## Mettre à jour le site

1. Modifier les fichiers de `src/`, puis lancer `python3 src/build.py` depuis la racine.
2. Dans GitHub Desktop : écrire un message, **Commit to main**, puis **Push origin**.
3. Netlify publie la nouvelle version automatiquement, en une minute environ.

## Sources des données

- Rues, arbres, parcs, stations, gares : © contributeurs [OpenStreetMap](https://www.openstreetmap.org/copyright), licence ODbL.
- Altitudes : IGN, RGE ALTI.
- Quartiers et arrondissements : Paris Open Data.
- Tracés des courses : organisateurs (10kmtoureiffel.fr), WeRun, The Post Trace.

Projet d'Antoine Mariotti. Le suivi produit (spec, décisions, backlog, recette) est tenu dans Notion.
