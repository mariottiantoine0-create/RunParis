# Données d'une ville (Perfect Run, D-97)

Chaîne utilisée pour Lyon, à refaire pour Bordeaux et Marseille (un fichier `<ville>.json` par ville : bbox, communes INSEE, grille d'altitudes, réseau de transport).

1. Extrait OSM de la région (Geofabrik), découpé à la bbox de la ville.
2. Grille d'altitudes IGN (RGE ALTI, WMS data.geopf.fr, float32).
3. `python3 osm.py lyon.json` : voies, feux, éclairage, arbres, points, parcs, eau, cimetières, gares, lignes, limites.
4. `python3 graph.py lyon.json` : graphe brut (ville + communes limitrophes, marge 40 m), altitudes.
5. `python3 build.py lyon.json` : graph.bin + meta.json (zones = arrondissements + communes).
6. `python3 prep.py lyon.json` : éclairage, arbres, fontaines, parcs, lieux, métro, polygones des zones, fonds de carte.
7. Dans `work/` : `node green.js`, `mklit.js`, `mkparks.js`, `mkfont.js`, `mkmetro_trees.js`, `sights_<ville>.js`.
8. `excl/` : voies privées (`private_scan.py`, `private_match.js`) puis lieux toujours évités (`excl_scan.py` … `excl_final.js`).
9. Copier `work/pub/*` dans `site/<ville>/`, ajouter la ville dans `CITIES` (src/app.js), `CITY_DIRS` (src/build.py) et copy-web.js.
10. Tram (D-98) : `python3 ../tram.py <extrait.osm.pbf> ../../site/<ville> "<network OSM>"` ajoute les lignes de tram à metro.json (Paris : réseau « Tramway d'Île de France » avec idf.osm.pbf ; Lyon : « TCL »).
