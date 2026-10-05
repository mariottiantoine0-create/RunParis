import json
from shapely.geometry import LineString, mapping
from shapely.ops import polygonize, unary_union
from shapely.validation import make_valid
R=json.load(open('/mnt/user-data/uploads/Downloads/RunParis-data/communes_osm.json'))['elements']
feats=[]
for r in R:
    outer=[m for m in r['members'] if m['type']=='way' and m.get('role') in ('outer','') and 'geometry' in m]
    lines=[LineString([(p['lon'],p['lat']) for p in m['geometry']]) for m in outer]
    P=make_valid(unary_union(list(polygonize(unary_union(lines)))))
    feats.append(dict(type='Feature',properties=dict(osm=r['id'],name=r['tags']['name'],insee=r['tags']['ref:INSEE']),geometry=mapping(P)))
    print(r['id'],r['tags']['name'],P.geom_type,round(P.area*111.32*73.3,2),'km2')
json.dump(dict(type='FeatureCollection',features=feats),open('communes.geojson','w'))
