import json, sys, shutil
from shapely.geometry import shape, Point, Polygon, LineString, box
from shapely.prepared import prep
from shapely.ops import unary_union, polygonize
from shapely.validation import make_valid
CFG=json.load(open(sys.argv[1]))
CF=json.load(open('communes.geojson'))['features']
UB=prep(unary_union([shape(f['geometry']) for f in CF]).buffer(0.003))
inz=lambda la,lo: UB.contains(Point(lo,la))
X=json.load(open('osm_lit.json')); L={'yes':[],'no':[]}
for k in ('yes','no'):
    for w in X[k]:
        if inz(*w[len(w)//2]): L[k].append(w)
json.dump(L,open('work/lit_raw.json','w')); print('lit',len(L['yes']),len(L['no']))
T=[l for l in open('osm_trees.csv').read().split('\n') if l and inz(*map(float,l.split(',')))]
open('work/trees.csv','w').write('\n'.join(T)); print('trees',len(T))
F=[]; poi=[]
for p in json.load(open('osm_pts.json')):
    t=p['tags']; la,lo=p['lat'],p['lon']
    if not inz(la,lo): continue
    if t.get('amenity')=='drinking_water': F.append([round(la,5),round(lo,5),t.get('name','')])
    elif 'name' in t and t.get('railway')!='tram_stop':
        ty='station' if (t.get('railway') in ('station','halt') or t.get('station') in ('subway','funicular')) else t.get('tourism')
        poi.append(dict(n=t['name'],t=ty,la=la,lo=lo))
PK={'od':[],'osm':[]}
for o in json.load(open('bg.json')):
    if o['k'] in ('park','garden') and o['n']:
        g=[p for w in o['w'] if w['r']=='outer' for p in w['g']]; la=sum(p[0] for p in g)/len(g); lo=sum(p[1] for p in g)/len(g)
        poi.append(dict(n=o['n'],t='park',la=la,lo=lo))
        if o['oh'] and o['oh']!='24/7': PK['osm'].append(dict(n=o['n'],oh=o['oh'],r=[w['g'] for w in o['w'] if w['r']=='outer']))
json.dump(F,open('work/fountains_raw.json','w')); json.dump(PK,open('work/parks_raw.json','w')); json.dump(poi,open('work/poi.json','w'),ensure_ascii=False)
print('fountains',len(F),'poi',len(poi),'parks osm',len(PK['osm']))
M={'lines':{},'stations':[]}
for r in json.load(open('osm_routes.json')):
    t=r['tags']
    if t.get('network')!=CFG.get('transit_network'): continue
    if t.get('route')=='subway': line='M'+t.get('ref','')
    elif t.get('route')=='funicular': line=t.get('ref','')
    else: continue
    M['lines'][line]=t.get('colour','#888').upper()
    for nid,la,lo,nm in r['stops']:
        if nm and inz(la,lo): M['stations'].append([nm,round(la,5),round(lo,5),[line]])
json.dump(M,open('work/metro_raw.json','w'),ensure_ascii=False); print('metro lines',sorted(M['lines']),'stops',len(M['stations']))
shutil.copy('out/graph.bin','work/graph.bin'); shutil.copy('out/meta.json','work/meta.json')
shutil.copy('/mnt/user-data/outputs/RunParis/src/engine.js','work/engine.js')
# zones rings + poi (build2)
meta=json.load(open('work/meta.json')); Q=json.load(open('zones.geojson'))
for q,f in zip(meta['quartiers'],Q['features']):
    g=shape(f['geometry']).simplify(0.00006,preserve_topology=True)
    geoms=[g] if g.geom_type=='Polygon' else list(g.geoms)
    q['rings']=[[[round(y,5),round(x,5)] for x,y in p.exterior.coords] for p in geoms]
seen=set(); P2=[]
for p in poi:
    k=p['n'].strip().lower()
    if k in seen: continue
    seen.add(k); P2.append([p['n'],p['t'],round(p['la'],5),round(p['lo'],5)])
meta['poi']=P2
# background layers (build3)
la0,la1,lo0,lo1=meta['bbox']; clip=box(lo0-0.01,la0-0.01,lo1+0.01,la1+0.01)
def bg_poly(o):
    outers=[w['g'] for w in o['w'] if w['r']!='inner']; inners=[w['g'] for w in o['w'] if w['r']=='inner']
    lines=[LineString([(p[1],p[0]) for p in g]) for g in outers if len(g)>=2]
    if not lines: return None
    polys=list(polygonize(unary_union(lines)))
    if not polys: return None
    P=unary_union(polys)
    if inners:
        hp=list(polygonize(unary_union([LineString([(p[1],p[0]) for p in g]) for g in inners if len(g)>=2])))
        if hp: P=P.difference(unary_union(hp))
    return make_valid(P)
M2=1/(111320*0.70*110540)
layers={'water':[],'green':[]}
for o in json.load(open('osm_bg.json')):
    if o['c']=='cemetery' or o['k']=='fountain': continue
    p=bg_poly(o)
    if p is None or p.is_empty: continue
    p=p.intersection(clip)
    if p.area < (300 if o['c']=='water' else 2500)*M2: continue
    layers[o['c']].append(p)
out={}
for k,ps in layers.items():
    U=unary_union(ps).simplify(0.00003)
    geoms=[U] if U.geom_type=='Polygon' else [x for x in getattr(U,'geoms',[]) if x.geom_type=='Polygon']
    polys=[]
    for g in geoms:
        if g.area < (300 if k=='water' else 2500)*M2: continue
        rings=[[[round(y,5),round(x,5)] for x,y in g.exterior.coords]]
        for h in g.interiors:
            if Polygon(h).area > 800*M2: rings.append([[round(y,5),round(x,5)] for x,y in h.coords])
        polys.append(rings)
    out[k]=polys; print(k,len(polys))
meta['layers']=out
json.dump(meta,open('work/meta.json','w'),ensure_ascii=False,separators=(',',':'))
import os; print('meta size',os.path.getsize('work/meta.json'))
