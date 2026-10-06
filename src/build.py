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
        '<meta name="description" content="RunParis génère des parcours de course dans Paris et les communes voisines : distance, dénivelé, feux rouges, quartiers à éviter, parcs, métro pour rentrer, parcours mythiques à courir en entier ou en partie.">\n'
        '<meta name="theme-color" content="#F4F4F2" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="#0F1114" media="(prefers-color-scheme: dark)">\n'
        '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 rx=%274%27 fill=%27%231F4FE0%27/%3E%3Cpath d=%27M7 24c4-1 4-7 9-8s6-6 9-9%27 fill=%27none%27 stroke=%27%23FFFFFF%27 stroke-width=%273.2%27 stroke-linecap=%27square%27/%3E%3C/svg%3E">\n')
app = meta + (rd('app_head.html') + rd('app.js')).replace('/*ENGINE*/', rd('engine.js'))
# version des données : change dès qu'un fichier de données change, pour que le navigateur recharge la nouvelle version
h = hashlib.sha1()
for f in ['meta.json', 'graph.bin', 'green.txt', 'races.json', 'sights.json', 'metro.json', 'trees.txt', 'fountains.json', 'parks.json', 'dark.txt', 'private.txt']:
    h.update((root / 'site' / f).read_bytes())
app = app.replace("'__DATAV__'", "'?v=%s'" % h.hexdigest()[:8])
# sur le site, le logo ramène à l'accueil (pas d'accueil dans l'artifact)
app = app.replace('<div class="logo" aria-label="RunParis">RUN<span>PARIS</span></div>', '<a class="logo" href="./" aria-label="RunParis, retour à l’accueil" title="Retour à l’accueil">RUN<span>PARIS</span></a>')
(root / 'site' / 'app.html').write_text(app, encoding='utf-8')

# --- cartes « Parcours mythiques » de l'accueil (D-70) ---
def myth_cards(races):
    import math, json as _j
    pick = [('marathon', 'Long'), ('semi', 'Semi'), ('paris20', 'Long'), ('chateau-vincennes', 'Bois'), ('paris-centre', '10 km'), ('trail-butte', 'Trail')]
    out = []
    for rid, cat in pick:
        r = next((x for x in races if x['id'] == rid), None)
        if not r: continue
        g = r['geom']; g = _j.loads(g) if isinstance(g, str) else g
        k = math.cos(math.radians(48.86)); pts = [(lo * k, -la) for la, lo in g]
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        W, H, pad = 110, 80, 9
        sc = min((W - 2 * pad) / ((x1 - x0) or 1), (H - 2 * pad) / ((y1 - y0) or 1)); ox = (W - (x1 - x0) * sc) / 2; oy = (H - (y1 - y0) * sc) / 2
        P = [((x - x0) * sc + ox, (y - y0) * sc + oy) for x, y in pts]
        d = 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in P)
        km = float(r['official']); kmt = (f'{km:.1f}'.replace('.', ',') if km % 1 else f'{km:.0f}') + ' km'
        meta = kmt  # D+ affiché dans l'app (calculé sur la trace)
        svg = f'<svg viewBox="0 0 {W} {H}" aria-hidden="true"><path class="tr-c" d="{d}"/><path class="tr" d="{d}"/><circle class="tr-d" cx="{P[0][0]:.1f}" cy="{P[0][1]:.1f}" r="4.5"/></svg>'
        out.append(f'<a class="myth" href="app.html?race={rid}">{svg}<div><small>{cat}</small><b>{r["name"]}</b><span>{meta}</span></div></a>')
    return '\n        '.join(out)

# 2. page d'accueil
h = json.loads(rd('hero.json'))
t = rd('landing.html')
rep = {'VB': '640 118 640 400', 'GREEN': h['green'], 'WATER': h['water'], 'MINOR': h['minor'], 'C1': h['c1'], 'C2': h['c2'], 'C3': h['c3'],
       'ROUTE': h['route'], 'RLEN': '1000', 'KM': '', 'SX': str(h['start'][0]), 'SY': str(h['start'][1]), 'REALM': str(round(h['len'])), 'MYTH': myth_cards(json.loads((root / 'site' / 'races.json').read_text(encoding='utf-8')))}
for k, v in rep.items(): t = t.replace('{{%s}}' % k, v)
t = t.replace("// km markers appear", "if (matchMedia('(max-width: 760px)').matches) document.querySelector('.map svg').setAttribute('viewBox', '941 147 371 290');\n// km markers appear")
assert '{{' not in t
(root / 'site' / 'index.html').write_text(t, encoding='utf-8')
# ancienne accueil gardée comme page explicative (D-71)
a = rd('a-propos.html')
for k, v in rep.items(): a = a.replace('{{%s}}' % k, v)
a = a.replace("// km markers appear", "if (matchMedia('(max-width: 760px)').matches) document.querySelector('.map svg').setAttribute('viewBox', '941 147 371 290');\n// km markers appear")
assert '{{' not in a
(root / 'site' / 'a-propos.html').write_text(a, encoding='utf-8')
print('site/app.html', len(app), '· site/index.html', len(t))
