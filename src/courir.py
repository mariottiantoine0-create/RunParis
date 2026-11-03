# Pages « Courir à <ville> » (SEO, 3/11) : une page par ville, construite depuis ses données.
# Boucles et cartes précalculées par src/courir/boucles.js (→ src/courir/boucles.json).
# Elles reprennent l'en-tête, le pied de page et les styles d'aide.html (déjà passée au SEO).
import html, json, math, re, struct, urllib.parse
SITE = 'https://perfectrun.fr'
APP_STORE = 'https://apps.apple.com/fr/app/id6820428780'
CAT = {'10': '10 km', 'long': 'Long', 'semi': 'Semi', 'bois': 'Bois', 'trail': 'Trail'}
# noms de parcs sans accents dans certaines sources
ACC = {'Coulee': 'Coulée', 'Rene': 'René', 'Pre': 'Pré', 'Arenes': 'Arènes', 'Ile': 'Île', 'Etienne': 'Étienne', 'Eglise': 'Église'}
PAS_POUR_COURIR = ('omnisport', 'stade', 'complexe sportif', 'cimeti', 'campus')
CSS = """
.cv{max-width:1080px;margin:0 auto;padding:112px 24px 72px}
.cv .crumb{font-weight:600;font-size:15px;color:var(--muted);margin:0 0 14px}
.cv .crumb a{color:var(--muted);text-decoration:none}
.cv .crumb a:hover{color:var(--ink)}
.cv h1{font-stretch:75%;font-weight:800;font-size:clamp(44px,6vw,72px);line-height:.95;margin:0 0 14px}
.cv h1 em{font-style:normal;color:var(--accent)}
.cv .lead{color:var(--muted);font-size:clamp(17px,1.5vw,19px);line-height:1.45;max-width:38em;margin:0 0 24px}
.cv .ctas{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 32px}
.cv h2{font-stretch:75%;font-weight:800;font-size:clamp(30px,3.4vw,40px);line-height:1;margin:64px 0 8px}
.cv .sub{color:var(--muted);margin:0 0 24px;max-width:40em}
.cv .sec-top{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:64px 0 8px}
.cv .sec-top h2{margin:0}
.cv .more{display:inline-flex;align-items:center;gap:6px;font-weight:700;color:var(--accent);text-decoration:none;font-size:16px}
.cv .more:hover{text-decoration:underline;text-underline-offset:4px}
.cv .more svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:square;stroke-linejoin:miter}
.loops{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.loop{background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden;display:flex;flex-direction:column}
.loop .lm{aspect-ratio:16/10;background:var(--bg);border-bottom:1px solid var(--line)}
.loop .lm svg{width:100%;height:100%;display:block}
.loop .lm path,.loop .lm circle{vector-effect:non-scaling-stroke}
.loop .lm .m-route{stroke-dasharray:none;stroke-dashoffset:0;animation:none;stroke-width:3.5}
.loop .lm .m-route-case{stroke-width:7}
.loop .lm .m-minor{stroke-width:.6}.loop .lm .m-major{stroke-width:1.4}.loop .lm .m-start{stroke-width:2.5}
.loop .lb{padding:14px 16px 16px;display:flex;flex-direction:column;gap:10px;flex:1}
.loop small{font-weight:700;font-size:13px;color:var(--accent)}
.loop h3{font-size:18px;line-height:1.2;margin:2px 0 0}
.loop dl{display:flex;gap:18px;margin:0}
.loop dt{font-size:12px;font-weight:700;color:var(--muted)}
.loop dd{margin:0;font-weight:800;font-size:18px;font-stretch:75%}
.loop .la{display:flex;gap:8px;margin-top:auto}
.loop .la .btn{height:44px;font-size:15px;padding:0 14px;flex:1}
.loop .la .btn.secondary{flex:0 0 auto}
.parks{display:grid;grid-template-columns:repeat(4,1fr);gap:0 24px;margin:0;padding:0;list-style:none}
.parks li{border-top:2px solid var(--ink);padding:10px 0 18px}
.parks b{display:block;font-size:16px;line-height:1.25}
.parks span{font-size:14px;color:var(--muted);font-weight:600}
.myths{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:20px}
.myth{display:flex;gap:14px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px;text-decoration:none;color:inherit;transition:border-color .12s}
.myth:hover{border-color:var(--ink)}
.myth svg{flex:none;width:110px;height:80px;background:var(--bg);border-radius:4px}
.myth .tr-c{fill:none;stroke:var(--panel);stroke-width:5.4;stroke-linejoin:round;stroke-linecap:round}
.myth .tr{fill:none;stroke:var(--accent);stroke-width:2.4;stroke-linejoin:round;stroke-linecap:round}
.myth .tr-d{fill:var(--accent);stroke:var(--panel);stroke-width:2}
.myth small{display:block;font-weight:700;font-size:12px;color:var(--muted)}
.myth b{display:block;font-size:16px;line-height:1.2;margin:2px 0 4px}
.myth span{font-stretch:75%;font-weight:800;font-size:20px}
.faq{max-width:760px}
.faq h3{font-size:18px;margin:22px 0 6px}
.faq p{margin:0;color:var(--muted);line-height:1.55}
.others{display:flex;flex-wrap:wrap;gap:8px 18px;margin:0;padding:0;list-style:none}
.others a{color:var(--accent);font-weight:700;text-decoration:none}
.others a:hover{text-decoration:underline;text-underline-offset:4px}
.cv .facts{margin-top:8px}
@media (max-width:900px){.loops{grid-template-columns:1fr}.parks,.myths{grid-template-columns:1fr 1fr}}
@media (max-width:760px){.cv{padding:84px 16px 56px}.cv .ctas .btn{width:100%}.cv h2,.cv .sec-top{margin-top:48px}.myths{grid-template-columns:1fr;gap:10px}.myth svg{width:96px;height:70px}}
"""
ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>'

