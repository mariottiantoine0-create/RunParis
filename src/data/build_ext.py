import json, math, struct, collections
from shapely.geometry import shape, Point
from shapely.prepared import prep
from shapely import STRtree
D0=json.load(open('/mnt/user-data/uploads/Downloads/RunParis-data/graph.json'))
D=json.load(open('graph_ext.json')); D['poi']=D0['poi']
Q=json.load(open('/mnt/user-data/uploads/Downloads/RunParis-data/quartiers.geojson'))
CF=[f for f in json.load(open('communes.geojson'))['features'] if f['properties']['insee']!='75056']
CF.sort(key=lambda f:f['properties']['name'])
for f in CF: f['properties'].update(l_qu=f['properties']['name'],c_ar=int(f['properties']['insee']))
Q['features']=Q['features']+CF
lat=D['nodes']['lat']; lon=D['nodes']['lon']; ele=D['nodes']['ele']; sig=D['nodes']['sig']
# --- elevation smoothing: mean of DTM samples within SMOOTH_R metres (removes curb/bridge/building-edge noise) ---
import numpy as np
SMOOTH_R=float(__import__('os').environ.get('SMOOTH_R','30'))
if SMOOTH_R>0:
    from scipy.spatial import cKDTree
    la0_=sum(lat)/len(lat); kx_=math.cos(la0_*math.pi/180)*111320; ky_=110540
    XY=np.column_stack([np.array(lon)*kx_, np.array(lat)*ky_]); Z=np.array(ele)
    tr=cKDTree(XY); nb=tr.query_ball_point(XY, SMOOTH_R)
    ele=[float(np.median(Z[i])) for i in nb]
    print('elevation smoothed, radius',SMOOTH_R)
E=D['edges']; nE=len(E['a'])
def dist(a,b):
    la=(a[0]+b[0])/2*math.pi/180
    return math.hypot((b[1]-a[1])*math.pi/180*math.cos(la)*6371000,(b[0]-a[0])*math.pi/180*6371000)
# --- signal clusters (all signal nodes, incl. interior of edges) ---
sigpts=[i for i in range(len(lat)) if sig[i]]
# interior signal points not in node list: approximate via edge.s; we include only node-level ones + edge interior coords unknown -> handle via e.s
# grid union-find within 30 m
par={}
def f(x):
    while par[x]!=x: par[x]=par[par[x]]; x=par[x]
    return x
for i in sigpts: par[i]=i
cell=collections.defaultdict(list); G=0.0003
for i in sigpts: cell[(int(lat[i]/G),int(lon[i]/G))].append(i)
for i in sigpts:
    cy,cx=int(lat[i]/G),int(lon[i]/G)
    for dy in (-1,0,1):
        for dx in (-1,0,1):
            for j in cell[(cy+dy,cx+dx)]:
                if j<i and dist((lat[i],lon[i]),(lat[j],lon[j]))<30: par[f(i)]=f(j)
roots={}; clus={}
for i in sigpts:
    r=f(i); roots.setdefault(r,len(roots)+1); clus[i]=roots[r]
print('signal nodes',len(sigpts),'clusters',len(roots))
# --- stations / underground ---
from shapely.geometry import Polygon, LineString
from shapely.validation import make_valid
blockP=[]; showP=[]
for st in D['stations']:
    t=st['tags']
    if not st['rings'] or len(st['rings'][0])<4: continue
    r=st['rings'][0]
    if r[0]!=r[-1]: continue
    under = t.get('station')=='subway' or t.get('location')=='underground' or (t.get('layer','0').lstrip('-').isdigit() and int(t.get('layer','0'))<0)
    if under: continue
    try: poly=make_valid(Polygon([(p[1],p[0]) for p in r]))
    except Exception: continue
    nm_=t.get('name','')
    historic = ('disused:railway' in t) or ('amenity' in t) or t.get('tourism')=='museum' or any(w in nm_ for w in ('Ancienne','Petit Train','Musée'))
    if historic: continue
    isStation = t.get('building')=='train_station' or t.get('railway') in ('station','platform') or t.get('public_transport') in ('station','platform') or t.get('landuse')=='railway'
    if not isStation: continue
    blockP.append(poly)
    if t.get('building')=='train_station' or t.get('landuse')=='railway' or (t.get('railway')=='station' and t.get('station')!='subway'):
        showP.append((t.get('name',''),poly))
