import json, math, collections
d=json.load(open('cand.json'))
def L(g): return sum(math.hypot((g[i][0]-g[i-1][0])*111000,(g[i][1]-g[i-1][1])*73000) for i in range(1,len(g)))
def lv(s):
    try: return min(float(x) for x in s.replace(',',';').split(';'))
    except: return 0
out=[]
for x in d:
    t=x['t']; h=x['h']; why=None
    if h in('primary','secondary','tertiary','primary_link','secondary_link','tertiary_link','residential','unclassified','living_street','service'): 
        if t.get('indoor') not in (None,'no') or t.get('location') in('indoor',) : why='indoor'
    else:
        if h=='corridor' or t.get('indoor') not in (None,'no') or t.get('location') in ('indoor','underground'): why='indoor'
        elif t.get('covered')=='yes' and h in ('footway','pedestrian','steps','path') and not t.get('bridge'): why='covered'
        elif t.get('tunnel')=='building_passage' and L(x['g'])>40: why='passage'
        elif t.get('covered')=='building_passage' and L(x['g'])>40: why='passage'
    if why and x['t'].get('name','') in ('__none__',): why=None
    if why: x['why']=why; out.append(x)
print(len(out), collections.Counter(x['why'] for x in out))
json.dump(out,open('sel.json','w'))