def nb(n): return f'{n:,}'.replace(',', ' ')
def fkm(m): return f'{m / 1000:.1f}'.replace('.', ',') + ' km'
def esc(s): return html.escape(s, quote=True)
def accents(n): return ' '.join(ACC.get(w, w) for w in n.split(' '))

def myth_card(r, cid):
    g = r['geom']; g = json.loads(g) if isinstance(g, str) else g
    k = math.cos(math.radians(g[0][0])); pts = [(lo * k, -la) for la, lo in g]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    W, H, pad = 110, 80, 9
    sc = min((W - 2 * pad) / ((x1 - x0) or 1), (H - 2 * pad) / ((y1 - y0) or 1)); ox = (W - (x1 - x0) * sc) / 2; oy = (H - (y1 - y0) * sc) / 2
    P = [((x - x0) * sc + ox, (y - y0) * sc + oy) for x, y in pts]
    d = 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in P)
    km = float(r['official']); kmt = (f'{km:.1f}'.replace('.', ',') if km % 1 else f'{km:.0f}') + ' km'
    svg = f'<svg viewBox="0 0 {W} {H}" aria-hidden="true"><path class="tr-c" d="{d}"/><path class="tr" d="{d}"/><circle class="tr-d" cx="{P[0][0]:.1f}" cy="{P[0][1]:.1f}" r="4.5"/></svg>'
    href = f'app.html?race={r["id"]}' + ('' if cid == 'paris' else '&ville=' + cid)
    return f'<a class="myth" href="{href}">{svg}<div><small>{CAT.get(r.get("cat"), "Course")}</small><b>{esc(r["name"])}</b><span>{kmt}</span></div></a>'

def gpx(name, ll):
    pts = ''.join(f'<trkpt lat="{la}" lon="{lo}"/>' for la, lo in ll)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="PerfectRun" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>{esc(name)}</name><link href="{SITE}/"><text>PerfectRun</text></link></metadata><trk><name>{esc(name)}</name><trkseg>{pts}</trkseg></trk></gpx>\n'

