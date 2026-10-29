import osmium,sys,json,math
from shapely.geometry import Polygon,Point,shape
from shapely.ops import unary_union
pbf,out=sys.argv[1],sys.argv[2]
Z=unary_union([shape(f['geometry']) for f in json.load(open(sys.argv[3]))['features']])
T=[];N=[]
for o in osmium.FileProcessor(pbf).with_locations().with_filter(osmium.filter.KeyFilter('leisure')):
    if not o.is_way(): continue
    t=o.tags; l=t.get('leisure')
    try: g=[(n.location.lat,n.location.lon) for n in o.nodes]
    except Exception: continue
    if len(g)<4 or g[0]!=g[-1]: continue
    if not Z.contains(Point(g[0][1],g[0][0])): continue
    if l=='track' and any(s in t.get('sport','') for s in ('athletics','running')): T.append((t.get('name',''),g))
    elif l in ('stadium','sports_centre','pitch') and t.get('name'): N.append((t['name'],Polygon([(b,a) for a,b in g]),l))
res=[]
for n,g in T:
    c=Point(sum(p[1] for p in g)/len(g),sum(p[0] for p in g)/len(g))
    if not n:
        for nm,P,l in sorted(N,key=lambda x:x[2]!='stadium'):
            if P.contains(c): n=nm;break
    p=sum(math.hypot((g[i][0]-g[i-1][0])*111195,(g[i][1]-g[i-1][1])*111195*math.cos(math.radians(g[i][0]))) for i in range(1,len(g)))
    if p<380: continue
    res.append([n,int(p//100*100),[[round(a,6),round(b,6)] for a,b in g]])
json.dump(res,open(out,'w'),ensure_ascii=False,separators=(',',':'))
for r in res: print(r[0],r[1],len(r[2]))
