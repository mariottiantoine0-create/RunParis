const m=require('./meta.json');
const L=[
['Palais des ducs de Bourgogne',null,10,47.3216,5.0414],['Place de la Libération',null,8,47.3212,5.0412],['Église Notre-Dame',null,7,47.3225,5.0425],['Rue des Forges',null,5,47.3224,5.0400],
['Cathédrale Saint-Bénigne',null,7,47.3221,5.0348],['Jardin Darcy','Jardin Darcy',6,47.3227,5.0318],['Les Halles',null,5,47.3237,5.0396],['Lac Kir','Lac Kir',8,47.3232,4.9985],
['Jardin de l’Arquebuse','Jardin de l\'Arquebuse',6,47.3200,5.0268],['Port du Canal',null,6,47.3134,5.0258],['Parc de la Colombière','Parc de la Colombière',8,47.3045,5.0485],['Cité internationale de la gastronomie',null,5,47.3148,5.0367],
['Combe à la Serpent',null,5,47.3270,4.9800],['Place Darcy',null,4,47.3226,5.0334],['Square des Ducs',null,3,47.3222,5.0430]];
const out=L.map(([n,p,w,la,lo])=>{ const h=p&&m.poi.find(x=>x[0]===p); return {name:n,w,lat:h?h[2]:la,lon:h?h[3]:lo}; });
require('fs').writeFileSync('pub/sights.json',JSON.stringify(out)); console.log(out.length);
