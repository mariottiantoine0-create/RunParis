// ---------- chargement ----------
async function boot() {
  if (!(await onbGate())) return;
  try {
    // carte de Paris compressée (gzip, 1,5 Mo au lieu de 4,2 Mo) : moins de trafic ; repli sur graph.bin si le navigateur ne sait pas décompresser
    const loadGraph = async () => { if (!NATIVE && typeof DecompressionStream === 'function') { try { const r = await fetch(dataURL('graph.gz')); if (r.ok) { const b = await r.arrayBuffer(), u = new Uint8Array(b, 0, 2); if (u[0] === 0x1f && u[1] === 0x8b) return await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(); } } catch (e) {} } return fetch(dataURL('graph.bin')).then(r => r.arrayBuffer()); };
    const [meta, buf] = await Promise.all([fetch(dataURL('meta.json')).then(r => r.json()), loadGraph()]);
    M = meta; G = E.init(meta, buf);
    // couches facultatives : part de vert par rue, parcours mythiques, lieux connus
    const b64 = t => { const bin = atob(t.trim()); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const [gr, rc, sg, mt, ft, pk, dk, pv, xc, cw, tk] = await Promise.all([fetch(dataURL('green.txt')).then(r => r.ok ? r.text() : null).catch(() => null), fetch(dataURL('races.json')).then(r => r.ok ? r.json() : []).catch(() => []), fetch(dataURL('sights.json')).then(r => r.ok ? r.json() : []).catch(() => []), fetch(dataURL('metro.json')).then(r => r.ok ? r.json() : null).catch(() => null), fetch(dataURL('fountains.json')).then(r => r.ok ? r.json() : []).catch(() => []), fetch(dataURL('parks.json')).then(r => r.ok ? r.json() : []).catch(() => []), fetch(dataURL('dark.txt')).then(r => r.ok ? r.text() : null).catch(() => null), fetch(dataURL('private.txt')).then(r => r.ok ? r.text() : null).catch(() => null), fetch(dataURL('excl.txt')).then(r => r.ok ? r.text() : null).catch(() => null), fetch(dataURL('crowd.txt')).then(r => r.ok ? r.text() : null).catch(() => null), fetch(dataURL('tracks.json')).then(r => r.ok ? r.json() : []).catch(() => [])]);
    if (mt) { METRO.lines = mt.lines; METRO.st = mt.stations.map(([n, la, lo, ls]) => { const [x, y] = E.toXY(la, lo); return { n, lat: la, lon: lo, ls, x, y, tram: ls.every(isTram) }; }); transitTexts(); }
    else { $('#ly-metro').disabled = true; $('#end-metro').checked = false; }
    FONT = (ft || []).map(([la, lo, t]) => { const [x, y] = E.toXY(la, lo); return { lat: la, lon: lo, t, x, y }; }); if (!FONT.length) $('#ly-font').disabled = true;
    PARKS = pk || []; if (!PARKS.length) { $('#dep-hint').hidden = true; }
    // pistes d'athlétisme (OSM, anneaux de 200 m et plus, hors écoles) : calque et « Passer par » (D-116)
    TRACKS = (tk || []).map(([n, lap, g]) => { const ring = g.map(([la, lo]) => E.toXY(la, lo)); let x = 0, y = 0; for (const q of ring) { x += q[0]; y += q[1]; } return { n, lap, ring, x: x / ring.length, y: y / ring.length }; })
      .filter(t => { const [la, lo] = E.toLL(t.x, t.y), v = E.nearest(t.x, t.y); return M.quartiers.some(q => q.rings.some(r => pip([la, lo], r))) && v >= 0 && Math.hypot(G.NX[v] - t.x, G.NY[v] - t.y) < 250; }); // seulement là où l'app peut t'emmener (D-116)
    $('#ly-track').disabled = !TRACKS.length;
    if (gr) E.setGreen(b64(gr));
    if (pv || xc) { const a = pv ? b64(pv) : null, b = xc ? b64(xc) : null, m = new Uint8Array(Math.max(a ? a.length : 0, b ? b.length : 0)); for (let i = 0; i < m.length; i++) m[i] = (a && a[i] || 0) | (b && b[i] || 0); E.setPrivate(m); } // voies privées et impasses fermées (D-80) + passages couverts, galeries, intérieurs, centres commerciaux (D-91) : jamais empruntés
    if (dk) E.setDark(b64(dk)); else $('#k-green').disabled = true;
    if (cw) E.setCrowd(b64(cw)); else { $('#crowd-row').hidden = true; $('#crowd-hint').hidden = true; }
    RACES = rc || []; SIGHTS = sg || [];
    for (const x of SIGHTS) { const [px, py] = E.toXY(x.lat, x.lon); x.x = px; x.y = py; const n = E.nearest(px, py); x._n = n >= 0 && Math.hypot(G.NX[n] - px, G.NY[n] - py) < 250 ? n : null; }
  } catch (e) { $('#loading').innerHTML = '<div style="display:flex;flex-direction:column;gap:10px;align-items:center;text-align:center;padding:0 16px">Impossible de charger les données de ' + C0.name + ' (connexion interrompue ?).<button class="btn primary" style="flex:none" onclick="location.reload()">Réessayer</button></div>'; return; }
  mApply(); buildSearch(); buildZones(); buildPaths(); fit(); $('#loading').hidden = true; splashDone(); sbSync(); renderAvoid(); renderVias(); renderRaces(); updateConv(); badgeSync(true);
  if (APPF && new URLSearchParams(location.search).get('libre')) { const u = new URL(location.href); u.searchParams.delete('libre'); history.replaceState(null, '', u); setTimeout(soloPrep, 400); } // retour de « Passer sur … » depuis la course libre
  const home = getHome();
  if (home) setPoint('start', { lat: home.lat, lon: home.lon, name: 'Chez moi · ' + home.name.replace(/^Chez moi · /, '') });
  renderHome();
  // D-68 : on arrive sur les réglages, rien n'est calculé avant que le coureur le demande
  showView('set'); if (/^#cours/.test(location.hash)) setTab('race');
  $('#pos-go').hidden = !navigator.geolocation || !!window.claude;
  $('#run-go').hidden = !navigator.geolocation || !!window.claude;
  if (window.claude || NATIVE) $('#mlinks').hidden = true;
  if (NATIVE) { $('#run-wake').checked = false; $('#run-wake').closest('label').hidden = true; $('#run-buzz-l').hidden = false; } // application : le suivi marche écran verrouillé, plus besoin de garder l'écran allumé (D-86) // pas d'accueil dans l'artifact
  if (!applyParams()) { const lg = lastApply(); if (lg && lg.dep === 'pos' && !/^Chez moi/.test(S.start && S.start.name || '') && navigator.geolocation && !window.claude) locate(); else if (!S.start) openStart(false); }
  addEventListener('hashchange', () => { if (/^#cours/.test(location.hash) && S.tab !== 'race') setTab('race'); });
  loadTrees();
  cityFirstRun();
}
// arbres (OSM natural=tree) : x, y en mètres, paires d'Int16 ; chargés après le premier parcours
function loadTrees() {
  fetch(dataURL('trees.txt')).then(r => r.ok ? r.text() : null).then(t => {
    if (!t) { $('#ly-trees').disabled = true; return; }
    const bin = atob(t.trim()), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    TREES = new Int16Array(u.buffer); TGRID = new Map();
    for (let i = 0; i < TREES.length; i += 2) { const k = (TREES[i] >> 5) * 4096 + (TREES[i + 1] >> 5); let c = TGRID.get(k); if (!c) TGRID.set(k, c = []); c.push(i); }
    if (S.route) { S.route._trees = null; showRoute(S.route, S.lastNotes || []); }
    draw();
  }).catch(() => { $('#ly-trees').disabled = true; });
}
// arbres à moins de 10 m du tracé (calculés une fois par parcours)
function routeTrees(r) {
  if (!TGRID) return null; if (r._trees) return r._trees;
  const seen = new Set(), P = laneInfo(r).pts;
  for (const [x, y] of P) { const cx = Math.round(x) >> 5, cy = Math.round(y) >> 5;
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) for (const i of TGRID.get(gx * 4096 + gy) || []) if (!seen.has(i) && Math.hypot(TREES[i] - x, TREES[i + 1] - y) <= 10) seen.add(i); }
  return (r._trees = [...seen]);
}
// ---------- horaires des parcs ----------
// jardins clôturés de la Ville de Paris : 8 h (9 h le week-end, 7 h pour les grands parcs) jusqu'à une fermeture qui suit le coucher du soleil (indicatif)
function lastSunday(y, m) { const d = new Date(y, m + 1, 0); d.setDate(d.getDate() - d.getDay()); return d; }
function municipalOpen(p, t) {
  const y = t.getFullYear(), day = t.getDay(), mins = t.getHours() * 60 + t.getMinutes(), md = new Date(y, t.getMonth(), t.getDate());
  const open = p.big ? 7 * 60 : (day === 0 || day === 6 ? 9 * 60 : 8 * 60);
  const oct = lastSunday(y, 9), mar = lastSunday(y, 2), m = t.getMonth();
  let close;
  if (md >= oct || m <= 1) close = 17 * 60 + 45; // du dernier dimanche d'octobre à février
  else if (m === 2) close = md < mar ? 19 * 60 : 20 * 60 + 30;
  else if (m === 3) close = 20 * 60 + 30;
  else if (m >= 4 && m <= 7) close = 21 * 60 + 30;
  else if (m === 8) close = 20 * 60 + 30;
  else close = 19 * 60 + 30; // octobre avant son dernier dimanche
  return mins >= open && mins < close;
}
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }, WD = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
// petit lecteur des opening_hours d'OSM (mois, jours, plages, fermé) ; null si la syntaxe le dépasse
function ohOpen(oh, t) {
  if (/^\s*24\/7\s*$/.test(oh)) return true;
  if (/sun(rise|set)|\|\||"|week|easter/i.test(oh)) return null;
  const y = t.getFullYear();
  oh = oh.replace(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) Su\[-1\]/g, (x, mo) => `${mo} ${lastSunday(y, MON[mo]).getDate()}`); // dernier dimanche du mois
  if (/\[/.test(oh)) return null;
  const m = t.getMonth(), d = t.getDate(), wd = t.getDay(), mins = t.getHours() * 60 + t.getMinutes();
  const val = (mo, dd) => mo * 100 + dd, cur = val(m, d);
  const DAYN = '(?: ?\\d{1,2}(?![\\d:]))?', MO = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
  const monRe = new RegExp(`^((?:${MO}${DAYN}(?:-${MO}?${DAYN})?,?)+)\\s*:?\\s*`);
  let res = null;
  // « ; » ouvre une règle qui remplace les précédentes pour ses jours ; « , » complète la règle en cours (ou en retire avec « off »)
  for (const group of oh.split(/\s*;\s*/).filter(Boolean)) {
    group.split(/,\s+(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b)/).forEach((rule, idx) => {
      let r = rule.trim(), ok = true;
      const mm = r.match(monRe);
      if (mm) { r = r.slice(mm[0].length); ok = mm[1].split(',').filter(Boolean).some(part => {
          const [pa0, pb0] = part.split('-'); const pa = pa0.trim().match(/^(\w{3})(?: ?(\d+))?$/); if (!pa) return false;
          const m1 = MON[pa[1]], d1 = +(pa[2] || 1);
          if (pb0 === undefined) return pa[2] ? cur === val(m1, d1) : m === m1;
          const pb = pb0.trim().match(/^(\w{3})?(?: ?(\d+))?$/) || []; const m2 = pb[1] ? MON[pb[1]] : m1, d2 = pb[2] ? +pb[2] : (pb[1] ? 31 : d1);
          const lo = val(m1, d1), hi = val(m2, d2); return lo <= hi ? cur >= lo && cur <= hi : cur >= lo || cur <= hi; }); }
      const dm = r.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?,?)+)\s+/);
      if (dm) { r = r.slice(dm[0].length); ok = ok && dm[1].split(',').filter(Boolean).some(part => { const [a, b] = part.split('-'); if (a === 'PH') return false; const x = WD[a], z = b ? WD[b] : x; return x <= z ? wd >= x && wd <= z : wd >= x || wd <= z; }); }
      if (!ok) return;
      r = r.trim(); const off = /\s(off|closed)$/i.test(r) || /^(off|closed)$/i.test(r);
      const ivs = [...r.matchAll(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g)];
      const inside = ivs.length ? ivs.some(([, h1, m1, h2, m2]) => { const a = +h1 * 60 + +m1, b = +h2 * 60 + +m2; return b > a ? mins >= a && mins < b : mins >= a || mins < b; }) : off;
      if (!ivs.length && !off) { res = res === null ? null : res; return; }
      if (off) { if (inside) res = false; else if (idx === 0) res = false; return; }
      res = idx === 0 ? inside : (res || inside);
    });
  }
  return res;
}
function parkOpen(p, t) { if (p.oh) { const v = ohOpen(p.oh, t); if (v !== null) return v; } return municipalOpen(p, t); }
// lever et coucher du soleil pour un jour donné (approximation NOAA, à ±2 min environ)
function sunTimes(t) {
  const rad = Math.PI / 180, [lat, lon] = C0.ll;
  const start = Date.UTC(t.getFullYear(), 0, 0), n = Math.floor((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - start) / 864e5);
  const g = 2 * Math.PI / 365 * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)) / rad;
  const utc = m => new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) + m * 60000);
  return { rise: utc(720 - 4 * (lon + ha) - eq), set: utc(720 - 4 * (lon - ha) - eq) };
}
// une partie de la sortie est-elle de nuit (de 20 min après le coucher à 20 min avant le lever) ?
function runInDark(t0, minutes) {
  for (let k = 0; k <= minutes + 9; k += 10) { const t = new Date(+t0 + Math.min(k, minutes) * 60000), { rise, set } = sunTimes(t);
    if (t > new Date(+set + 20 * 60000) || t < new Date(+rise - 20 * 60000)) return true; }
  return false;
}
// heure de départ choisie (aujourd'hui ; demain si l'heure est déjà bien passée)
function departure() {
  const now = new Date(); if (S.depNow !== false || !$('#dep-time').value) return now;
  const [h, m] = $('#dep-time').value.split(':').map(Number); const t = new Date(now); t.setHours(h, m, 0, 0);
  if (t < now - 30 * 60000) t.setDate(t.getDate() + 1); return t;
}
// parcs fermés à un moment entre le départ et l'arrivée
function closedParks(t0, minutes) {
  const out = []; for (const p of PARKS) { for (let k = 0; k <= minutes + 9; k += 10) { if (!parkOpen(p, new Date(+t0 + Math.min(k, minutes) * 60000))) { out.push(p); break; } } } return out;
}
const hhmm = t => `${t.getHours()}h${String(t.getMinutes()).padStart(2, '0')}`;
// fontaines à moins de 30 m du tracé, avec leur position le long du tracé (m), et le plus long passage sans eau
function routeFountains(r) {
  if (!FONT.length) return null; if (r._font) return r._font;
  const P = laneInfo(r).pts, hit = new Map(); let acc = 0;
  for (let i = 0; i < P.length; i++) { if (i) acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    for (const f of FONT) { if (Math.abs(f.x - P[i][0]) > 30 || Math.abs(f.y - P[i][1]) > 30) continue; const d = Math.hypot(f.x - P[i][0], f.y - P[i][1]); if (d <= 30 && (!hit.has(f) || hit.get(f).d > d)) hit.set(f, { d, at: acc }); } }
  const list = [...hit].map(([f, h]) => ({ f, at: h.at })).sort((a, b) => a.at - b.at);
  // une fontaine croisée deux fois (aller et retour) compte une fois, au premier passage
  const seen = new Set(), uniq = list.filter(x => !seen.has(x.f) && seen.add(x.f));
  let gap = 0, prev = 0; for (const x of uniq) { gap = Math.max(gap, x.at - prev); prev = x.at; } gap = Math.max(gap, r.len - prev);
  const stops = []; for (const x of uniq) if (!stops.length || x.at - stops[stops.length - 1] > 400) stops.push(x.at); // fontaines à moins de 400 m l'une de l'autre = un seul point d'eau
  return (r._font = { list: uniq, gap, stops });
}
function drawDrop(sx, sy, r, hi) {
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fillStyle = hi ? colors.font : '#fff'; ctx.fill(); ctx.lineWidth = hi ? 2 : 1.5; ctx.strokeStyle = hi ? '#fff' : colors.font; ctx.stroke();
  const k = r * 0.55; ctx.beginPath(); ctx.moveTo(sx, sy - k * 1.25); ctx.bezierCurveTo(sx + k * 0.9, sy - k * 0.2, sx + k * 0.95, sy + k * 0.95, sx, sy + k); ctx.bezierCurveTo(sx - k * 0.95, sy + k * 0.95, sx - k * 0.9, sy - k * 0.2, sx, sy - k * 1.25);
  ctx.fillStyle = hi ? '#fff' : colors.font; ctx.fill();
}
// station de métro ou de RER la plus proche d'un point (à vol d'oiseau, en mètres)
function nearestStation(x, y) { let b = null, bd = 1e9; for (const s of METRO.st) { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; b = s; } } return b && { s: b, d: bd }; }
function lineBadge(l) { const b = document.createElement('span'); b.className = 'lb'; const c = METRO.lines[l] || '#888'; b.style.background = c;
  const h = c.replace('#', ''), [R, Gc, B] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); b.style.color = (R * 299 + Gc * 587 + B * 114) / 1000 > 150 ? '#111' : '#fff';
  b.textContent = l.replace(/^M/, '').replace(/^T([A-Z])$/, '$1'); b.title = l.startsWith('M') ? 'Métro ' + l.slice(1) : isTram(l) ? 'Tram ' + l.replace(/^T([A-Z])$/, '$1') : l; return b; }
