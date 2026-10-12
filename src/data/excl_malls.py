import osmium, json
PBF='/mnt/user-data/uploads/Downloads/idf.osm.pbf'
S,Wb,N,Eb=48.799,2.180,48.975,2.500
out=[]
class H(osmium.SimpleHandler):
    def area(self,a):
        t=a.tags
        if t.get('shop')!='mall': return
        try:
            for r in a.outer_rings():
                g=[(n.lat,n.lon) for n in r]
                if any(S<=la<=N and Wb<=lo<=Eb for la,lo in g): out.append(dict(name=t.get('name',''),bld=t.get('building',''),g=g))
        except Exception as e: pass
h=H(); h.apply_file(PBF,locations=True)
json.dump(out,open('malls.json','w')); print(len(out)); print([ (m['name'],m['bld']) for m in out])
