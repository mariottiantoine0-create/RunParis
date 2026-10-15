const m=require('./meta.json');
// [nom affiché, nom du poi OSM à retrouver (exact) ou null, poids, lat, lon de secours]
const L=[
['Place de la Bourse',null,10,44.8414,-0.5695],['Miroir d’eau',null,9,44.8418,-0.5696],['Pont de pierre','Pont de pierre',8,44.8384,-0.5629],['Cathédrale Saint-André',null,7,44.8378,-0.5776],
['Grand-Théâtre',null,7,44.8425,-0.5743],['Place des Quinconces',null,8,44.8447,-0.5728],['Jardin public','Jardin Public',8,44.8487,-0.5793],['Porte Cailhau',null,5,44.8381,-0.5698],
['Grosse Cloche',null,5,44.8362,-0.5716],['Basilique Saint-Michel',null,6,44.8346,-0.5663],['Quai des Chartrons',null,6,44.8540,-0.5684],['Cité du Vin',null,7,44.8625,-0.5503],
['Bassins à flot',null,5,44.8640,-0.5560],['Pont Jacques Chaban-Delmas',null,6,44.8590,-0.5523],['Parc aux Angéliques','Parc aux Angéliques',6,44.8462,-0.5638],['Jardin botanique','Jardin Botanique',4,44.8455,-0.5604],
['Rue Sainte-Catherine',null,6,44.8392,-0.5737],['Place du Parlement',null,5,44.8400,-0.5707],['Parc bordelais','Parc Bordelais',6,44.8532,-0.6034],['Place Gambetta','Place Gambetta',4,44.8412,-0.5806],
['Tour Pey-Berland','Tour Pey Berland',5,44.8376,-0.5766],['Palais Rohan',null,5,44.8378,-0.5797],['Place Saint-Pierre',null,4,44.8401,-0.5713],['Porte de Bourgogne',null,4,44.8370,-0.5650],
['Lac de Bordeaux',null,5,44.8860,-0.5700],['Darwin',null,4,44.8500,-0.5595],['Parc de Bourran','Parc de Bourran',4,44.8369,-0.6311],['Place de la Victoire',null,4,44.8310,-0.5727]];
const out=L.map(([n,p,w,la,lo])=>{ const h=p&&m.poi.find(x=>x[0]===p); return {name:n,w,lat:h?h[2]:la,lon:h?h[3]:lo}; });
require('fs').writeFileSync('pub/sights.json',JSON.stringify(out));
console.log(out.length);
