"""Construit site/index.html à partir des sources (src/). Lancer depuis la racine : python3 src/build.py"""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'src'
head = (src / 'app_head.html').read_text(encoding='utf-8')
app = (src / 'app.js').read_text(encoding='utf-8')
engine = (src / 'engine.js').read_text(encoding='utf-8')
meta = ('<!doctype html>\n<html lang="fr">\n<meta charset="utf-8">\n'
        '<meta name="description" content="RunParis génère des parcours de course dans Paris : distance, dénivelé, feux rouges, quartiers à éviter, parcs, métro pour rentrer, tracés des courses officielles.">\n'
        '<meta name="theme-color" content="#0D1014">\n'
        '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 rx=%277%27 fill=%27%230D1014%27/%3E%3Cpath d=%27M7 24c4-1 4-7 9-8s6-6 9-9%27 fill=%27none%27 stroke=%27%234CC3FF%27 stroke-width=%273.2%27 stroke-linecap=%27round%27/%3E%3C/svg%3E">\n')
out = meta + (head + app).replace('/*ENGINE*/', engine)
(root / 'site' / 'index.html').write_text(out, encoding='utf-8')
print('site/index.html :', len(out), 'caractères')