// tram (D-98) : lignes T1, T3a… ; à Bordeaux les lignes A à F sont notées TA à TF (D-103)
function isTram(l) { return /^T(\d+[ab]?|[A-Z])$/.test(l); }
// libellés selon les lignes de la ville : « Métro, RER et tram » à Paris, « Métro et tram » à Lyon, « Tram » à Bordeaux et Nantes (D-103)
function transitTexts() {
  const ls = Object.keys(METRO.lines), met = ls.some(l => /^M/.test(l)), rer = ls.some(l => l.startsWith('RER')), tram = ls.some(isTram);
  METRO.onlyTram = tram && !met && !rer;
  const name = (met ? ['Métro'] : []).concat(rer ? ['RER'] : [], tram ? ['tram'] : []), join = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' et ' + a[a.length - 1] : a[0] || '';
  const cap = x => x.charAt(0).toUpperCase() + x.slice(1);
  const ly = $('#ly-metro'); ly.lastChild.textContent = cap(join(name)); ly.querySelector('.ld').textContent = METRO.onlyTram ? 'T' : 'M';
  $('#end-metro-row').firstChild.textContent = METRO.onlyTram ? 'Finir près d’un arrêt de tram' : 'Finir près d’un ' + join(name.map(x => x === 'RER' ? x : x.toLowerCase())).replace(/ et ([^ ]+)$/, ' ou $1');
  $('#lg-metro').lastChild.textContent = join(name.filter(x => x !== 'tram')).replace(' et ', ', ');
  $('#lg-metro').hidden = !met && !rer;
  $('#lg-tram').hidden = !tram;
  if (METRO.onlyTram) {
    for (const id of ['#start-q', '#end-q']) $(id).placeholder = $(id).placeholder.replace('métro', 'tram');
    $('#always').textContent = $('#always').textContent.replace('gares et métro', 'gares');
  }
}

