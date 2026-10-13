const fs=require('fs'),E=require('./engine.js');const meta=JSON.parse(fs.readFileSync('meta.json'));const buf=fs.readFileSync('graph.bin');
const G=E.init(meta,buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
// --- metro
const raw=JSON.parse(fs.readFileSync('metro_raw.json'));
const clean=n=>n.replace(/^Paris /,'').replace(/ ?\((Métro|RER)\)$/,'').replace(/ RER$/,'').replace(/ — /g,' - ').trim();
let st=raw.stations.map(([n,la,lo,ls])=>({n:clean(n),la,lo,ls})).filter(s=>s.la>meta.bbox[0]-0.005&&s.la<meta.bbox[1]+0.005&&s.lo>meta.bbox[2]-0.005&&s.lo<meta.bbox[3]+0.005);
const d=(a,b)=>Math.hypot((a.la-b.la)*111320,(a.lo-b.lo)*73300);
const out=[];for(const s of st.sort((a,b)=>b.ls.length-a.ls.length)){const nn=x=>x.toLowerCase().replace(/^gare (de |d'|du )?/,'');const m=out.find(o=>(d(o,s)<220&&o.ls.some(l=>s.ls.includes(l)))||(d(o,s)<450&&(nn(o.n).includes(nn(s.n))||nn(s.n).includes(nn(o.n)))));if(m){m.ls=[...new Set([...m.ls,...s.ls])];if(s.n.length<m.n.length&&!/^Gare/.test(m.n))m.n=s.n;}else out.push({...s});}
const ord=l=>(l.startsWith('M')?l.charCodeAt(1):200+l.charCodeAt(0)+parseFloat(l.slice(1)||'0'));
for(const o of out)o.ls.sort((a,b)=>ord(a)-ord(b));
// keep only stations with a node within 300 m (inside our map)
const res=[];for(const o of out){const [x,y]=E.toXY(o.la,o.lo);const v=E.nearest(x,y);if(v>=0&&Math.hypot(G.NX[v]-x,G.NY[v]-y)<300)res.push([o.n,+o.la.toFixed(5),+o.lo.toFixed(5),o.ls]);}
fs.writeFileSync('pub/metro.json',JSON.stringify({lines:raw.lines,stations:res}));
console.log('stations',st.length,'->',res.length, res.map(r=>r[0]+' '+r[3].join(',')).join(' | '));
// --- trees
const xs=[];let mx=0,my=0,minx=1e9,miny=1e9;
for(const l of fs.readFileSync('trees.csv','utf8').split('\n')){const [a,b]=l.split(',').map(Number);if(!isFinite(a)||!isFinite(b))continue;const [x,y]=E.toXY(a,b);xs.push([Math.round(x),Math.round(y)]);mx=Math.max(mx,x);my=Math.max(my,y);minx=Math.min(minx,x);miny=Math.min(miny,y);}
// sort by 200 m cell for locality
xs.sort((p,q)=>(Math.floor(p[1]/200)-Math.floor(q[1]/200))||(p[0]-q[0]));
const a=new Int16Array(xs.length*2);xs.forEach(([x,y],i)=>{a[2*i]=x;a[2*i+1]=y;});
fs.writeFileSync('pub/trees.txt',Buffer.from(a.buffer).toString('base64'));
console.log('trees',xs.length,'range',minx|0,miny|0,mx|0,my|0,'maxX',G.maxX,G.maxY);
