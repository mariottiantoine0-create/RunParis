const fs=require('fs'),E=require('./engine.js');const meta=JSON.parse(fs.readFileSync('meta.json'));const buf=fs.readFileSync('graph.bin');
const G=E.init(meta,buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
const raw=JSON.parse(fs.readFileSync('parks_raw.json'));
const pip=(x,y,r)=>{let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const [xi,yi]=r[i],[xj,yj]=r[j];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))c=!c;}return c;};
const toP=p=>{const rings=p.r.map(r=>r.map(([la,lo])=>E.toXY(la,lo)));let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const r of rings)for(const [x,y] of r){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return {rings,b:[x0,y0,x1,y1]};};
const title=s=>s.toLowerCase().replace(/(^|[\s'’-])([a-zàâçéèêëîïôûùüÿ])/g,(m,a,b)=>a+b.toUpperCase()).replace(/\b(De|Du|Des|La|Le|Les|D'|L'|Et|Au|Aux|À)\b/g,w=>w.toLowerCase()).replace(/^./,c=>c.toUpperCase());
const parks=[];
for(const p of raw.osm){ if(!p.oh)continue; parks.push({n:p.n,k:'o',oh:p.oh,...toP(p)}); }
for(const p of raw.od){ parks.push({n:title(p.n||'Jardin'),k:'m',big:p.c==='Parc'||(p.s||0)>60000,...toP(p)}); }
const owner=new Int32Array(G.nE).fill(-1);
for(let e=0;e<G.nE;e++){ if(G.bad&&G.bad[e])continue; const pts=E.edgePts(e); const m=pts[Math.floor(pts.length/2)]; const a=pts[0],b=pts[pts.length-1]; const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2; const tx=pts.length>2?m[0]:mx, ty=pts.length>2?m[1]:my;
  for(let i=0;i<parks.length;i++){const P=parks[i];if(tx<P.b[0]||tx>P.b[2]||ty<P.b[1]||ty>P.b[3])continue; if(P.rings.some(r=>pip(tx,ty,r))){owner[e]=i;break;}} } // OSM parks (with hours) first, then municipal
const out=[];const idx=new Map();
for(let e=0;e<G.nE;e++){const i=owner[e];if(i<0)continue;if(!idx.has(i)){idx.set(i,out.length);const P=parks[i];out.push({n:P.n,k:P.k,...(P.oh?{oh:P.oh}:{}),...(P.big?{big:1}:{}),c:[Math.round((P.b[0]+P.b[2])/2),Math.round((P.b[1]+P.b[3])/2)],e:[]});}out[idx.get(i)].e.push(e);}
fs.writeFileSync('pub/parks.json',JSON.stringify(out));
console.log('parks with edges',out.length,'edges',out.reduce((a,p)=>a+p.e.length,0), out.filter(p=>/Buttes|Monceau|Luxembourg|Tuileries|Plantes|Coul|Plant|Floral|Bagatelle/i.test(p.n)).map(p=>p.n+':'+p.e.length+(p.oh?' [oh]':'')).join(' | '));
