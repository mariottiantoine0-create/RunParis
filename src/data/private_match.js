const fs=require('fs'); const E=require('/mnt/user-data/outputs/RunParis/src/engine.js');
const SITE='/mnt/user-data/outputs/RunParis/site/';
const meta=JSON.parse(fs.readFileSync(SITE+'meta.json')); const buf=fs.readFileSync(SITE+'graph.bin');
const G=E.init(meta, buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength));
const P=JSON.parse(fs.readFileSync('priv.json')).filter(w=>!/^foot=/.test(w.why)&&!['primary','secondary','tertiary','primary_link','secondary_link','tertiary_link'].includes(w.h));
const PATHS=new Set(['footway','path','cycleway','pedestrian','track','steps','corridor']);
// grille des segments privés
const C=40, grid=new Map(); const segs=[];
for (const w of P){ const xy=w.g.map(([la,lo])=>E.toXY(la,lo)); for(let i=1;i<xy.length;i++){ const s=[xy[i-1][0],xy[i-1][1],xy[i][0],xy[i][1],w]; const k=segs.push(s)-1;
  const x0=Math.floor(Math.min(s[0],s[2])/C)-1,x1=Math.floor(Math.max(s[0],s[2])/C)+1,y0=Math.floor(Math.min(s[1],s[3])/C)-1,y1=Math.floor(Math.max(s[1],s[3])/C)+1;
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const kk=x+','+y; if(!grid.has(kk))grid.set(kk,[]); grid.get(kk).push(k);} } }
const sd=(px,py,s)=>{const vx=s[2]-s[0],vy=s[3]-s[1],l=vx*vx+vy*vy||1e-9,t=Math.max(0,Math.min(1,((px-s[0])*vx+(py-s[1])*vy)/l));return Math.hypot(px-s[0]-vx*t,py-s[1]-vy*t);};
const near=(x,y)=>{const a=grid.get(Math.floor(x/C)+','+Math.floor(y/C)); if(!a)return null; let b=null,bd=4; for(const k of a){const w=segs[k][4]; if(NEEDP!==PATHS.has(w.h)) continue; const d=sd(x,y,segs[k]); if(d<bd){bd=d;b=w;}} return b;};
let NEEDP=false;
// côté « impasse » : en retirant l'arête, un des deux côtés ne mène qu'à moins de 600 m de rues
const sideLen=(start,skip)=>{ const seen=new Set([start]), st=[start]; let L=0; while(st.length){ const v=st.pop(); for(let k=G.deg[v];k<G.deg[v+1];k++){ const e=G.adjE[k]; if(e===skip) continue; L+=G.LEN[e]; if(L>600) return L; const u=G.ea[e]===v?G.eb[e]:G.ea[e]; if(!seen.has(u)){seen.add(u); st.push(u);} } } return L; };
const deadEnd=e=>sideLen(G.ea[e],e)<=600||sideLen(G.eb[e],e)<=600;
const nE=G.nE, bits=new Uint8Array(Math.ceil(nE/8)); let n=0,len=0; const ex=[];
for(let e=0;e<nE;e++){ if(G.P[e]===0 && G.C[e]>0) continue; NEEDP=G.P[e]>0; const pts=E.edgePts(e); let tot=0,inP=0; const ws=new Set();
  for(let i=1;i<pts.length;i++){ const L=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]); const steps=Math.max(1,Math.ceil(L/4));
    for(let s=0;s<steps;s++){ const t=(s+.5)/steps, x=pts[i-1][0]+(pts[i][0]-pts[i-1][0])*t, y=pts[i-1][1]+(pts[i][1]-pts[i-1][1])*t; const w=near(x,y); tot+=L/steps; if(w){inP+=L/steps; ws.add(w);} } }
  const onlyGate=[...ws].every(w=>/^barrier/.test(w.why));
  if(tot>0 && inP/tot>=0.7 && (!onlyGate || deadEnd(e))){ bits[e>>3]|=1<<(e&7); n++; len+=G.LEN[e]; if(ex.length<100000) ex.push([e,Math.round(G.LEN[e]),G.en[e]?meta.names[G.en[e]-1]:'',[...ws].map(w=>w.why).join('|')]); }
}
console.log('edges',n,'of',nE,'km',Math.round(len/1000));
fs.writeFileSync('private.txt', Buffer.from(bits).toString('base64'));
fs.writeFileSync('ex.json',JSON.stringify(ex));
const byname={}; for(const [e,L,nm,w] of ex){ byname[nm]=(byname[nm]||0)+L; } console.log(Object.entries(byname).sort((a,b)=>b[1]-a[1]).slice(0,40));
// Square Pétrelle ?
console.log(ex.filter(x=>/Pétrelle/.test(x[2])));
