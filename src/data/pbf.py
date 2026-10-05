import osmium, json, time
PBF='/mnt/user-data/uploads/Downloads/idf.osm.pbf'
S,Wb,N,Eb=48.799,2.180,48.975,2.500
inb=lambda la,lo:S<=la<=N and Wb<=lo<=Eb
HW=set('secondary residential tertiary living_street pedestrian primary path footway service unclassified track cycleway steps primary_link secondary_link tertiary_link corridor'.split())
r7=lambda v:round(v,7); r5=lambda v:round(v,5)
ways=[]; sig={}; lit={'yes':[],'no':[]}; trees=[]; pts=[]
t=time.time()
fp=osmium.FileProcessor(PBF).with_locations().with_filter(osmium.filter.KeyFilter('highway','natural','amenity','railway','station','tourism','public_transport','crossing'))
for o in fp:
    if o.is_node():
        la,lo=o.location.lat,o.location.lon
        if not inb(la,lo): continue
        tg=o.tags
        if tg.get('highway')=='traffic_signals' or tg.get('crossing')=='traffic_signals': sig[str(o.id)]=[la,lo]
        if tg.get('natural')=='tree': trees.append('%s,%s'%(r5(la),r5(lo)))
        if tg.get('amenity')=='drinking_water' or tg.get('railway')=='station' or tg.get('station')=='subway' or (tg.get('tourism') in ('attraction','museum','viewpoint') and 'name' in tg):
            pts.append(dict(id=o.id,lat=la,lon=lo,tags=dict(tg)))
    elif o.is_way():
        h=o.tags.get('highway')
        if not h: continue
        try: g=[(n.location.lat,n.location.lon) for n in o.nodes]
        except osmium.InvalidLocationError: continue
        if not any(inb(*p) for p in g): continue
        if 'lit' in o.tags and o.tags['lit'] in ('yes','no'): lit[o.tags['lit']].append([[r5(a),r5(b)] for a,b in g])
        if h in HW: ways.append(dict(id=o.id,tags=dict(o.tags),nodes=[n.ref for n in o.nodes],g=[[r7(a),r7(b)] for a,b in g]))
print('pass1',time.time()-t,len(ways),len(sig),len(trees),len(pts),len(lit['yes']),len(lit['no']))
P='/mnt/user-data/uploads/Downloads/RunParis-data/'
json.dump(dict(ways=ways,sig=sig),open('pbf_ways.json','w'))
json.dump(lit,open('pbf_lit.json','w')); open('pbf_trees.csv','w').write('\n'.join(trees)); json.dump(pts,open('pbf_pts.json','w'))
