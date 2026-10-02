# RunParis

Génère des parcours de course à pied dans Paris en quelques secondes : la distance voulue, le dénivelé voulu, en évitant les quartiers ou lieux de ton choix et en limitant les feux rouges.

**Site :** _(lien Netlify à ajouter)_

## Ce que fait l'app

- **Trois arrivées** : retour au départ (boucle), un lieu précis (A → B), ou n'importe où (aller simple, qui peut finir à une station de métro ou RER pour rentrer).
- **Distance ou durée**, dénivelé plat / normal / vallonné, feux rouges limités ou évités au maximum.
- **Trois types de parcours** : Classique, Vert (parcs et rues arborées), Découverte (monuments et lieux connus). On peut aussi imposer jusqu'à 5 lieux de passage.
- **À éviter** : arrondissements, quartiers, lieux ; gares, quais et cimetières évités par défaut ; parcs et jardins fermés à l'heure de départ choisie (horaires indicatifs).
- **Jusqu'à 3 propositions** par recherche, nommées par ce qui les distingue (le moins de feux, le plus plat…).
- **16 courses officielles** (Marathon, Semi, 20 km de Paris, Urban Trail de Montmartre, 10 km de la Tour Eiffel…) à voir, exporter ou courir en partie.
- **Points d'eau** : fontaines du parcours avec leur kilomètre, option « un point d'eau environ tous les 3 km ».
- **Carte** : fontaines à eau et arbres le long du parcours, stations de métro et RER, rues empruntées deux fois sur des voies séparées, profil altimétrique.
- **De nuit** : heure de départ, parcs fermés contournés, rues éclairées privilégiées.
- **Retours** : bouton « Signaler un problème » (Netlify Forms), statistiques de visite anonymes sans cookie (GoatCounter).
- **Export GPX** pour une montre ou Strava. Thème clair / sombre. Ordinateur et téléphone.

Tout le calcul se fait dans le navigateur : pas de serveur, pas de compte, rien n'est envoyé.

## Organisation du dépôt

```
site/              ce que Netlify publie
  index.html       page d'accueil (générée par src/build.py)
  app.html         l'application (générée par src/build.py)
  graph.bin        réseau des rues de Paris (47 000 carrefours, 63 000 tronçons, altitudes)
  meta.json        noms de rues, quartiers, gares, cimetières, lieux, fond de carte
  green.txt        part « verte » de chaque tronçon
  trees.txt        159 000 arbres
  metro.json       271 stations de métro et RER
  fountains.json   1 088 fontaines à eau potable
  parks.json       243 parcs et jardins fermés la nuit (tronçons concernés, horaires)
  dark.txt         tronçons non éclairés (1 bit par tronçon)
  races.json       tracés des courses officielles
  sights.json      52 lieux connus (mode Découverte)
src/
  engine.js        moteur de calcul des parcours
  app_head.html    structure et styles de la page
  app.js           interface
  landing.html     modèle de la page d'accueil
  hero.json        carte de Paris et parcours dessinés sur la page d'accueil
  build.py         assemble site/app.html et site/index.html
netlify.toml       réglages Netlify (dossier publié, cache)
```

## Mettre à jour le site

1. Modifier les fichiers de `src/`, puis lancer `python3 src/build.py` depuis la racine.
2. Dans GitHub Desktop : écrire un message, **Commit to main**, puis **Push origin**.
3. Netlify publie la nouvelle version automatiquement, en une minute environ.

## Sources des données

- Rues, éclairage, arbres, fontaines, parcs, stations, gares : © contributeurs [OpenStreetMap](https://www.openstreetmap.org/copyright), licence ODbL.
- Altitudes : IGN, RGE ALTI.
- Quartiers, arrondissements, jardins clôturés : Paris Open Data. Horaires : OpenStreetMap, sinon horaires types des jardins de la Ville de Paris.
- Tracés des courses : organisateurs (10kmtoureiffel.fr), WeRun, The Post Trace.

Projet d'Antoine Mariotti. Le suivi produit (spec, décisions, backlog, recette) est tenu dans Notion.
