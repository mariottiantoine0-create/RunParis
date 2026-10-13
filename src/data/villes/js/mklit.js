const fs=require('fs'),E=require('./engine.js');const meta=JSON.parse(fs.readFileSync('meta.json'));const buf=fs.readFileSync('graph.bin');
const G=E.init(meta,buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
const lit=JSON.parse(fs.readFileSync('lit_raw.json'));
const C=20, grid=new Map(); const add=(k,s)=>{let a=grid.get(k);if(!a)grid.set(k,a=[]);a.push(s);};
for(const key of ['yes','no']) for(const w of lit[key]){const P=w.map(([a,o])=>E.toXY(a,o));for(let i=1;i<P.length;i++){const s=[P[i-1][0],P[i-1][1],P[i][0],P[i][1],key==='no'];const x0=Math.floor(Math.min(s[0],s[2])/C)-1,x1=Math.floor(Math.max(s[0],s[2])/C)+1,y0=Math.floor(Math.min(s[1],s[3])/C)-1,y1=Math.floor(Math.max(s[1],s[3])/C)+1;for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)add(x*100000+y,s);}}
const sd=(px,py,ax,ay,bx,by)=>{const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy;let t=l?((px-ax)*dx+(py-ay)*dy)/l:0;t=Math.max(0,Math.min(1,t));return Math.hypot(px-ax-t*dx,py-ay-t*dy);};
const dark=new Uint8Array(G.nE);let stat={street:0,streetDark:0,path:0,pathDark:0,pathYes:0,pathUnknown:0};let lenD=0,lenT=0;
for(let e=0;e<G.nE;e++){ const pts=E.edgePts(e); const m=pts[Math.floor(pts.length/2)], a=pts[0], b=pts[pts.length-1]; const px=pts.length>2?m[0]:(a[0]+b[0])/2, py=pts.length>2?m[1]:(a[1]+b[1])/2;
  let best=9,isNo=null; for(const s of grid.get(Math.floor(px/C)*100000+Math.floor(py/C))||[]){const d=sd(px,py,s[0],s[1],s[2],s[3]);if(d<best){best=d;isNo=s[4];}}
  const path=G.P[e]>0; let dk;
  if(isNo===true) dk=1; else if(isNo===false) dk=0; else dk=path?1:0;
  dark[e]=dk; lenT+=G.LEN[e]; if(dk)lenD+=G.LEN[e];
  if(path){stat.path++;if(dk)stat.pathDark++;if(isNo===false)stat.pathYes++;if(isNo===null)stat.pathUnknown++;}else{stat.street++;if(dk)stat.streetDark++;}
}
// bit-pack
const bits=new Uint8Array(Math.ceil(G.nE/8));for(let e=0;e<G.nE;e++)if(dark[e])bits[e>>3]|=1<<(e&7);
fs.writeFileSync('pub/dark.txt',Buffer.from(bits).toString('base64'));
console.log(stat,'dark share of network',(lenD/lenT*100).toFixed(1)+'%');
