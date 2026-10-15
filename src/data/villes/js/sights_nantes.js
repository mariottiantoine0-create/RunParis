const m=require('./meta.json');
// [nom affiché, nom du poi OSM à retrouver (exact) ou null, poids, lat, lon de secours]
const L=[
['Château des ducs de Bretagne',null,10,47.2161,-1.5497],['Cathédrale Saint-Pierre',null,8,47.2181,-1.5507],['Les Machines de l’Île','Les Machines de l’Île',9,47.2060,-1.5643],['Jardin des Plantes','Jardin des Plantes',8,47.2197,-1.5433],
['Passage Pommeraye',null,6,47.2132,-1.5604],['Place Royale',null,6,47.2140,-1.5583],['Île de Versailles','Île de Versailles',6,47.2261,-1.5545],['Butte Sainte-Anne','Butte Sainte-Anne',6,47.2016,-1.5776],
['Anneaux de Buren',null,6,47.2004,-1.5728],['Quai de la Fosse',null,5,47.2100,-1.5700],['Parc de Procé','Parc de Procé',6,47.2232,-1.5815],['Théâtre Graslin',null,5,47.2128,-1.5631],
['Quartier Bouffay',null,5,47.2147,-1.5530],['Tour Bretagne',null,4,47.2177,-1.5584],['Musée d’arts',null,5,47.2193,-1.5469],['Cours Cambronne',null,4,47.2105,-1.5640],
['Quai Ceineray',null,5,47.2215,-1.5545],['Parc du Grand Blottereau','Parc du Grand Blottereau',5,47.2278,-1.5106],['Jardin extraordinaire','Le Jardin extraordinaire',5,47.2008,-1.5800],['Parc de la Gaudinière','Parc de la Gaudinière',4,47.2440,-1.5789],
['Trentemoult',null,5,47.1940,-1.5800],['Le Lieu unique',null,5,47.2148,-1.5450],['Roseraie de la Beaujoire','Parc floral de la Beaujoire - La Roseraie',4,47.2620,-1.5319],['Place du Commerce',null,4,47.2129,-1.5598]];
const out=L.map(([n,p,w,la,lo])=>{ const h=p&&m.poi.find(x=>x[0]===p); return {name:n,w,lat:h?h[2]:la,lon:h?h[3]:lo}; });
require('fs').writeFileSync('pub/sights.json',JSON.stringify(out));
console.log(out.length);