def build_city_pages(root, city_names):
    src = root / 'src' / 'courir'
    dep = json.loads((src / 'departs.json').read_text(encoding='utf-8'))
    loops = json.loads((src / 'boucles.json').read_text(encoding='utf-8'))
    aide = (root / 'site' / 'aide.html').read_text(encoding='utf-8')
    head0, foot = aide[:aide.index('<main')], aide[aide.index('</main>'):]
    head0 = re.sub(r'<script type="application/ld\+json">.*?</script>\n?', '', head0, flags=re.S)
    head0 = head0.replace('</style>', CSS + '</style>', 1)
    (root / 'site' / 'gpx').mkdir(exist_ok=True)
    done = []
    for d, name, cid in city_names:
        if cid not in dep or cid not in loops: continue
        c, site = dep[cid], root / 'site' / d
        meta = json.loads((site / 'meta.json').read_text(encoding='utf-8')); buf = (site / 'graph.bin').read_bytes()
        nE, o = meta['nE'], meta['offs']; el = struct.unpack_from('<%dH' % nE, buf, o[7])
        km = sum(el) / 2000
        feux = len(set(struct.unpack_from('<%dH' % meta['nN'], buf, o[3])) - {0})
        font = len(json.loads((site / 'fountains.json').read_text(encoding='utf-8')))
        parks = json.loads((site / 'parks.json').read_text(encoding='utf-8'))
        races = json.loads((site / 'races.json').read_text(encoding='utf-8'))
        pk = sorted(({'n': accents(p['n']), 'L': sum(el[i] for i in p['e']) / 2} for p in parks), key=lambda x: -x['L'])
        pk = [p for p in pk if p['L'] >= 500 and not any(w in p['n'].lower() for w in PAS_POUR_COURIR)][:8]
        app = f'app.html?ville={cid}'
        slug = f'courir-a-{cid}'
        title = f'Courir {c["a"]} : boucles, parcs et parcours · PerfectRun'
        desc = f'Où courir {c["a"]} ? 3 boucles prêtes à courir (5, 10 et 15 km), les parcs aux plus longues allées' + (' et les parcours des grandes courses' if races else '') + '. Crée ton parcours sur mesure, gratuit.'
        ogt = f'Courir {c["a"]} · PerfectRun'
        h = re.sub(r'<title>[^<]*</title>', f'<title>{esc(title)}</title>', head0, count=1)
        h = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{esc(desc)}">', h, count=1)
        h = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{SITE}/{slug}">', h, count=1)
        h = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{esc(ogt)}">', h, count=1)
        h = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{esc(desc)}">', h, count=1)
        h = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{SITE}/{slug}">', h, count=1)
        cards = ''
        for L in loops[cid]:
            n = f'Boucle {fkm(L["len"])} · {L["label"]}'
            href = f'{app}&p={urllib.parse.quote(L["p"], safe="")}&n={urllib.parse.quote_plus(n)}'
            fn = f'{cid}-{L["km"]}km.gpx'
            (root / 'site' / 'gpx' / fn).write_text(gpx(f'PerfectRun · {n}', L['gpx']), encoding='utf-8')
            cards += (f'<article class="loop"><div class="lm">{L["svg"]}</div><div class="lb"><div><small>{L["km"]} km en boucle</small><h3>{esc(L["label"])}</h3></div>'
                      f'<dl><div><dt>Distance</dt><dd>{fkm(L["len"])}</dd></div><div><dt>D+</dt><dd>{L["up"]} m</dd></div><div><dt>Feux</dt><dd>{L["feux"]}</dd></div><div><dt>Au vert</dt><dd>{L["green"]} %</dd></div></dl>'
                      f'<div class="la"><a class="btn primary" href="{esc(href)}">Ouvrir le parcours</a><a class="btn secondary" href="gpx/{fn}" download>GPX</a></div></div></article>\n')
        parks_html = ''.join(f'<li><b>{esc(p["n"])}</b><span>{fkm(p["L"])} d’allées et de chemins</span></li>' for p in pk)
        myth = ''
        if races:
            cards_m = ''.join(myth_card(r, cid) for r in races[:6])
            more = f'<a class="more" href="app.html#courses">Voir les {len(races)} parcours {ARROW}</a>' if len(races) > 6 else ''
            myth = (f'<div class="sec-top"><h2>Les parcours mythiques</h2>{more}</div>\n<p class="sub">Les tracés des grandes courses {c["de"]}, à courir en entier ou en partie.</p>\n'
                    f'<div class="myths">{cards_m}</div>\n')
        top = ', '.join(p['n'] for p in pk[:4])
        faq = [(f'Où courir {c["a"]} ?', f'Dans les parcs et jardins aux plus longues allées : {top}. PerfectRun privilégie aussi les quais, les berges et les chemins avec le type de parcours « Au vert ».'),
               (f'Comment trouver une boucle de 10 km {c["a"]} ?', f'Dans PerfectRun, choisis 10 km en boucle depuis ta position ou une adresse {c["a"]} : 3 parcours sont proposés en quelques secondes, avec la distance exacte, le dénivelé et le nombre de feux.'),
               ('Est-ce gratuit ?', 'Oui. Le site et l’application iPhone sont gratuits, sans compte et sans publicité.')]
        ld = {'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in faq]}
        ldj = json.dumps(ld, ensure_ascii=False).replace('</', '<\\/')
        faq_html = ''.join(f'<h3>{esc(q)}</h3><p>{esc(a)}</p>' for q, a in faq)
        races_txt = ' et les parcours des grandes courses' if races else ''
        others = ''.join(f'<li><a href="courir-a-{k}">Courir à {n}</a></li>' for _, n, k in city_names if k != cid and k in dep)
        body = f'''<main class="cv">
<p class="crumb"><a href="./">PerfectRun</a> › Courir {c["a"]}</p>
<h1>Courir <em>{c["a"]}</em></h1>
<p class="lead">Des boucles prêtes à courir, les parcs aux plus longues allées{races_txt}. Ou ton propre parcours sur mesure {c["a"]} {c["voisines"]} : distance, dénivelé, moins de feux.</p>
<div class="ctas"><a class="btn primary" href="{app}">Créer mon parcours {c["a"]}</a><a class="btn secondary" href="{APP_STORE}" rel="noopener">Télécharger l’app</a></div>
<ul class="facts" aria-label="{esc(name)} en chiffres"><li><b>{nb(round(km / 100) * 100)} km</b><span>de rues et chemins</span></li><li><b>{nb(feux)}</b><span>carrefours à feux</span></li><li><b>{nb(font)}</b><span>fontaines</span></li><li><b>{len(parks)}</b><span>parcs et jardins</span></li></ul>
<h2>3 boucles prêtes à courir</h2>
<p class="sub">Calculées par PerfectRun pour passer au maximum par les parcs et les chemins. Ouvre-les dans l’app pour les suivre avec le guidage, ou télécharge le GPX pour ta montre.</p>
<div class="loops">
{cards}</div>
<h2>Où courir {c["a"]} : les parcs</h2>
<p class="sub">Les parcs et jardins aux plus longues allées. Attention aux horaires : PerfectRun évite ceux qui sont fermés à l’heure de ta sortie.</p>
<ul class="parks">{parks_html}</ul>
{myth}<h2>Questions fréquentes</h2>
<div class="faq">{faq_html}</div>
<h2>Courir ailleurs</h2>
<ul class="others">{others}</ul>
<script type="application/ld+json">{ldj}</script>
'''
        (root / 'site' / f'{slug}.html').write_text(h + body + foot, encoding='utf-8')
        done.append(slug)
    # sitemap : ajoute les pages des villes
    sm = root / 'site' / 'sitemap.xml'; t = sm.read_text(encoding='utf-8')
    lastmod = re.search(r'<lastmod>([^<]+)</lastmod>', t).group(1)
    t = t.replace('</urlset>', ''.join(f'<url><loc>{SITE}/{s}</loc><lastmod>{lastmod}</lastmod></url>' for s in done) + '</urlset>')
    sm.write_text(t, encoding='utf-8')
    return done
