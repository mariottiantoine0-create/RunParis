"""Construit le site à partir des sources (src/). Lancer depuis la racine : python3 src/build.py
- site/app.html   : l'application (interface + moteur)
- site/index.html : la page d'accueil (modèle landing.html + carte de hero.json)
"""
import hashlib, json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'src'
rd = lambda f: (src / f).read_text(encoding='utf-8')

# 1. application
meta = ('<!doctype html>\n<html lang="fr">\n<meta charset="utf-8">\n'
        '<meta name="description" content="RunParis génère des parcours de course dans Paris : distance, dénivelé, feux rouges, quartiers à éviter, parcs, métro pour rentrer, parcours mythiques à courir en entier ou en partie.">\n'
        '<meta name="theme-color" content="#0D1014">\n'
        '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 rx=%277%27 fill=%27%230D1014%27/%3E%3Cpath d=%27M7 24c4-1 4-7 9-8s6-6 9-9%27 fill=%27none%27 stroke=%27%234CC3FF%27 stroke-width=%273.2%27 stroke-linecap=%27round%27/%3E%3C/svg%3E">\n')
app = meta + (rd('app_head.html') + rd('app.js')).replace('/*ENGINE*/', rd('engine.js'))
# version des données : change dès qu'un fichier de données change, pour que le navigateur recharge la nouvelle version
h = hashlib.sha1()
for f in ['meta.json', 'graph.bin', 'green.txt', 'races.json', 'sights.json', 'metro.json', 'trees.txt', 'fountains.json', 'parks.json', 'dark.txt']:
    h.update((root / 'site' / f).read_bytes())
app = app.replace("'__DATAV__'", "'?v=%s'" % h.hexdigest()[:8])
(root / 'site' / 'app.html').write_text(app, encoding='utf-8')

# 2. page d'accueil
h = json.loads(rd('hero.json'))
t = rd('landing.html')
rep = {'VB': '640 118 640 400', 'GREEN': h['green'], 'WATER': h['water'], 'MINOR': h['minor'], 'C1': h['c1'], 'C2': h['c2'], 'C3': h['c3'],
       'ROUTE': h['route'], 'RLEN': '1000', 'KM': '', 'SX': str(h['start'][0]), 'SY': str(h['start'][1]), 'REALM': str(round(h['len']))}
for k, v in rep.items(): t = t.replace('{{%s}}' % k, v)
t = t.replace("// km markers appear", "if (matchMedia('(max-width: 760px)').matches) document.querySelector('.map svg').setAttribute('viewBox', '941 147 371 290');\n// km markers appear")
assert '{{' not in t
(root / 'site' / 'index.html').write_text(t, encoding='utf-8')
print('site/app.html', len(app), '· site/index.html', len(t))