btree=STRtree(blockP)
# --- cemeteries (optional exclusion, on by default in the app) ---
BG=json.load(open('/mnt/user-data/uploads/Downloads/RunParis-data/background.json'))
import os
if os.path.exists('bg_ext.json'): BG=BG+json.load(open('bg_ext.json'))
from shapely.ops import polygonize, unary_union, linemerge
def bg_poly(o):
    outers=[w['g'] for w in o['w'] if w['r']!='inner']; inners=[w['g'] for w in o['w'] if w['r']=='inner']
    lines=[LineString([(p[1],p[0]) for p in g]) for g in outers if len(g)>=2]
    if not lines: return None
    polys=list(polygonize(unary_union(lines)))
    if not polys: return None
    P=unary_union(polys)
    if inners:
        il=[LineString([(p[1],p[0]) for p in g]) for g in inners if len(g)>=2]
        hp=list(polygonize(unary_union(il)))
        if hp: P=P.difference(unary_union(hp))
    return make_valid(P)
cemP=[]; cemNames=[]
for o in BG:
    if o['c']=='cemetery':
        p=bg_poly(o)
        if p is not None and not p.is_empty: cemP.append(p); cemNames.append(o['n'])
ctree=STRtree(cemP)
print('cemeteries',len(cemP))
softhw=set(['footway','path','service','steps','track','corridor','pedestrian','cycleway'])
bad=[0]*nE; reason=collections.Counter(); cem=[0]*nE
for k in range(nE):
    fl=E['fl'][k]
    if fl&1: bad[k]=1; reason['quai']+=1; continue
    if fl&2: bad[k]=1; reason['interieur']+=1; continue
    if fl&4 and not fl&8: bad[k]=1; reason['souterrain']+=1; continue
    if fl&8: continue
    if D['hwTypes'][E['hw'][k]] in softhw:
        g=E['g'][k]; pts=[(lon[E['a'][k]],lat[E['a'][k]])]+[(g[i+1],g[i]) for i in range(0,len(g),2)]+[(lon[E['b'][k]],lat[E['b'][k]])]
        mid=pts[len(pts)//2] if len(pts)>2 else ((pts[0][0]+pts[1][0])/2,(pts[0][1]+pts[1][1])/2)
        inside=0
        for p in [pts[0],mid,pts[-1]]:
            pt=Point(p)
            if any(blockP[i].contains(pt) for i in btree.query(pt)): inside+=1
        if inside>=2: bad[k]=1; reason['gare']+=1
    if not bad[k] and not fl&8 and E['c'][k]==0:
        g=E['g'][k]; pts_=[(lon[E['a'][k]],lat[E['a'][k]])]+[(g[i+1],g[i]) for i in range(0,len(g),2)]+[(lon[E['b'][k]],lat[E['b'][k]])]
        mid=pts_[len(pts_)//2] if len(pts_)>2 else ((pts_[0][0]+pts_[1][0])/2,(pts_[0][1]+pts_[1][1])/2)
        inside=sum(1 for p in [pts_[0],mid,pts_[-1]] if any(cemP[i].contains(Point(p)) for i in ctree.query(Point(p))))
        if inside>=2: cem[k]=1
print('bad edges',sum(bad),reason,'cemetery edges',sum(cem))
# --- filter edges ---
keep=[k for k in range(nE) if E['fw'][k]==0 and not bad[k]]
hw=D['hwTypes']
adj=collections.defaultdict(list)
for k in keep: adj[E['a'][k]].append(k); adj[E['b'][k]].append(k)
# nodes on removed sidewalks/crossings that are signals: map their cluster onto nearby kept nodes (<25m)
keptnodes=set(adj.keys())
kcell=collections.defaultdict(list)
for i in keptnodes: kcell[(int(lat[i]/G),int(lon[i]/G))].append(i)
nodeclus={}
for i in sigpts:
    if i in keptnodes: nodeclus[i]=clus[i]; continue
for i in sigpts:
    if i in keptnodes: continue
    cy,cx=int(lat[i]/G),int(lon[i]/G); best=None;bd=25
    for dy in (-1,0,1):
        for dx in (-1,0,1):
            for j in kcell[(cy+dy,cx+dx)]:
                if len(adj[j])>=3:
                    d=dist((lat[i],lon[i]),(lat[j],lon[j]))
                    if d<bd: bd=d;best=j
    if best is not None and best not in nodeclus: nodeclus[best]=clus[i]
print('kept nodes with signal cluster',len(nodeclus),'distinct',len(set(nodeclus.values())))
# largest component
seen=set(); best=[]
for s in keptnodes:
    if s in seen: continue
    comp=[s]; seen.add(s); st=[s]
    while st:
        u=st.pop()
        for k in adj[u]:
            v=E['b'][k] if E['a'][k]==u else E['a'][k]
            if v not in seen: seen.add(v); comp.append(v); st.append(v)
    if len(comp)>len(best): best=comp
bestset=set(best); keep=[k for k in keep if E['a'][k] in bestset]
adj=collections.defaultdict(list)
for k in keep: adj[E['a'][k]].append(k); adj[E['b'][k]].append(k)
print('component nodes',len(best),'edges',len(keep))
# --- contract degree-2 nodes (not signal nodes, same class/path type) ---
def other(k,u): return E['b'][k] if E['a'][k]==u else E['a'][k]
def pts(k,frm):
    g=E['g'][k]; p=[(g[i],g[i+1]) for i in range(0,len(g),2)]
    seq=[(lat[E['a'][k]],lon[E['a'][k]])]+p+[(lat[E['b'][k]],lon[E['b'][k]])]
    return seq if frm==E['a'][k] else seq[::-1]
def kind(k): return (E['c'][k],E['p'][k],cem[k])
term=set(u for u in adj if len(adj[u])!=2 or u in nodeclus)
for u in adj:
    if len(adj[u])==2 and kind(adj[u][0])!=kind(adj[u][1]): term.add(u)
used=set(); chains=[]
def walk(u,k):
    seq=[u]; ks=[k]; v=other(k,u)
    while v not in term:
        seq.append(v); nk=[x for x in adj[v] if x!=ks[-1]]
        if not nk: break
        ks.append(nk[0]); v=other(nk[0],v)
        if v==u: break
    seq.append(v); return seq,ks
for u in term:
    for k in adj[u]:
        if k in used: continue
        seq,ks=walk(u,k)
        for x in ks: used.add(x)
        chains.append((seq,ks))
# pure cycles without terminal
for k in keep:
    if k not in used:
        u=E['a'][k]; term.add(u); seq,ks=walk(u,k)
        for x in ks: used.add(x)
        chains.append((seq,ks))
print('chains',len(chains))
# Douglas-Peucker
def dp(P,eps=2.0):
    if len(P)<3: return P
    a,b=P[0],P[-1]; la=a[0]*math.pi/180; kx=math.cos(la)*111320; ky=110540
    ax,ay=a[1]*kx,a[0]*ky; bx,by=b[1]*kx,b[0]*ky; dx,dy=bx-ax,by-ay; L=math.hypot(dx,dy)
    md=-1;mi=0
    for i in range(1,len(P)-1):
        px,py=P[i][1]*kx,P[i][0]*ky
        d=abs(dy*px-dx*py+bx*ay-by*ax)/L if L>0 else math.hypot(px-ax,py-ay)
        if d>md: md=d;mi=i
    if md>eps: return dp(P[:mi+1],eps)[:-1]+dp(P[mi:],eps)
    return [a,b]
# zones
feats=Q['features']; polys=[shape(f['geometry']) for f in feats]; pp=[prep(p) for p in polys]
tree=STRtree(polys)
def qid(la,lo):
    pt=Point(lo,la)
    for i in tree.query(pt):
        if pp[i].contains(pt): return i+1
    # nearest
    i=tree.nearest(pt); return int(i)+1
# node ids
nodes=sorted(term, key=lambda i:(lat[i],lon[i]))
nid={u:i for i,u in enumerate(nodes)}
nq=[qid(lat[u],lon[u]) for u in nodes]
out_e=[]
for seq,ks in chains:
    a,b=seq[0],seq[-1]
    if a==b and len(ks)<2: continue
    P=[]; L=0; up=0; dn=0; s=0; cl=set(); nm=collections.Counter()
    for i,k in enumerate(ks):
        pp_=pts(k,seq[i]); P+= pp_ if not P else pp_[1:]
        L+=E['len'][k]; s+=E['s'][k]; nm[E['nm'][k]]+=E['len'][k]
    for u in seq[1:-1]: pass
    # ascent along node elevations
    zs=[ele[u] for u in seq]
    dz=zs[-1]-zs[0]   # net climb per contracted edge (sub-segment wiggles are DTM noise)
    up=max(0.0,dz); dn=max(0.0,-dz)
    zones=set()
    step=max(1,len(P)//6)
    for i in range(0,len(P),step): zones.add(qid(*P[i]))
    zones.add(nq[nid[a]]); zones.add(nq[nid[b]])
    zones=sorted(zones)[:4]
    P=dp(P)
    k0=ks[0]
    out_e.append(dict(cm=cem[k0],a=nid[a],b=nid[b],len=L,up=up,dn=dn,s=min(s,15),c=E['c'][k0],p=E['p'][k0],nm=nm.most_common(1)[0][0],z=zones,g=P[1:-1]))
print('final nodes',len(nodes),'edges',len(out_e),'geom pts',sum(len(e['g']) for e in out_e))
# --- encode binary ---
la0,la1=min(lat[u] for u in nodes),max(lat[u] for u in nodes); lo0,lo1=min(lon[u] for u in nodes),max(lon[u] for u in nodes)
def qy(v): return max(0,min(65535,round((v-la0)/(la1-la0)*65535)))
def qx(v): return max(0,min(65535,round((v-lo0)/(lo1-lo0)*65535)))
import array
ny=array.array('H',[qy(lat[u]) for u in nodes]); nx=array.array('H',[qx(lon[u]) for u in nodes])
nz=array.array('H',[round(ele[u]*10) for u in nodes]); nc=array.array('H',[nodeclus.get(u,0) for u in nodes])
nqq=array.array('B',nq)
ea=array.array('I',[e['a'] for e in out_e]); eb=array.array('I',[e['b'] for e in out_e])
el=array.array('H',[min(65535,round(e['len']*2)) for e in out_e])  # half-metres
eu=array.array('H',[round(e['up']*10) for e in out_e]); ed=array.array('H',[round(e['dn']*10) for e in out_e])
ef=array.array('B',[e['c']|(e['p']<<2)|(e['s']<<4) for e in out_e])
en=array.array('H',[(e['nm']+1) if e['nm']>=0 else 0 for e in out_e])
ez=array.array('B'); 
for e in out_e: z=(e['z']+[0,0,0,0])[:4]; ez.extend(z)
go=array.array('I',[0]); gy=array.array('H'); gx=array.array('H')
for e in out_e:
    for p in e['g']: gy.append(qy(p[0])); gx.append(qx(p[1]))
    go.append(len(gy))
nN=len(nodes); nEE=len(out_e); nG=len(gy)
ecm=array.array('B',[e['cm'] for e in out_e])
parts=[ny,nx,nz,nc,nqq,ea,eb,el,eu,ed,ef,en,ez,go,gy,gx,ecm]
print('cemetery edges in final graph',sum(ecm))
buf=b''
offs=[]
for p in parts:
    while len(buf)%4: buf+=b'\0'
    offs.append(len(buf)); buf+=p.tobytes()
open('out/graph.bin','wb').write(buf)
meta=dict(nN=nN,nE=nEE,nG=nG,offs=offs,bbox=[la0,la1,lo0,lo1],names=D['names'],
  quartiers=[dict(id=i+1,name=f['properties']['l_qu'],ar=f['properties']['c_ar']) for i,f in enumerate(feats)],
  nSigClusters=len(roots))
st_out=[]
for name,poly in showP:
    g=poly.simplify(0.00003)
    geoms=[g] if g.geom_type=='Polygon' else [x for x in getattr(g,'geoms',[]) if x.geom_type=='Polygon']
    rings=[[[round(y,5),round(x,5)] for x,y in p.exterior.coords] for p in geoms if p.area>0]
    if rings: st_out.append(dict(name=name,rings=rings))
meta['stations']=st_out
cm_out=[]
for name,poly in zip(cemNames,cemP):
    g=poly.simplify(0.00003)
    geoms=[g] if g.geom_type=='Polygon' else [x for x in getattr(g,'geoms',[]) if x.geom_type=='Polygon']
    rings=[]
    for p in geoms:
        rings.append([[round(y,5),round(x,5)] for x,y in p.exterior.coords])
        for h in p.interiors: rings.append([[round(y,5),round(x,5)] for x,y in h.coords])
    if rings: cm_out.append(dict(name=name,rings=rings))
meta['cemeteries']=cm_out
print('stations shown',len(st_out))
json.dump(meta,open('out/meta.json','w'),ensure_ascii=False)
print('bin bytes',len(buf))