// ---------- index de recherche ----------
let IDX = [];
function buildSearch() {
  const typeLabel = { station: 'Gare / métro', park: 'Parc', attraction: 'Lieu', museum: 'Musée', viewpoint: 'Point de vue', square: 'Place', monument: 'Monument', marketplace: 'Marché', university: 'Université', mall: 'Centre commercial', stadium: 'Stade' };
  for (const [n, t, la, lo] of M.poi) IDX.push({ name: n, type: typeLabel[t] || 'Lieu', lat: la, lon: lo, k: norm(n) });
  // arrêts de tram (D-98) : cherchables comme les stations, s'ils ne sont pas déjà des lieux
  const known = new Set(IDX.map(x => x.k)); for (const st of METRO.st) if (st.tram && !known.has(norm(st.n))) IDX.push({ name: st.n, type: 'Tram ' + st.ls.map(l => l.replace(/^T([A-Z])$/, '$1')).join(', '), lat: st.lat, lon: st.lon, k: norm(st.n) });
  // rues : milieu du plus long tronçon de chaque nom
  const best = new Map();
  // une entrée par nom de rue et par commune (un même nom existe dans plusieurs communes)
  const town = e => { const q = M.quartiers[G.nq[G.ea[e]] - 1]; return q && q.ar > 100 ? q.name : ''; };
  for (let e = 0; e < G.nE; e++) { const n = G.en[e]; if (!n) continue; const L = G.LEN[e], key = n + '|' + town(e); const b = best.get(key); if (!b || L > b[0]) best.set(key, [L, e, n]); }
  for (const [key, [, e, n]] of best) {
    const a = G.ea[e], b = G.eb[e], v = G.deg[a + 1] - G.deg[a] >= G.deg[b + 1] - G.deg[b] ? a : b; const [la, lo] = E.toLL(G.NX[v], G.NY[v]); // sur un carrefour de la rue, pas au milieu d'un pâté de maisons
    const name = M.names[n - 1], tw = key.split('|')[1]; IDX.push({ name, type: tw ? 'Rue · ' + tw : 'Rue', lat: la, lon: lo, k: norm(name + (tw ? ' ' + tw : '')) });
  }
}
// recherche : lieux et rues de la carte, plus les adresses avec numéro (API Adresse de l'IGN, D-106).
// Rien n'est envoyé sans numéro ; avec un numéro, seul le texte tapé part à l'IGN (pas de position, pas d'identifiant).
const ADDR_RE = /^\s*\d+\s*(bis|ter|[a-z])?\b\s*,?\s*\S{3,}/i;
async function geoAddr(q) {
  const u = 'https://data.geopf.fr/geocodage/search?index=address&limit=10&autocomplete=1&q=' + encodeURIComponent(q) + '&lat=' + C0.ll[0] + '&lon=' + C0.ll[1];
  const r = await fetch(u); if (!r.ok) throw new Error(r.status); const j = await r.json();
  return (j.features || []).filter(f => f.properties.type === 'housenumber').map(f => { const [lo, la] = f.geometry.coordinates, p = f.properties; return { name: p.name, town: p.city, lat: la, lon: lo, city: cityAt(la, lo) }; });
}
function searchBox(inp, res, onPick) {
  let seq = 0, tm = 0;
  const row = (name, type, onclick, cls) => { const b = document.createElement('button'); b.type = 'button'; if (cls) b.className = cls; b.innerHTML = `<span></span><em></em>`; b.firstChild.textContent = name; b.lastChild.textContent = type; if (onclick) b.onclick = onclick; else b.disabled = true; res.appendChild(b); return b; };
  const local = q => { const words = q.split(/\s+/); return IDX.filter(x => words.every(w => x.k.includes(w))).sort((a, b) => (a.k.startsWith(q) ? 0 : 1) - (b.k.startsWith(q) ? 0 : 1) || a.type.startsWith('Rue') - b.type.startsWith('Rue') || a.name.length - b.name.length); };
  const pick = h => { onPick(h); inp.value = ''; res.hidden = true; };
  const run = () => {
    const raw = inp.value.trim(), q = norm(raw); clearTimeout(tm); const my = ++seq;
    if (q.length < 2) { res.hidden = true; return; }
    const isAddr = ADDR_RE.test(raw), hits = local(q.replace(/^\d+\s*(bis|ter)?\s*,?\s*/, '') || q).slice(0, isAddr ? 4 : 8);
    const paint = (addr, state) => {
      res.innerHTML = '';
      if (isAddr) {
        if (state === 'load') row('Recherche des adresses…', '', null, 'muted');
        else if (state === 'off') row('Adresses indisponibles sans connexion', 'Les lieux et les rues restent cherchables', null, 'muted');
        else {
          const here = addr.filter(a => a.city === CITY), other = addr.filter(a => a.city && a.city !== CITY);
          for (const a of here.slice(0, 4)) row(a.name, 'Adresse · ' + a.town, () => { track('adresse', 'Adresse choisie'); pick({ name: a.name, type: 'Adresse', lat: a.lat, lon: a.lon }); });
          if (!here.length && other.length) { const a = other[0], c = CITIES[a.city].name; row(a.name + ' · ' + a.town, 'À ' + c + ' · Passer sur ' + c, () => setCity(a.city)); }
          if (!here.length && !other.length && !hits.length) row('Aucune adresse trouvée à ' + C0.name, 'Vérifie le numéro et le nom de la rue', null, 'muted');
        }
      }
      for (const h of hits) row(h.name, h.type, () => pick(h));
      if (!isAddr && !hits.length) row('Aucun résultat sur la carte', 'Avec un numéro, cherche une adresse : « 12 rue … »', null, 'muted');
      res.hidden = false;
    };
    if (!isAddr) { paint([], ''); return; }
    paint([], 'load');
    tm = setTimeout(() => geoAddr(raw).then(a => { if (my === seq) paint(a, ''); }).catch(() => { if (my === seq) paint([], 'off'); }), 250);
  };
  inp.addEventListener('input', run); inp.addEventListener('focus', run);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = res.querySelector('button:not([disabled])'); if (b) b.click(); } if (e.key === 'Escape') res.hidden = true; });
  document.addEventListener('click', e => { if (!res.contains(e.target) && e.target !== inp) res.hidden = true; });
}

