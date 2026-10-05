# Build a raw graph (graph2.json format) for the communes around Paris and merge it with the Paris raw graph.
import json, math, collections
from shapely.geometry import shape, Point
from shapely.prepared import prep
P='/mnt/user-data/uploads/Downloads/RunParis-data/'
import os
W=json.load(open('pbf_ways.json'))
ELE=json.load(open(P+'ext_ele.json')) if os.path.exists(P+'ext_ele.json') else {}
D=json.load(open(P+'graph2.json')); D0=json.load(open(P+'graph.json'))
D['nodes']['ele']=D0['nodes']['ele']
CF=json.load(open('communes.geojson'))['features']
paris=prep(shape([f for f in CF if f['properties']['insee']=='75056'][0]['geometry']))
from shapely.ops import unary_union
U=unary_union([shape(f['geometry']) for f in CF]); UB=prep(U.buffer(0.0004))
def dist(a,b):
    la=(a[0]+b[0])/2*math.pi/180
    return math.hypot((b[1]-a[1])*math.pi/180*math.cos(la)*6371000,(b[0]-a[0])*math.pi/180*6371000)
hwT=D['hwTypes']; names=D['names']; nameI={n:i for i,n in enumerate(names)}
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
# nodes to split at: shared nodes, endpoints, and nodes that coincide with Paris raw nodes
key=lambda la,lo:(round(la,6),round(lo,6))
pkey={key(la,lo):i for i,(la,lo) in enumerate(zip(D['nodes']['lat'],D['nodes']['lon']))}
cnt=collections.Counter()
for w in ways:
    for n in set(w['nodes']): cnt[n]+=1
coord={}
for w in ways:
    for n,(la,lo) in zip(w['nodes'],w['g']): coord[n]=(la,lo)
split=set(n for n,c in cnt.items() if c>1)|set(n for n,c in coord.items() if key(*c) in pkey)
for w in ways: split.add(w['nodes'][0]); split.add(w['nodes'][-1])
# build commune edges
newN={}; NL=D['nodes']
lat=list(NL['lat']); lon=list(NL['lon']); sig=list(NL['sig']); ele=list(NL['ele'])
# drop Paris raw edges whose midpoint is outside Paris
E=D['edges']; keepP=[]
for k in range(len(E['a'])):
    g=E['g'][k]
    if len(g)>=2: m=(g[(len(g)//4)*2],g[(len(g)//4)*2+1])
    else: m=((lat[E['a'][k]]+lat[E['b'][k]])/2,(lon[E['a'][k]]+lon[E['b'][k]])/2)
    keepP.append(paris.contains(Point(m[1],m[0])))
print('paris raw edges',len(keepP),'outside dropped',keepP.count(False))
out={f:[] for f in E}
for k in range(len(E['a'])):
    if keepP[k]:
        for f in E: out[f].append(E[f][k])
def nodeidx(n):
    la,lo=coord[n]; kk=key(la,lo)
    if kk in pkey: return pkey[kk]
    if n not in newN:
        newN[n]=len(lat); lat.append(round(la,6)); lon.append(round(lo,6)); sig.append(1 if n in sigset else 0)
        ele.append(ELE.get(str(n), None))
    return newN[n]
added=0; skippedIn=0
for w in ways:
    t=w['tags']; h=t['highway']
    if h not in hwT: continue
    fw=1 if t.get('footway')=='sidewalk' or t.get('path')=='sidewalk' else 2 if t.get('footway')=='crossing' or t.get('path')=='crossing' or t.get('cycleway')=='crossing' else 0
    fl=flags(t); c=CLS.get(h,0); p=2 if h=='steps' else 1 if h in PATH else 0
    nm=t.get('name')
    if nm and nm not in nameI: nameI[nm]=len(names); names.append(nm)
    nmi=nameI[nm] if nm else -1
    ns=w['nodes']; g=w['g']; i0=0
    for i in range(1,len(ns)):
        if ns[i] in split or i==len(ns)-1:
            seg=g[i0:i+1]
            mid=seg[len(seg)//2] if len(seg)>2 else ((seg[0][0]+seg[-1][0])/2,(seg[0][1]+seg[-1][1])/2)
            if paris.contains(Point(mid[1],mid[0])) or not UB.contains(Point(mid[1],mid[0])): skippedIn+=1; i0=i; continue
            a=nodeidx(ns[i0]); b=nodeidx(ns[i])
            L=sum(dist(seg[j-1],seg[j]) for j in range(1,len(seg)))
            s=sum(1 for n in ns[i0+1:i] if n in sigset)
            inner=[]
            for q in seg[1:-1]: inner+= [round(q[0],6),round(q[1],6)]
            for f,v in (('a',a),('b',b),('len',round(L,1)),('s',s),('c',c),('p',p),('fw',fw),('nm',nmi),('hw',hwT.index(h)),('fl',fl),('g',inner)): out[f].append(v)
            added+=1; i0=i
print('commune edges added',added,'skipped inside Paris',skippedIn,'new nodes',len(newN))
miss=[i for i,z in enumerate(ele) if z is None]
from dem import ele as demele
zz=demele([lat[i] for i in miss],[lon[i] for i in miss])
for i,z in zip(miss,zz): ele[i]=round(float(z),2)
print('nodes ele from DEM',len(miss))
EXTST=[]
for x in json.load(open('pbf_st.json')):
    r=x['rings'][0]; cy=sum(p[0] for p in r)/len(r); cx=sum(p[1] for p in r)/len(r)
    if not paris.contains(Point(cx,cy)) and UB.contains(Point(cx,cy)): EXTST.append(x)
bgx=[]
for o in json.load(open('pbf_bg.json')):
    g=[p for w in o['w'] if w['r']=='outer' for p in w['g']]; cy=sum(p[0] for p in g)/len(g); cx=sum(p[1] for p in g)/len(g)
    if not paris.contains(Point(cx,cy)) and UB.contains(Point(cx,cy)): bgx.append(o)
json.dump(bgx,open('bg_ext.json','w')); print('ext stations',len(EXTST),'ext bg',len(bgx))
R=dict(nodes=dict(lat=lat,lon=lon,sig=sig,ele=ele),edges=out,names=names,hwTypes=hwT,stations=D['stations']+EXTST)
json.dump(R,open('graph_ext.json','w'))
print('nodes',len(lat),'edges',len(out['a']))
