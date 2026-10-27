import osmium,sys,json
pbf,s,n,w,e,out=sys.argv[1],*map(float,sys.argv[2:6]),sys.argv[6]
P=[]
AM={'restaurant','cafe','bar','fast_food','pub','ice_cream','cinema','theatre','marketplace'}
for o in osmium.FileProcessor(pbf).with_locations().with_filter(osmium.filter.KeyFilter('shop','amenity','tourism','railway')):
    t=o.tags
    if not (t.get('shop') or t.get('amenity') in AM or t.get('tourism') in ('museum','attraction') or t.get('railway') in ('subway_entrance',)):continue
    if o.is_node(): la,lo=o.location.lat,o.location.lon
    elif o.is_way():
        try: g=[(x.location.lat,x.location.lon) for x in o.nodes]
        except Exception: continue
        la=sum(a for a,_ in g)/len(g); lo=sum(b for _,b in g)/len(g)
    else: continue
    if s<=la<=n and w<=lo<=e: P.append([round(la,6),round(lo,6)])
json.dump(P,open(out,'w')); print(len(P))
