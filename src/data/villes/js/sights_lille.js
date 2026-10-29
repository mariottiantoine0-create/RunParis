const m=require('./meta.json');
const L=[
['Grand’Place',null,10,50.6368,3.0636],['Vieille Bourse',null,7,50.6373,3.0645],['Beffroi de l’hôtel de ville',null,6,50.6306,3.0698],['Palais des Beaux-Arts',null,8,50.6304,3.0629],
['Cathédrale Notre-Dame-de-la-Treille',null,7,50.6403,3.0629],['Citadelle',null,9,50.6409,3.0442],['Jardin Vauban',null,6,50.6367,3.0482],['Porte de Paris',null,5,50.6297,3.0688],
['Opéra de Lille',null,6,50.6375,3.0660],['Rue de la Monnaie',null,5,50.6413,3.0624],['Place Rihour',null,5,50.6358,3.0630],['Hospice Comtesse',null,5,50.6412,3.0632],
['Maison natale de Charles de Gaulle',null,4,50.6458,3.0588],['Porte de Gand',null,4,50.6438,3.0681],['Jardin des Géants',null,5,50.6430,3.0750],['Parc Jean-Baptiste Lebas',null,5,50.6261,3.0690],
['Quai du Wault',null,5,50.6376,3.0541],['Marché de Wazemmes',null,4,50.6260,3.0502],['Lac du Héron',null,6,50.6360,3.1494]];
const out=L.map(([n,p,w,la,lo])=>{ const h=p&&m.poi.find(x=>x[0]===p); return {name:n,w,lat:h?h[2]:la,lon:h?h[3]:lo}; });
require('fs').writeFileSync('pub/sights.json',JSON.stringify(out)); console.log(out.length);
