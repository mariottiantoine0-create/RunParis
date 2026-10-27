import osmium,sys,json
from shapely.geometry import Polygon,MultiPolygon
from shapely.ops import unary_union
pbf,center,la,lo,rad=sys.argv[1],sys.argv[2],float(sys.argv[3]),float(sys.argv[4]),float(sys.argv[5])
C={}
fp=osmium.FileProcessor(pbf).with_areas().with_filter(osmium.filter.TagFilter(('boundary','administrative')))
for o in fp:
    if not o.is_area() or o.from_way() or o.tags.get('admin_level')!='8':continue
    try:
        polys=[Polygon([(n.lon,n.lat) for n in r]) for r in o.outer_rings()]
    except Exception:continue
    g=unary_union(polys)
    c=g.representative_point()
    if abs(c.y-la)>rad or abs(c.x-lo)>rad*1.4:continue
    C[o.tags.get('ref:INSEE','')]=(o.tags.get('name'),g)
ce=C[center][1].buffer(0.0003)
nb=[(k,v[0],round(v[1].area*1e4,1)) for k,v in C.items() if k!=center and ce.intersects(v[1])]
print(C[center][0],[round(x,4) for x in C[center][1].bounds])
for k,n,a in sorted(nb,key=lambda x:x[1]):print(k,n,a)
allg=unary_union([C[center][1]]+[C[k][1] for k,_,_ in nb]);print('bbox lonlat',[round(x,4) for x in allg.bounds])
json.dump({'center':center,'communes':[center]+[k for k,_,_ in nb]},open(sys.argv[6],'w'))
