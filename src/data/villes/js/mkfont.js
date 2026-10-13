const fs=require('fs'),E=require('./engine.js');const meta=JSON.parse(fs.readFileSync('meta.json'));const buf=fs.readFileSync('graph.bin');
const G=E.init(meta,buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
const raw=JSON.parse(fs.readFileSync('fountains_raw.json'));const out=[];
for(const [la,lo,t] of raw){const [x,y]=E.toXY(la,lo);const v=E.nearest(x,y);if(v<0||Math.hypot(G.NX[v]-x,G.NY[v]-y)>200)continue;
 if(out.some(o=>Math.hypot(o[3]-x,o[4]-y)<8))continue; out.push([la,lo,t,x,y]);}
fs.writeFileSync('pub/fountains.json',JSON.stringify(out.map(o=>[o[0],o[1],o[2]])));
console.log(raw.length,'->',out.length);
