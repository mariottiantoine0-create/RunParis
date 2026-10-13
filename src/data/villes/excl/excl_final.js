const fs=require('fs'); const E=require('/home/claude/lyon/pipe/work/engine.js');
const SITE='/home/claude/lyon/pipe/work/';
const meta=JSON.parse(fs.readFileSync(SITE+'meta.json')); const buf=fs.readFileSync(SITE+'graph.bin');
const G=E.init(meta, buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength));
const b64=s=>Uint8Array.from(Buffer.from(s,'base64'));
const ex=b64(fs.readFileSync('excl.txt','utf8')); const pv=b64(fs.readFileSync(SITE+'private.txt','utf8'));
for(const [e,nm,isP] of JSON.parse(fs.readFileSync('mall_edges.json'))) if(isP) ex[e>>3]|=1<<(e&7);
const bit=(b,e)=>(b[e>>3]>>(e&7))&1;
let n=0,L=0; for(let e=0;e<G.nE;e++) if(bit(ex,e)){n++;L+=G.LEN[e];}
console.log('excl edges',n,'km',(L/1000).toFixed(1));
// connectivity
function comp(block){ const lab=new Int32Array(G.nN).fill(-1); let best=0,bi=-1,c=0; const sizes=[];
  for(let s=0;s<G.nN;s++){ if(lab[s]>=0) continue; let sz=0; const st=[s]; lab[s]=c; while(st.length){const v=st.pop(); sz++; for(let k=G.deg[v];k<G.deg[v+1];k++){const e=G.adjE[k]; if(block(e)) continue; const u=G.ea[e]===v?G.eb[e]:G.ea[e]; if(lab[u]<0){lab[u]=c; st.push(u);}}} sizes.push(sz); if(sz>best){best=sz;bi=c;} c++; }
  return {lab,bi,best}; }
const A=comp(e=>bit(pv,e)||G.CEM[e]); const B=comp(e=>bit(pv,e)||G.CEM[e]||bit(ex,e));
console.log('main before',A.best,'after',B.best);
// nodes lost from main component that touch a non-excluded street
let lost=0; const names={}; for(let v=0;v<G.nN;v++) if(A.lab[v]===A.bi && B.lab[v]!==B.bi){ lost++; for(let k=G.deg[v];k<G.deg[v+1];k++){const e=G.adjE[k]; if(!bit(ex,e)&&!bit(pv,e)){const nm=G.en[e]?meta.names[G.en[e]-1]:'?'; names[nm]=(names[nm]||0)+1;}} }
console.log('lost nodes',lost, Object.entries(names).sort((a,b)=>b[1]-a[1]).slice(0,30));
fs.writeFileSync('excl_final.txt', Buffer.from(ex).toString('base64'));
// réouvre l'accès minimal aux îlots coupés (≥150 m de voies)
const mall=new Set(JSON.parse(fs.readFileSync('mall_edges.json')).filter(x=>x[2]).map(x=>x[0]));
let reopened=[];
for(let it=0;it<20;it++){ const C=comp(e=>bit(pv,e)||G.CEM[e]||bit(ex,e)); const clen=new Float64Array(G.nN);
  for(let e=0;e<G.nE;e++){ if(bit(pv,e)||G.CEM[e]||bit(ex,e)) continue; const c=C.lab[G.ea[e]]; clen[c]+=G.LEN[e]; }
  const best=new Map();
  for(let e=0;e<G.nE;e++){ if(!bit(ex,e)||mall.has(e)) continue; const a=C.lab[G.ea[e]], b=C.lab[G.eb[e]]; if(a===b) continue;
    const other=a===C.bi?b:(b===C.bi?a:-1); if(other<0||clen[other]<150) continue; const cur=best.get(other); if(!cur||G.LEN[e]<G.LEN[cur]) best.set(other,e); }
  if(!best.size) break; for(const e of best.values()){ ex[e>>3]&=~(1<<(e&7)); reopened.push([e,G.en[e]?meta.names[G.en[e]-1]:'',Math.round(G.LEN[e])]); } }
const F=comp(e=>bit(pv,e)||G.CEM[e]||bit(ex,e)); console.log('reopened',reopened.length,reopened.slice(0,40),'main now',F.best);
n=0;L=0; for(let e=0;e<G.nE;e++) if(bit(ex,e)){n++;L+=G.LEN[e];} console.log('final excl',n,(L/1000).toFixed(1),'km');
fs.writeFileSync('excl_final.txt', Buffer.from(ex).toString('base64'));
