import osmium, json, time, collections
PBF='/home/claude/lyon/raw/lyon.osm.pbf'
S,Wb,N,Eb=45.675,4.70,45.855,4.98
inb=lambda la,lo:S<=la<=N and Wb<=lo<=Eb
HW=set('secondary residential tertiary living_street pedestrian primary path footway service unclassified track cycleway steps primary_link secondary_link tertiary_link corridor'.split())
out=[]; t=time.time()
fp=osmium.FileProcessor(PBF).with_locations().with_filter(osmium.filter.KeyFilter('highway'))
for o in fp:
    if not o.is_way(): continue
    tg=o.tags; h=tg.get('highway')
    if h not in HW: continue
    keys={k:tg.get(k) for k in ('covered','indoor','tunnel','bridge','level','layer','opening_hours','location','name','access','foot','area')}
    flag = keys['covered'] not in (None,'no') or keys['indoor'] not in (None,'no') or keys['tunnel'] is not None or keys['location'] in ('indoor','underground') or h=='corridor' or (keys['opening_hours'] and h in('footway','pedestrian','path','steps')) or (keys['level'] not in (None,'0'))
    if not flag: continue
    try: g=[(n.location.lat,n.location.lon) for n in o.nodes]
    except osmium.InvalidLocationError: continue
    if not any(inb(*p) for p in g): continue
    out.append(dict(id=o.id,h=h,t={k:v for k,v in keys.items() if v},g=[[round(a,7),round(b,7)] for a,b in g]))
print(len(out),time.time()-t)
json.dump(out,open('cand.json','w'))
