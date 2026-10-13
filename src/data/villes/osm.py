# Extraction OSM d'une ville (Perfect Run) : voies, feux, éclairage, arbres, points, fonds (parcs, eau, cimetières), gares, lignes, limites.
import osmium, json, time, sys
CFG=json.load(open(sys.argv[1])); PBF=CFG['pbf']; S,N,Wb,Eb=CFG['bbox']
inb=lambda la,lo:S<=la<=N and Wb<=lo<=Eb
HW=set('secondary residential tertiary living_street pedestrian primary path footway service unclassified track cycleway steps primary_link secondary_link tertiary_link corridor'.split())
r7=lambda v:round(v,7); r5=lambda v:round(v,5); r6=lambda v:round(v,6)
ways=[]; sig={}; lit={'yes':[],'no':[]}; trees=[]; pts=[]; t=time.time()
fp=osmium.FileProcessor(PBF).with_locations().with_filter(osmium.filter.KeyFilter('highway','natural','amenity','railway','station','tourism','public_transport','crossing'))
for o in fp:
    if o.is_node():
        la,lo=o.location.lat,o.location.lon
        if not inb(la,lo): continue
        tg=o.tags
        if tg.get('highway')=='traffic_signals' or tg.get('crossing')=='traffic_signals': sig[str(o.id)]=[la,lo]
        if tg.get('natural')=='tree': trees.append('%s,%s'%(r5(la),r5(lo)))
        if tg.get('amenity')=='drinking_water' or tg.get('railway') in ('station','halt') or tg.get('station') in ('subway','funicular') or tg.get('railway')=='tram_stop' or (tg.get('tourism') in ('attraction','museum','viewpoint') and 'name' in tg):
            pts.append(dict(id=o.id,lat=la,lon=lo,tags=dict(tg)))
    elif o.is_way():
        h=o.tags.get('highway')
        if not h: continue
        try: g=[(n.location.lat,n.location.lon) for n in o.nodes]
        except osmium.InvalidLocationError: continue
        if not any(inb(*p) for p in g): continue
        if 'lit' in o.tags and o.tags['lit'] in ('yes','no'): lit[o.tags['lit']].append([[r5(a),r5(b)] for a,b in g])
        if h in HW: ways.append(dict(id=o.id,tags=dict(o.tags),nodes=[n.ref for n in o.nodes],g=[[r7(a),r7(b)] for a,b in g]))
print('pass1',round(time.time()-t),len(ways),len(sig),len(trees),len(pts),len(lit['yes']),len(lit['no']))
json.dump(dict(ways=ways,sig=sig),open('osm_ways.json','w'))
json.dump(lit,open('osm_lit.json','w')); open('osm_trees.csv','w').write('\n'.join(trees)); json.dump(pts,open('osm_pts.json','w'))
def cls(t):
    if t.get('landuse')=='cemetery' or t.get('amenity')=='grave_yard': return 'cemetery','cemetery'
    if t.get('natural')=='water' or t.get('waterway')=='riverbank' or t.get('landuse')=='basin': return 'water',t.get('water') and 'water' or t.get('landuse','water')
    for k,vs in (('leisure',('park','garden','recreation_ground','playground')),('landuse',('grass','forest','recreation_ground')),('natural',('wood',))):
        if t.get(k) in vs: return 'green',t.get(k)
    return None
def isStation(t):
    return t.get('building')=='train_station' or t.get('railway') in ('station','platform') or t.get('public_transport') in ('station','platform') or t.get('landuse')=='railway'
bg=[]; st=[]; adm=[]; T0=time.time()
fp=osmium.FileProcessor(PBF).with_areas().with_filter(osmium.filter.KeyFilter('leisure','landuse','natural','amenity','waterway','building','railway','public_transport','boundary'))
for o in fp:
    if not o.is_area(): continue
    tg_=o.tags; t=tg_
    isadm = t.get('boundary')=='administrative' and t.get('admin_level') in ('8','9','10') and o.from_way()==False
    c=cls(t); s=isStation(t)
    if not c and not s and not isadm: continue
    try:
        outs=[]
        for ring in o.outer_rings():
            g=[(n.lat,n.lon) for n in ring]
            inner=[[(n.lat,n.lon) for n in ir] for ir in o.inner_rings(ring)]
            outs.append((g,inner))
    except Exception: continue
    if isadm:
        adm.append(dict(name=t.get('name',''),level=t.get('admin_level'),insee=t.get('ref:INSEE',''),rings=[[[r6(a),r6(b)] for a,b in g] for g,_ in outs],holes=[[[r6(a),r6(b)] for a,b in h] for _,inn in outs for h in inn]))
        continue
    if not any(inb(la,lo) for g,_ in outs for la,lo in g): continue
    oid=('w' if o.from_way() else 'r')+str(o.orig_id())
    if c:
        w=[]
        for g,inn in outs:
            w.append(dict(r='outer',g=[[r5(a),r5(b)] for a,b in g]))
            for ig in inn: w.append(dict(r='inner',g=[[r5(a),r5(b)] for a,b in ig]))
        bg.append(dict(c=c[0],k=c[1],n=t.get('name',''),oh=t.get('opening_hours',''),id=oid,w=w))
    if s: st.append(dict(id=oid,tags=dict(t),rings=[[[r6(a),r6(b)] for a,b in g] for g,_ in outs]))
print('areas',round(time.time()-T0),len(bg),len(st),'admin',len(adm))
json.dump(bg,open('osm_bg.json','w')); json.dump(st,open('osm_st.json','w')); json.dump(adm,open('osm_admin.json','w'),ensure_ascii=False)
rels=[]
for o in osmium.FileProcessor(PBF,osmium.osm.RELATION).with_filter(osmium.filter.TagFilter(('type','route'))):
    if o.tags.get('route') in ('subway','train','light_rail','tram','funicular'):
        rels.append(dict(id=o.id,tags=dict(o.tags),stops=[m.ref for m in o.members if m.type=='n'],ways=[m.ref for m in o.members if m.type=='w']))
need=set(n for r in rels for n in r['stops']); loc={}
for o in osmium.FileProcessor(PBF,osmium.osm.NODE):
    if o.id in need: loc[o.id]=(o.location.lat,o.location.lon,o.tags.get('name',''))
for r in rels: r['stops']=[[n,*loc[n]] for n in r['stops'] if n in loc]
json.dump(rels,open('osm_routes.json','w'),ensure_ascii=False); print('routes',len(rels),round(time.time()-T0))
