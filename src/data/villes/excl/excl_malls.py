import osmium, json
PBF='/home/claude/lyon/raw/lyon.osm.pbf'
S,Wb,N,Eb=45.675,4.70,45.855,4.98
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