// ---------- zones ----------
function arrLabel(n) { return n === 1 ? '1<sup>er</sup>' : n + '<sup>e</sup>'; }
function buildZones() {
  const box = $('#arr');
  const NA = Math.max(0, ...M.quartiers.filter(q => q.ar < 50).map(q => q.ar));
  for (let a = 1; a <= NA; a++) { const b = document.createElement('button'); b.type = 'button'; b.dataset.ar = a; b.innerHTML = arrLabel(a); b.setAttribute('aria-label', `${a}${a === 1 ? 'er' : 'e'} arrondissement`); b.onclick = () => toggleArr(a); box.appendChild(b); }
  // ville sans arrondissements : pas de grille, la liste des quartiers est ouverte d'emblée (D-103)
  if (!NA) { box.hidden = true; $('#qlist').closest('details').open = true; }
  const ql = $('#qlist');
  for (let a = 1; a <= NA; a++) {
    const h = document.createElement('div'); h.className = 'ah'; h.innerHTML = arrLabel(a) + ' arr.'; if (M.quartiers.filter(q => q.ar === a).length > 1) ql.appendChild(h);
    for (const q of M.quartiers.filter(q => q.ar === a)) {
      const l = document.createElement('label'); l.innerHTML = `<input type="checkbox" data-q="${q.id}"><span></span>`; l.lastChild.textContent = q.name;
      l.firstChild.onchange = e => { e.target.checked ? S.exclQ.add(q.id) : S.exclQ.delete(q.id); zonesChanged(); };
      ql.appendChild(l);
    }
  }
  // quartiers de la ville centre quand elle n'a pas d'arrondissements (Bordeaux, Nantes : ar 50 à 99, D-103)
  const vq = M.quartiers.filter(q => q.ar >= 50 && q.ar < 100).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  if (vq.length) {
    const h = document.createElement('div'); h.className = 'ah'; h.textContent = C0.name; ql.appendChild(h);
    for (const q of vq) {
      const l = document.createElement('label'); l.innerHTML = `<input type="checkbox" data-q="${q.id}"><span></span>`; l.lastChild.textContent = q.name;
      l.firstChild.onchange = e => { e.target.checked ? S.exclQ.add(q.id) : S.exclQ.delete(q.id); zonesChanged(); };
      ql.appendChild(l);
    }
  }
  // communes voisines : une zone chacune
  const cs = M.quartiers.filter(q => q.ar > 100).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  if (cs.length) {
    const h = document.createElement('div'); h.className = 'ah'; h.textContent = 'Communes voisines'; ql.appendChild(h);
    for (const q of cs) {
      const l = document.createElement('label'); l.innerHTML = `<input type="checkbox" data-q="${q.id}"><span></span>`; l.lastChild.textContent = q.name;
      l.firstChild.onchange = e => { e.target.checked ? S.exclQ.add(q.id) : S.exclQ.delete(q.id); zonesChanged(); };
      ql.appendChild(l);
    }
  }
  // vue de départ : la ville centre (le graphe couvre aussi les communes voisines)
  { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of M.quartiers) if (q.ar < 100) for (const [la, lo] of q.rings[0]) { const [x, y] = E.toXY(la, lo); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } if (x1 > x0) M.parisB = [x0, y0, x1, y1]; }
  // centre des arrondissements, pour leurs numéros
  M.arrC = {};
  for (const q of M.quartiers) { const r = q.rings[0]; let x = 0, y = 0; for (const [la, lo] of r) { const p = E.toXY(la, lo); x += p[0]; y += p[1]; } const c = M.arrC[q.ar] || [0, 0, 0]; c[0] += x / r.length; c[1] += y / r.length; c[2]++; M.arrC[q.ar] = c; }
}
function toggleArr(a) {
  const qs = M.quartiers.filter(q => q.ar === a).map(q => q.id);
  const all = qs.every(id => S.exclQ.has(id));
  qs.forEach(id => all ? S.exclQ.delete(id) : S.exclQ.add(id)); zonesChanged();
}
function zonesChanged() {
  document.querySelectorAll('#arr button').forEach(b => {
    const qs = M.quartiers.filter(q => q.ar === +b.dataset.ar); const n = qs.filter(q => S.exclQ.has(q.id)).length;
    b.dataset.state = n === 0 ? 'none' : n === qs.length ? 'all' : 'some'; b.setAttribute('aria-pressed', n > 0);
  });
  document.querySelectorAll('#qlist input').forEach(i => i.checked = S.exclQ.has(+i.dataset.q));
  renderAvoid(); markStale(); draw();
}
function renderPlaces() { renderAvoid(); markStale(); }
// toutes les exclusions au même endroit : arrondissements entiers, quartiers, lieux (+ rayon)
function renderAvoid() {
  const box = $('#avoid-list'); box.innerHTML = '';
  const mk = (label, onX, extra) => {
    const c = document.createElement('span'); c.className = 'xchip';
    c.innerHTML = `<span class="name"></span>${extra || ''}<button type="button" aria-label="Retirer">×</button>`;
    c.querySelector('.name').textContent = label; c.querySelector('.name').title = label;
    c.querySelector('button').setAttribute('aria-label', 'Réautoriser ' + label);
    c.querySelector('button').onclick = onX; box.appendChild(c); return c;
  };
  if (M) for (let a = 1; a <= 20; a++) {
    const qs = M.quartiers.filter(q => q.ar === a), ex = qs.filter(q => S.exclQ.has(q.id));
    if (!ex.length) continue;
    if (ex.length === qs.length) mk(a === 1 ? '1er arr.' : a + 'e arr.', () => toggleArr(a));
    else for (const q of ex) mk(q.name, () => { S.exclQ.delete(q.id); zonesChanged(); });
  }
  if (M) for (const q of M.quartiers) if (q.ar >= 50 && S.exclQ.has(q.id)) mk(q.name, () => { S.exclQ.delete(q.id); zonesChanged(); });
  S.places.forEach((p, i) => {
    const c = mk(p.name, () => { S.places.splice(i, 1); renderPlaces(); draw(); }, `<select aria-label="Rayon d'évitement">${[100, 150, 300, 500].map(r => `<option value="${r}" ${r === p.r ? 'selected' : ''}>${r} m</option>`).join('')}</select>`);
    c.querySelector('select').onchange = e => { p.r = +e.target.value; markStale(); draw(); };
  });
  const add = document.createElement('button'); add.type = 'button'; add.className = 'addbtn';
  const open = !$('#addbox').hidden;
  add.textContent = open ? 'Fermer' : (box.children.length ? '+ Ajouter' : '+ Ajouter une zone ou un lieu');
  add.setAttribute('aria-expanded', open);
  add.onclick = () => { $('#addbox').hidden = !$('#addbox').hidden; renderAvoid(); if (!$('#addbox').hidden) $('#avoid-q').focus(); };
  box.appendChild(add);
}
function markStale() { if (S.view === 'res' && S.route) $('#stale').hidden = false; }
// ---------- points ----------
function setPoint(which, p) {
  S[which] = p; $(`#${which}-name`).textContent = p.name; draw(); if (which === 'start') renderHome();
  if (MPHR && ((MCUR === 'dep' && which === 'start') || (MCUR === 'arr' && which === 'end'))) mClose(); if (MPHR) msync();
}
// ---------- « Chez moi » (gardé seulement sur cet appareil) ----------
function getHome() { try { const h = JSON.parse(localStorage.getItem('runparis-home') || 'null'); return h && isFinite(h.lat) && isFinite(h.lon) ? h : null; } catch (e) { return null; } }
function renderHome() {
  const h = getHome(), go = $('#home-go'), save = $('#home-save');
  go.hidden = !h;
  const isHome = h && S.start && Math.abs(S.start.lat - h.lat) < 1e-6 && Math.abs(S.start.lon - h.lon) < 1e-6;
  save.textContent = isHome ? 'Retirer « Chez moi »' : h ? 'Remplacer « Chez moi » par ce départ' : 'Enregistrer ce départ comme « Chez moi »';
  save.dataset.mode = isHome ? 'remove' : 'save'; save.hidden = !S.start;
  go.hidden = !h || isHome;
}

