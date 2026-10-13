# Graphe brut (format graph2.json) d'une ville entière, à partir des voies OSM extraites par osm.py.
import json, math, collections, sys
import numpy as np
from shapely.geometry import shape, Point, Polygon
from shapely.prepared import prep
from shapely.ops import unary_union
from shapely.validation import make_valid
CFG=json.load(open(sys.argv[1]))
W=json.load(open('osm_ways.json')); A=json.load(open('osm_admin.json'))
def poly(a):
    ps=[make_valid(Polygon([(p[1],p[0]) for p in r])) for r in a['rings'] if len(r)>=4]
    P=unary_union(ps)
    hs=[Polygon([(p[1],p[0]) for p in h]) for h in a['holes'] if len(h)>=4]
    if hs: P=P.difference(unary_union(hs))
    return P
COM={a['insee']:a for a in A if a['level']=='8' and a['insee'] in CFG['communes']}
assert len(COM)==len(CFG['communes']), set(CFG['communes'])-set(COM)
U=unary_union([poly(a) for a in COM.values()]); UB=prep(U.buffer(0.0004))
json.dump(dict(type='FeatureCollection',features=[dict(type='Feature',properties=dict(insee=k,name=a['name']),geometry=json.loads(json.dumps(poly(a).__geo_interface__))) for k,a in COM.items()]),open('communes.geojson','w'),ensure_ascii=False)
D_=CFG['dem']; la0,la1,lo0,lo1=D_['bbox']; WW,HH=D_['W'],D_['H']
Z=np.fromfile(D_['file'],dtype='<f4').reshape(HH,WW)
def demele(lat,lon):
    lat=np.asarray(lat,float); lon=np.asarray(lon,float)
    x=(lon-lo0)/(lo1-lo0)*WW-0.5; y=(la1-lat)/(la1-la0)*HH-0.5
    x0=np.clip(np.floor(x).astype(int),0,WW-2); y0=np.clip(np.floor(y).astype(int),0,HH-2)
    fx=np.clip(x-x0,0,1); fy=np.clip(y-y0,0,1)
    return (Z[y0,x0]*(1-fx)*(1-fy)+Z[y0,x0+1]*fx*(1-fy)+Z[y0+1,x0]*(1-fx)*fy+Z[y0+1,x0+1]*fx*fy)
def dist(a,b):
    la=(a[0]+b[0])/2*math.pi/180
    return math.hypot((b[1]-a[1])*math.pi/180*math.cos(la)*6371000,(b[0]-a[0])*math.pi/180*6371000)
hwT=['secondary','residential','tertiary','living_street','pedestrian','primary','path','footway','service','unclassified','track','cycleway','steps','primary_link','secondary_link','tertiary_link','corridor']
names=[]; nameI={}
CLS={'primary':3,'primary_link':3,'secondary':2,'secondary_link':2,'tertiary':1,'tertiary_link':1}
PATH={'footway','cycleway','path','pedestrian','track','corridor'}
def ok(t):
    if t.get('access') in ('private','no','customers','delivery') and t.get('foot') not in ('yes','designated','permissive'): return False
    if t.get('foot') in ('no','private'): return False
    if t.get('highway')=='service' and t.get('service') in ('parking_aisle','drive-through'): return False
    if t.get('area')=='yes' and t.get('highway')!='pedestrian': return False
    return True
def flags(t):
    f=0
    if t.get('railway')=='platform' or t.get('public_transport')=='platform': f|=1
    if t.get('indoor') in ('yes','corridor') or t.get('highway')=='corridor': f|=2
    lay=t.get('layer','0')
    try: lay=int(float(lay))
    except: lay=0
    if t.get('tunnel') in ('yes','culvert') or lay<0 or t.get('location')=='underground' or t.get('covered')=='yes': f|=4
    if t.get('tunnel')=='building_passage' or t.get('covered')=='arcade': f|=8
    return f
ways=[w for w in W['ways'] if ok(w['tags'])]
sigset=set(int(k) for k in W['sig'])
cnt=collections.Counter()
for w in ways:
    for n in set(w['nodes']): cnt[n]+=1
coord={}
for w in ways:
    for n,(la,lo) in zip(w['nodes'],w['g']): coord[n]=(la,lo)
split=set(n for n,c in cnt.items() if c>1)
for w in ways: split.add(w['nodes'][0]); split.add(w['nodes'][-1])
lat=[]; lon=[]; sig=[]; newN={}
out={f:[] for f in ('a','b','len','s','c','p','fw','nm','hw','fl','g')}
def nodeidx(n):
    if n not in newN:
        la,lo=coord[n]; newN[n]=len(lat); lat.append(round(la,6)); lon.append(round(lo,6)); sig.append(1 if n in sigset else 0)
    return newN[n]
added=0; skipped=0
for w in ways:
    t=w['tags']; h=t['highway']
    if h not in hwT: continue
    fw=1 if t.get('footway')=='sidewalk' or t.get('path')=='sidewalk' else 2 if t.get('footway')=='crossing' or t.get('path')=='crossing' or t.get('cycleway')=='crossing' else 0
    fl=flags(t); c=CLS.get(h,0); p=2 if h=='steps' else 1 if h in PATH else 0
    nm=t.get('name')
    if nm and __import__('re').match(r'^(VL|Voie Lyonnaise) ?\d+$',nm): nm=None
    if nm and nm not in nameI: nameI[nm]=len(names); names.append(nm)
    nmi=nameI[nm] if nm else -1
    ns=w['nodes']; g=w['g']; i0=0
    for i in range(1,len(ns)):
        if ns[i] in split or i==len(ns)-1:
            seg=g[i0:i+1]
            mid=seg[len(seg)//2] if len(seg)>2 else ((seg[0][0]+seg[-1][0])/2,(seg[0][1]+seg[-1][1])/2)
            if not UB.contains(Point(mid[1],mid[0])): skipped+=1; i0=i; continue
            a=nodeidx(ns[i0]); b=nodeidx(ns[i])
            L=sum(dist(seg[j-1],seg[j]) for j in range(1,len(seg)))
            s=sum(1 for n in ns[i0+1:i] if n in sigset)
            inner=[]
            for q in seg[1:-1]: inner+=[round(q[0],6),round(q[1],6)]
            for f,v in (('a',a),('b',b),('len',round(L,1)),('s',s),('c',c),('p',p),('fw',fw),('nm',nmi),('hw',hwT.index(h)),('fl',fl),('g',inner)): out[f].append(v)
            added+=1; i0=i
ele=[round(float(z),2) for z in demele(lat,lon)]
print('edges',added,'skipped outside',skipped,'nodes',len(lat),'ele range',min(ele),max(ele))
EXTST=[]
for x in json.load(open('osm_st.json')):
    r=x['rings'][0]; cy=sum(p[0] for p in r)/len(r); cx=sum(p[1] for p in r)/len(r)
    if UB.contains(Point(cx,cy)): EXTST.append(x)
bgx=[]
for o in json.load(open('osm_bg.json')):
    g=[p for w in o['w'] if w['r']=='outer' for p in w['g']]; cy=sum(p[0] for p in g)/len(g); cx=sum(p[1] for p in g)/len(g)
    if UB.contains(Point(cx,cy)): bgx.append(o)
json.dump(bgx,open('bg.json','w'))
R=dict(nodes=dict(lat=lat,lon=lon,sig=sig,ele=ele),edges=out,names=names,hwTypes=hwT,stations=EXTST)
json.dump(R,open('graph_raw.json','w'))
print('stations',len(EXTST),'bg',len(bgx))
