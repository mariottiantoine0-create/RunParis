// rues très fréquentées (D-109) : densité de commerces, cafés, restaurants, musées, sorties de métro le long de chaque rue, lissée par rue
const fs=require('fs'),E=require('./engine.js');const meta=JSON.parse(fs.readFileSync('meta.json'));const b=fs.readFileSync('graph.bin');
const G=E.init(meta,b.buffer.slice(b.byteOffset,b.byteOffset+b.length));const nE=G.LEN.length;
const P=JSON.parse(fs.readFileSync('crowd_pts.json')).map(([la,lo])=>E.toXY(la,lo));const CS=40,grid=new Map();
for(const [x,y] of P){const k=Math.floor(x/CS)+','+Math.floor(y/CS);(grid.get(k)||grid.set(k,[]).get(k)).push([x,y]);}
const cnt=new Float32Array(nE);
for(let e=0;e<nE;e++){const p=E.edgePts(e);let c=0;const seen=new Set();for(let i=0;i<p.length;i++){const [x,y]=p[i];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const L=grid.get((Math.floor(x/CS)+dx)+','+(Math.floor(y/CS)+dy));if(!L)continue;for(const q of L){if(seen.has(q))continue;let best=1e9;for(let j=1;j<p.length;j++){const [ax,ay]=p[j-1],[bx,by]=p[j],vx=bx-ax,vy=by-ay,l2=vx*vx+vy*vy||1,t=Math.max(0,Math.min(1,((q[0]-ax)*vx+(q[1]-ay)*vy)/l2));best=Math.min(best,Math.hypot(q[0]-ax-vx*t,q[1]-ay-vy*t));}if(best<=22){seen.add(q);c++;}}}}cnt[e]=c;}
// lissage par rue nommée
const byN=new Map();for(let e=0;e<nE;e++){const n=G.en[e];if(!n)continue;const s=byN.get(n)||{c:0,l:0};s.c+=cnt[e];s.l+=G.LEN[e];byN.set(n,s);}
const dens=new Float32Array(nE);for(let e=0;e<nE;e++){const own=cnt[e]/Math.max(G.LEN[e],30)*100;const s=G.en[e]&&byN.get(G.en[e]);dens[e]=s?0.5*own+0.5*s.c/Math.max(s.l,60)*100:own;}
// seuils : 0,3 % du réseau en niveau 3, 0,6 % en 2, 1 % en 1 (comme Lyon)
const idx=[...Array(nE).keys()].filter(e=>dens[e]>0).sort((a,b)=>dens[b]-dens[a]);const tot=G.LEN.reduce((a,b)=>a+b,0);const lv=new Uint8Array(nE);let acc=0;
for(const e of idx){acc+=G.LEN[e];const f=acc/tot;lv[e]=f<=0.003?3:f<=0.009?2:f<=0.019?1:0;if(f>0.019)break;}
const CUR=JSON.parse(fs.readFileSync('cur.json','utf8'));for(let e=0;e<nE;e++){const n=G.en[e]&&meta.names[G.en[e]-1];if(n&&CUR[n]!=null)lv[e]=Math.max(lv[e],CUR[n]);}
const u=new Uint8Array(Math.ceil(nE/4));for(let e=0;e<nE;e++)u[e>>2]|=lv[e]<<(2*(e&3));fs.writeFileSync('pub/crowd.txt',Buffer.from(u).toString('base64'));
const L=[0,0,0,0];for(let e=0;e<nE;e++)L[lv[e]]+=G.LEN[e];console.log('shares',L.map(x=>(x/tot*100).toFixed(2)+'%').join(' '));
const s={};for(let e=0;e<nE;e++)if(lv[e]==3&&G.en[e]){const n=meta.names[G.en[e]-1];s[n]=(s[n]||0)+G.LEN[e];}console.log(Object.entries(s).sort((a,b)=>b[1]-a[1]).slice(0,14).map(x=>x[0]+':'+Math.round(x[1])).join(' | '));
