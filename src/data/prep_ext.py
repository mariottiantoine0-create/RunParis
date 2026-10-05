import json, shutil
from shapely.geometry import shape, Point
from shapely.prepared import prep
from shapely.ops import unary_union
CF=json.load(open('communes.geojson'))['features']
paris=prep(shape([f for f in CF if f['properties']['insee']=='75056'][0]['geometry']))
UB=prep(unary_union([shape(f['geometry']) for f in CF]).buffer(0.003))
ext=lambda la,lo: (not paris.contains(Point(lo,la))) and UB.contains(Point(lo,la))
R='/home/claude/runparis/'; P='/mnt/user-data/uploads/Downloads/RunParis-data/'
# lit
L=json.load(open(R+'lit_raw.json')); X=json.load(open('pbf_lit.json'))
for k in ('yes','no'):
    for w in X[k]:
        m=w[len(w)//2]
        if ext(*m): L[k].append(w)
json.dump(L,open('work/lit_raw.json','w')); print('lit',len(L['yes']),len(L['no']))
# trees
T=open(P+'paris_trees.csv').read().rstrip('\n').split('\n'); n0=len(T)
for l in open('pbf_trees.csv').read().split('\n'):
    a,b=map(float,l.split(','))
    if ext(a,b): T.append(l)
open('work/trees.csv','w').write('\n'.join(T)); print('trees',n0,'->',len(T))
# fountains + poi
F=json.load(open(R+'fountains_raw.json')); pts=json.load(open('pbf_pts.json')); poi=[]
for p in pts:
    t=p['tags']; la,lo=p['lat'],p['lon']
    if not ext(la,lo): continue
    if t.get('amenity')=='drinking_water': F.append([round(la,5),round(lo,5),t.get('name','')])
    elif 'name' in t:
        ty='station' if (t.get('railway')=='station' or t.get('station')=='subway') else t.get('tourism')
        poi.append(dict(n=t['name'],t=ty,la=la,lo=lo))
# parks from bg (names for search; hours for park closing)
bgx=json.load(open('bg_ext.json')); PK=json.load(open(R+'parks_raw.json'))
for o in bgx:
    if o['k'] in ('park','garden') and o['n']:
        g=[p for w in o['w'] if w['r']=='outer' for p in w['g']]; la=sum(p[0] for p in g)/len(g); lo=sum(p[1] for p in g)/len(g)
        poi.append(dict(n=o['n'],t='park',la=la,lo=lo))
        if o['oh'] and o['oh']!='24/7': PK['osm'].append(dict(n=o['n'],oh=o['oh'],r=[w['g'] for w in o['w'] if w['r']=='outer']))
json.dump(F,open('work/fountains_raw.json','w')); json.dump(PK,open('work/parks_raw.json','w')); json.dump(poi,open('work/poi_ext.json','w'))
print('fountains',len(F),'poi ext',len(poi),'parks osm',len(PK['osm']))
# metro / RER
M=json.load(open(R+'metro_raw.json')); add=0
for r in json.load(open('pbf_routes.json')):
    t=r['tags']; net=t.get('network',''); ref=t.get('ref','')
    if t.get('route')=='subway' and net in ('Métro de Paris','Île-de-France Mobilités') and ref[:1].isdigit(): line='M'+ref
    elif t.get('route')=='train' and net=='RER' and ref in 'ABCDE': line='RER '+ref
    else: continue
    if line not in M['lines']: continue
    for nid,la,lo,nm in r['stops']:
        if not nm or not ext(la,lo): continue
        M['stations'].append([nm,round(la,5),round(lo,5),[line]]); add+=1
json.dump(M,open('work/metro_raw.json','w')); print('metro stops added',add)
for f in ['engine.js','green.js','mklit.js','mkparks.js','mkmetro_trees.js','mkfont.js','sights.js','build2.py','build3.py']: shutil.copy(R+f,'work/'+f)
shutil.copy('out/graph.bin','work/graph.bin'); shutil.copy('out/meta.json','work/meta.json')
