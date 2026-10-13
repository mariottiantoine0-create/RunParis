const m=require('./meta.json');
// [nom affiché, nom du poi OSM à retrouver (exact) ou null, poids, lat, lon de secours]
const L=[
['Basilique de Fourvière',null,10,45.7623,4.8227],['Place Bellecour',null,9,45.7578,4.8320],['Vieux Lyon',null,8,45.7620,4.8270],['Cathédrale Saint-Jean',null,7,45.7608,4.8273],
['Parc de la Tête d’Or',null,9,45.7772,4.8556],['Place des Terreaux',null,8,45.7673,4.8336],['Opéra de Lyon',null,6,45.7676,4.8361],['Théâtres romains de Fourvière',null,7,45.7597,4.8195],
['Musée des Confluences',null,8,45.7327,4.8180],['Croix-Rousse',null,6,45.7745,4.8320],['Montée de la Grande Côte',null,5,45.7711,4.8326],['Mur des Canuts',null,5,45.7796,4.8258],
['Place des Jacobins',null,5,45.7614,4.8336],['Passerelle Saint-Georges',null,4,45.7577,4.8268],['Passerelle du Palais de Justice',null,5,45.7625,4.8286],['Palais de Justice',null,5,45.7617,4.8279],
['Grand Hôtel-Dieu',null,6,45.7590,4.8363],['Place des Célestins',null,4,45.7600,4.8321],['Berges du Rhône',null,6,45.7560,4.8420],['Quais de Saône',null,5,45.7660,4.8285],
['Parc de Gerland',null,5,45.7290,4.8340],['Halles Paul Bocuse',null,5,45.7630,4.8508],['Tour Part-Dieu',null,5,45.7605,4.8558],['Île Barbe',null,5,45.7975,4.8325],
['Gratte-Ciel',null,5,45.7695,4.8800],['Parc de la Feyssine',null,4,45.7840,4.8690],['Jardin des Curiosités',null,4,45.7590,4.8160],['Abbaye d’Ainay',null,4,45.7537,4.8277],
['Parc des Hauteurs',null,4,45.7640,4.8180],['Confluence',null,5,45.7405,4.8185],['Institut Lumière',null,4,45.7450,4.8710],['Place Sathonay',null,3,45.7690,4.8300]];
const out=L.map(([n,p,w,la,lo])=>{ const h=p&&m.poi.find(x=>x[0]===p); return {name:n,w,lat:h?h[2]:la,lon:h?h[3]:lo}; });
require('fs').writeFileSync('pub/sights.json',JSON.stringify(out));
console.log(out.length);
