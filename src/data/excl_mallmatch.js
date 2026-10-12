const fs=require('fs'); const E=require('/mnt/user-data/outputs/RunParis/src/engine.js');
const SITE='/mnt/user-data/outputs/RunParis/site/';
const meta=JSON.parse(fs.readFileSync(SITE+'meta.json')); const buf=fs.readFileSync(SITE+'graph.bin');
const G=E.init(meta, buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength));
const M=JSON.parse(fs.readFileSync('malls.json')).map(m=>({...m,xy:m.g.map(([a,b])=>E.toXY(a,b))}));
for(const m of M){m.x0=Math.min(...m.xy.map(p=>p[0]));m.x1=Math.max(...m.xy.map(p=>p[0]));m.y0=Math.min(...m.xy.map(p=>p[1]));m.y1=Math.max(...m.xy.map(p=>p[1]));}
const inside=(x,y,p)=>{let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const[xi,yi]=p[i],[xj,yj]=p[j];if((yi>y)!=(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c;}return c;};
const res={}, list=[];
for(let e=0;e<G.nE;e++){ const pts=E.edgePts(e); let n=0,k=0,hit=null;
  for(const [x,y] of pts){ k++; for(const m of M){ if(x<m.x0||x>m.x1||y<m.y0||y>m.y1) continue; if(inside(x,y,m.xy)){n++;hit=m;break;} } }
  if(hit && n===k){ const nm=G.en[e]?meta.names[G.en[e]-1]:''; const key=hit.name+' / '+(G.P[e]>0?'path':'street')+' / '+nm; res[key]=(res[key]||0)+G.LEN[e]; list.push([e,hit.name,G.P[e]>0]); } }
console.log(Object.entries(res).sort((a,b)=>b[1]-a[1]).map(([k,v])=>Math.round(v)+' '+k).join('\n'));
fs.writeFileSync('mall_edges.json',JSON.stringify(list));
