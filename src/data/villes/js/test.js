const E=require('./engine.js'); const fs=require('fs');
const meta=JSON.parse(fs.readFileSync('meta.json')); const b=fs.readFileSync('graph.bin'); const buf=b.buffer.slice(b.byteOffset,b.byteOffset+b.length);
E.init(meta,buf);
const b64=s=>Uint8Array.from(Buffer.from(s,'base64'));
const pv=b64(fs.readFileSync('pub/private.txt','utf8')), ex=b64(fs.readFileSync('pub/excl.txt','utf8')); for(let i=0;i<pv.length;i++) pv[i]|=ex[i]; E.setPrivate(pv);
(async()=>{
 const starts=[['Bellecour',45.7578,4.8320],['Part-Dieu',45.7606,4.8590],['Croix-Rousse',45.7745,4.8320],['Confluence',45.7405,4.8185],['Villeurbanne',45.7695,4.8800],['Vaise',45.7800,4.8050],['Tête d’Or',45.7700,4.8510],['Gerland',45.7290,4.8340]];
 for (const [n,la,lo] of starts) for (const [cfg,w,opt] of [['10k équilibré',{climb:0,sig:250},{sigScore:0.5}],['10k D+150',{climb:-15,sig:150},{dplus:150,hill:true,sigScore:0.5}],['5k plat',{climb:12,sig:250},{flat:true,sigScore:0.5}]]) {
  E.setConstraints(new Set(),[]); E.setWeights(w); const s=E.nearest(...E.toXY(la,lo)); const L=cfg.startsWith('5k')?5000:10000;
  const t=Date.now(); const r=await E.loop(s,L,Object.assign({seed:7},opt));
  console.log(n.padEnd(12),cfg.padEnd(14),(Date.now()-t+'ms').padStart(6),'len',Math.round(r.len),'D+',Math.round(r.up),'feux',r.feux,'ovl',r.overlap.toFixed(2),[...r.names].sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>meta.names[x[0]]).join(' | '));
 }
})();
