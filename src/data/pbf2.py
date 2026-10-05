import osmium, json, time
PBF='/mnt/user-data/uploads/Downloads/idf.osm.pbf'
S,Wb,N,Eb=48.799,2.180,48.975,2.500
r5=lambda v:round(v,5); r6=lambda v:round(v,6)
def cls(t):
    if t.get('landuse')=='cemetery' or t.get('amenity')=='grave_yard': return 'cemetery','cemetery'
    if t.get('natural')=='water' or t.get('waterway')=='riverbank' or t.get('landuse')=='basin': return 'water',t.get('water') and 'water' or t.get('landuse','water')
    for k,vs in (('leisure',('park','garden','recreation_ground','playground')),('landuse',('grass','forest','recreation_ground')),('natural',('wood',))):
        if t.get(k) in vs: return 'green',t.get(k)
    return None
def isStation(t):
    return t.get('building')=='train_station' or t.get('railway') in ('station','platform') or t.get('public_transport') in ('station','platform') or t.get('landuse')=='railway'
bg=[]; st=[]; t0=time.time()
fp=osmium.FileProcessor(PBF).with_areas().with_filter(osmium.filter.KeyFilter('leisure','landuse','natural','amenity','waterway','building','railway','public_transport'))
for o in fp:
    if not o.is_area(): continue
    t=o.tags; c=cls(t); s=isStation(t)
    if not c and not s: continue
    try:
        outs=[]; 
        for ring in o.outer_rings():
            g=[(n.lat,n.lon) for n in ring]
            inner=[[(n.lat,n.lon) for n in ir] for ir in o.inner_rings(ring)]
            outs.append((g,inner))
    except Exception: continue
    if not any(S<=la<=N and Wb<=lo<=Eb for g,_ in outs for la,lo in g): continue
    oid=('w' if o.from_way() else 'r')+str(o.orig_id())
    if c:
        w=[]
        for g,inn in outs:
            w.append(dict(r='outer',g=[[r5(a),r5(b)] for a,b in g]))
            for ig in inn: w.append(dict(r='inner',g=[[r5(a),r5(b)] for a,b in ig]))
        bg.append(dict(c=c[0],k=c[1],n=t.get('name',''),oh=t.get('opening_hours',''),id=oid,w=w))
    if s:
        st.append(dict(id=oid,tags=dict(t),rings=[[[r6(a),r6(b)] for a,b in g] for g,_ in outs]))
print('areas',time.time()-t0,len(bg),len(st))
json.dump(bg,open('pbf_bg.json','w')); json.dump(st,open('pbf_st.json','w'))
# routes: subway/train/RER with stop nodes
rels=[]
for o in osmium.FileProcessor(PBF,osmium.osm.RELATION).with_filter(osmium.filter.TagFilter(('type','route'))):
    if o.tags.get('route') in ('subway','train','light_rail','tram'):
        rels.append(dict(id=o.id,tags=dict(o.tags),stops=[m.ref for m in o.members if m.type=='n']))
need=set(n for r in rels for n in r['stops']); loc={}
for o in osmium.FileProcessor(PBF,osmium.osm.NODE):
    if o.id in need: loc[o.id]=(o.location.lat,o.location.lon,o.tags.get('name',''),dict(o.tags))
for r in rels: r['stops']=[[n,*loc[n][:3]] for n in r['stops'] if n in loc]
json.dump(rels,open('pbf_routes.json','w')); print('routes',len(rels),time.time()-t0)
