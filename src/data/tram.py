# Perfect Run · ajoute le tram à metro.json d'une ville (D-98)
# python3 tram.py <extrait.osm.pbf> <site/ville> "<network OSM>"
#   Paris : python3 tram.py idf.osm.pbf site "Tramway d'Île de France"
#   Lyon  : python3 tram.py lyon.osm.pbf site/lyon TCL
#   Bordeaux : python3 tram.py bordeaux.osm.pbf site/bordeaux TBM  (lignes A à F, notées TA à TF)
#   Nantes : python3 tram.py nantes.osm.pbf site/nantes "Naolib|TAN"  (lignes 1 à 3, notées T1 à T3 ; plusieurs réseaux séparés par |)
# Garde les arrêts dans les quartiers et communes de la ville (meta.json, marge 200 m).
# Un arrêt à moins de 200 m d'une station de métro / RER du même nom (ou à moins de 120 m) est réuni avec elle.
# Relancer le script remplace les lignes de tram déjà présentes.
import sys, json, re, math, osmium
from shapely.geometry import shape, Point, Polygon
from shapely.ops import unary_union
pbf, d, network = sys.argv[1], sys.argv[2].rstrip('/'), sys.argv[3]
meta = json.load(open(d + '/meta.json')); M = json.load(open(d + '/metro.json'))
polys = [Polygon([(lo, la) for la, lo in r]) for q in meta['quartiers'] for r in q.get('rings', []) if len(r) > 3]
zone = unary_union([p.buffer(0) for p in polys]).buffer(0.0025)
isT = lambda l: re.fullmatch(r'T(\d+[ab]?|[A-Z])', l) is not None
# ref OSM vers clé de ligne : « T3a » reste tel quel, « A » (Bordeaux) devient « TA », « 1 » (Nantes) devient « T1 » ; sans ref, on la lit dans le nom (« Tram B : … »)
def lineKey(t):
    ref = (t.get('ref') or '').strip()
    if not ref:
        m = re.match(r'(?:Tram|Tramway)\s+(\w+)', t.get('name', '')); ref = m.group(1) if m else ''
    if isT(ref): return ref
    return 'T' + ref if re.fullmatch(r'\d+|[A-Z]', ref) else ''
for s in M['stations']: s[3] = [l for l in s[3] if not isT(l)]
M['stations'] = [s for s in M['stations'] if s[3]]
for k in [k for k in M['lines'] if isT(k)]: del M['lines'][k]
rels = []
for o in osmium.FileProcessor(pbf, osmium.osm.RELATION).with_filter(osmium.filter.TagFilter(('type', 'route'))):
    t = o.tags; ref = lineKey(t)
    if t.get('route') == 'tram' and t.get('network') in network.split('|') and ref:
        rels.append((ref, t.get('colour', '#888888').upper(), [m.ref for m in o.members if m.type == 'n' and m.role.startswith('stop') or m.type == 'n' and m.role == '']))
need = set(n for _, _, ns in rels for n in ns); loc = {}
for o in osmium.FileProcessor(pbf, osmium.osm.NODE):
    if o.id in need and o.tags.get('name'): loc[o.id] = (o.location.lat, o.location.lon, o.tags.get('name'))
st = {}
for ref, col, ns in rels:
    M['lines'][ref] = col
    for n in ns:
        if n not in loc: continue
        la, lo, nm = loc[n]
        if not zone.contains(Point(lo, la)): continue
        st.setdefault(nm, [nm, round(la, 5), round(lo, 5), set()])[3].add(ref)
dist = lambda a, b: math.hypot((a[1] - b[1]) * 111320, (a[2] - b[2]) * 111320 * math.cos(math.radians(a[1])))
key = lambda n: re.sub(r'[^a-z0-9]', '', n.split(' - ')[0].lower())
order = lambda l: (0 if l.startswith('M') else 1 if l.startswith('F') else 2 if l.startswith('RER') else 3, int(re.sub(r'\D', '', l) or 0), l)
merged = 0
for nm, s in st.items():
    near = sorted((dist(m, s), m) for m in M['stations'])
    hit = [m for dd, m in near if dd < 120 or (dd < 200 and key(m[0]) == key(nm))]
    if hit:
        hit[0][3] = sorted(set(hit[0][3]) | s[3], key=order); merged += 1
    else:
        M['stations'].append([nm, s[1], s[2], sorted(s[3], key=order)])
used = set(l for x in M['stations'] for l in x[3])
M['lines'] = dict(sorted(((k, v) for k, v in M['lines'].items() if k in used or not isT(k)), key=lambda kv: order(kv[0])))
json.dump(M, open(d + '/metro.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(d, 'lignes tram', sorted([k for k in M['lines'] if isT(k)], key=order), '· arrêts', len(st), '· réunis avec une station', merged, '· total', len(M['stations']))
