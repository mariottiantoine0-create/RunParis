const fs=require('fs'); const E=require('./engine.js');
const meta=JSON.parse(fs.readFileSync('meta.json')); const buf=fs.readFileSync('graph.bin');
const G=E.init(meta, buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength));
// trees grid 20 m
const C=20, tg=new Map(); let nt=0;
for (const l of fs.readFileSync('trees.csv','utf8').split('\n')) { const [a,b]=l.split(',').map(Number); if(!isFinite(a)) continue; const [x,y]=E.toXY(a,b); const k=Math.floor(x/C)+','+Math.floor(y/C); (tg.get(k)||tg.set(k,[]).get(k)).push(x,y); nt++; }
// park polygons
const polys=[]; for (const rings of meta.layers.green) { for (const r of rings) { const p=r.map(([la,lo])=>E.toXY(la,lo)); let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const [x,y] of p){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);} polys.push({p,x0,y0,x1,y1}); } }
const PC=250, pg=new Map(); polys.forEach((q,i)=>{ for(let gx=Math.floor(q.x0/PC);gx<=Math.floor(q.x1/PC);gx++) for(let gy=Math.floor(q.y0/PC);gy<=Math.floor(q.y1/PC);gy++){const k=gx+','+gy;(pg.get(k)||pg.set(k,[]).get(k)).push(i);} });
function pip(x,y,p){let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const[xi,yi]=p[i],[xj,yj]=p[j];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))c=!c;}return c;}
function inPark(x,y){ const l=pg.get(Math.floor(x/PC)+','+Math.floor(y/PC)); if(!l) return false; let n=0; for(const i of l){const q=polys[i]; if(x<q.x0||x>q.x1||y<q.y0||y>q.y1) continue; if(pip(x,y,q.p)) n++;} return n%2===1 || n>0; }
function nearTree(x,y,R=12){ const gx=Math.floor(x/C),gy=Math.floor(y/C); for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const a=tg.get((gx+dx)+','+(gy+dy)); if(!a) continue; for(let i=0;i<a.length;i+=2) if((a[i]-x)**2+(a[i+1]-y)**2<R*R) return true;} return false; }
const out=new Uint8Array(G.nE); const hist=new Array(11).fill(0); let tot=0, gl=0;
for (let e=0;e<G.nE;e++){ const pts=E.edgePts(e); let n=0,park=0,tree=0;
  for(let i=1;i<pts.length;i++){ const [ax,ay]=pts[i-1],[bx,by]=pts[i]; const L=Math.hypot(bx-ax,by-ay); const k=Math.max(1,Math.round(L/10)); for(let s=0;s<k;s++){ const t=(s+.5)/k, x=ax+t*(bx-ax), y=ay+t*(by-ay); n++; if(inPark(x,y)) park++; else if(nearTree(x,y)) tree++; } }
  const g = n ? (park + 0.85*tree)/n : 0; out[e]=Math.round(Math.min(1,g)*255); hist[Math.round(g*10)]++; tot+=G.LEN[e]; gl+=G.LEN[e]*g; }
fs.writeFileSync('pub/green.txt', Buffer.from(out).toString('base64'));
console.log('trees',nt,'polys',polys.length,'edges',G.nE,'hist',hist.join(' '),'green share by length',(gl/tot*100).toFixed(1)+'%');
