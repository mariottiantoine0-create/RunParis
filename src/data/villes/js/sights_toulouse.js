const m=require('./meta.json');
const L=[
['Capitole',null,10,43.6045,1.4440],['Basilique Saint-Sernin',null,9,43.6086,1.4420],['Couvent des Jacobins',null,7,43.6036,1.4402],['Pont Neuf',null,7,43.5996,1.4386],
['Prairie des Filtres','Prairie des Filtres',7,43.5968,1.4372],['Quai de la Daurade',null,7,43.6017,1.4392],['Jardin des Plantes','Jardin des Plantes',7,43.5937,1.4521],['Grand Rond',null,6,43.5962,1.4517],
['Jardin Royal','Jardin Royal',5,43.5975,1.4504],['Canal du Midi',null,7,43.5946,1.4590],['Port de l’Embouchure',null,5,43.6110,1.4185],['Jardin japonais',null,6,43.6125,1.4234],
['Les Abattoirs',null,5,43.6001,1.4300],['Hôtel-Dieu Saint-Jacques',null,5,43.5993,1.4365],['Place Saint-Pierre',null,5,43.6040,1.4363],['Musée des Augustins',null,5,43.6007,1.4467],
['Île du Ramier',null,5,43.5835,1.4370],['Cité de l’espace',null,6,43.5866,1.4934],['Halle de la Machine',null,5,43.5703,1.4882],['Prairie des Quinze-Sols',null,3,43.6230,1.3980]];
const out=L.map(([n,p,w,la,lo])=>{ const h=p&&m.poi.find(x=>x[0]===p); return {name:n,w,lat:h?h[2]:la,lon:h?h[3]:lo}; });
require('fs').writeFileSync('pub/sights.json',JSON.stringify(out)); console.log(out.length);
