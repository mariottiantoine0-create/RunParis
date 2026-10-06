import osmium, json, time
PBF='/mnt/user-data/uploads/Downloads/idf.osm.pbf'
S,Wb,N,Eb=48.799,2.180,48.975,2.500
inb=lambda la,lo:S<=la<=N and Wb<=lo<=Eb
HW=set('secondary residential tertiary living_street pedestrian primary path footway service unclassified track cycleway steps primary_link secondary_link tertiary_link corridor'.split())
GATES={'gate','lift_gate','swing_gate','sliding_gate','full-height_turnstile','turnstile','barrier_board','chain','bollard'}
t=time.time()
# pass 1 : barrières
gate={}
for o in osmium.FileProcessor(PBF).with_filter(osmium.filter.KeyFilter('barrier')):
    if o.is_node():
        la,lo=o.location.lat,o.location.lon
        if not inb(la,lo): continue
        tg=o.tags; b=tg.get('barrier')
        if b not in GATES: continue
        acc=tg.get('access'); foot=tg.get('foot'); locked=tg.get('locked')
        gate[o.id]=dict(b=b,acc=acc,foot=foot,locked=locked,ll=[la,lo])
print('gates',len(gate),time.time()-t)
out=[]
fp=osmium.FileProcessor(PBF).with_locations().with_filter(osmium.filter.KeyFilter('highway'))
for o in fp:
    if not o.is_way(): continue
    t2=o.tags; h=t2.get('highway')
    if h not in HW: continue
    try: g=[(n.location.lat,n.location.lon) for n in o.nodes]
    except osmium.InvalidLocationError: continue
    if not any(inb(*p) for p in g): continue
    acc=t2.get('access'); foot=t2.get('foot'); svc=t2.get('service')
    footok=foot in ('yes','designated','permissive')
    why=None
    if acc in ('private','no','customers','delivery','agricultural','forestry') and not footok: why='access='+acc
    elif foot in ('no','private'): why='foot='+foot
    elif h=='service' and svc in ('driveway','parking_aisle','drive-through') and acc not in ('yes','permissive','public') and not footok: why='service='+svc
    gs=[gate[n.ref] for n in o.nodes if n.ref in gate]
    gw=None
    for gg in gs:
        if gg['foot'] in ('yes','designated','permissive') or gg['acc'] in ('yes','permissive','public'): continue
        if gg['acc'] in ('private','no') or gg['locked']=='yes' or (gg['acc'] is None and h in ('service','residential','living_street') and gg['b'] in ('gate','lift_gate','swing_gate','sliding_gate')):
            gw=gg; break
    if not why and gw: why='barrier='+gw['b']+(' access='+gw['acc'] if gw['acc'] else '')
    if why: out.append(dict(id=o.id,h=h,name=t2.get('name',''),why=why,g=[[round(a,7),round(b,7)] for a,b in g],gate=gw['ll'] if gw else None))
print('ways',len(out),time.time()-t)
json.dump(out,open('/home/claude/priv/priv.json','w'))
import collections; print(collections.Counter(x['why'].split('=')[0]+'='+x['why'].split('=')[1].split()[0] for x in out).most_common(20))
