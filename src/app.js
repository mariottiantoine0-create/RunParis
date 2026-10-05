<script>
(() => {
const $ = s => document.querySelector(s);
const E = Engine;
const fmt = (n, d = 1) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const S = {
  mode: 'loop', start: null, end: null, // {lat,lon,name}
  dmode: 'any', sig: 1, exclQ: new Set(), places: [], seed: 1, tool: null, route: null, showSig: false, showMetro: true, showTrees: false, showFont: false,
  unit: 'km', endFree: false, view: 'set', kind: 'classic', vias: [], tab: 'gen', race: null
};
const DV = '__DATAV__'; // version des données (ajoutée à la mise en ligne) : force le rechargement après une mise à jour
let M, G, paths = {}, colors = {}, RACES = [], SIGHTS = [], METRO = { lines: {}, st: [] }, TREES = null, TGRID = null, FONT = [], PARKS = [];

// ---------- loading ----------
async function boot() {
  try {
    const [meta, buf] = await Promise.all([fetch('meta.json' + DV).then(r => r.json()), fetch('graph.bin' + DV).then(r => r.arrayBuffer())]);
    M = meta; G = E.init(meta, buf);
    // optional layers: green score per street, official race routes, famous places
    const b64 = t => { const bin = atob(t.trim()); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const [gr, rc, sg, mt, ft, pk, dk] = await Promise.all([fetch('green.txt' + DV).then(r => r.ok ? r.text() : null).catch(() => null), fetch('races.json' + DV).then(r => r.ok ? r.json() : []).catch(() => []), fetch('sights.json' + DV).then(r => r.ok ? r.json() : []).catch(() => []), fetch('metro.json' + DV).then(r => r.ok ? r.json() : null).catch(() => null), fetch('fountains.json' + DV).then(r => r.ok ? r.json() : []).catch(() => []), fetch('parks.json' + DV).then(r => r.ok ? r.json() : []).catch(() => []), fetch('dark.txt' + DV).then(r => r.ok ? r.text() : null).catch(() => null)]);
    if (mt) { METRO.lines = mt.lines; METRO.st = mt.stations.map(([n, la, lo, ls]) => { const [x, y] = E.toXY(la, lo); return { n, lat: la, lon: lo, ls, x, y }; }); }
    else { $('#ly-metro').disabled = true; $('#end-metro').checked = false; }
    FONT = (ft || []).map(([la, lo, t]) => { const [x, y] = E.toXY(la, lo); return { lat: la, lon: lo, t, x, y }; }); if (!FONT.length) $('#ly-font').disabled = true;
    PARKS = pk || []; if (!PARKS.length) { $('#dep-hint').hidden = true; }
    if (gr) E.setGreen(b64(gr));
    if (dk) E.setDark(b64(dk)); else $('#k-green').disabled = true;
    RACES = rc || []; SIGHTS = sg || [];
    for (const x of SIGHTS) { const [px, py] = E.toXY(x.lat, x.lon); x.x = px; x.y = py; const n = E.nearest(px, py); x._n = n >= 0 && Math.hypot(G.NX[n] - px, G.NY[n] - py) < 250 ? n : null; }
  } catch (e) { $('#loading').innerHTML = '<div style="display:flex;flex-direction:column;gap:10px;align-items:center;text-align:center;padding:0 16px">Impossible de charger les données de Paris (connexion interrompue ?).<button class="btn primary" style="flex:none" onclick="location.reload()">Réessayer</button></div>'; return; }
  buildSearch(); buildZones(); buildPaths(); fit(); $('#loading').hidden = true; renderAvoid(); renderVias(); renderRaces(); updateConv();
  const home = getHome();
  if (home) setPoint('start', { lat: home.lat, lon: home.lon, name: 'Chez moi · ' + home.name.replace(/^Chez moi · /, '') });
  renderHome();
  // D-68 : on arrive sur les réglages, rien n'est calculé avant que le coureur le demande
  showView('set'); if (/^#cours/.test(location.hash)) setTab('race');
  $('#pos-go').hidden = !navigator.geolocation || !!window.claude;
  if (window.claude) $('#mlinks').hidden = true; // pas d'accueil dans l'artifact
  if (!applyParams() && !S.start) openStart(false);
  addEventListener('hashchange', () => { if (/^#cours/.test(location.hash) && S.tab !== 'race') setTab('race'); });
  loadTrees();
}
// street trees (OSM natural=tree): x, y in metres as Int16 pairs; loaded after the first route
function loadTrees() {
  fetch('trees.txt' + DV).then(r => r.ok ? r.text() : null).then(t => {
    if (!t) { $('#ly-trees').disabled = true; return; }
    const bin = atob(t.trim()), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    TREES = new Int16Array(u.buffer); TGRID = new Map();
    for (let i = 0; i < TREES.length; i += 2) { const k = (TREES[i] >> 5) * 4096 + (TREES[i + 1] >> 5); let c = TGRID.get(k); if (!c) TGRID.set(k, c = []); c.push(i); }
    if (S.route) { S.route._trees = null; showRoute(S.route, [...$('#notes').children].map(d => ({ t: d.textContent, err: d.classList.contains('err') }))); }
    draw();
  }).catch(() => { $('#ly-trees').disabled = true; });
}
// trees within 10 m of the route (computed once per route)
function routeTrees(r) {
  if (!TGRID) return null; if (r._trees) return r._trees;
  const seen = new Set(), P = laneInfo(r).pts;
  for (const [x, y] of P) { const cx = Math.round(x) >> 5, cy = Math.round(y) >> 5;
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) for (const i of TGRID.get(gx * 4096 + gy) || []) if (!seen.has(i) && Math.hypot(TREES[i] - x, TREES[i + 1] - y) <= 10) seen.add(i); }
  return (r._trees = [...seen]);
}
// ---------- park opening hours ----------
// Ville de Paris gated gardens: 8:00 (Sa, Su 9:00; large parks 7:00) until a closing time that follows the sunset (indicative)
function lastSunday(y, m) { const d = new Date(y, m + 1, 0); d.setDate(d.getDate() - d.getDay()); return d; }
function municipalOpen(p, t) {
  const y = t.getFullYear(), day = t.getDay(), mins = t.getHours() * 60 + t.getMinutes(), md = new Date(y, t.getMonth(), t.getDate());
  const open = p.big ? 7 * 60 : (day === 0 || day === 6 ? 9 * 60 : 8 * 60);
  const oct = lastSunday(y, 9), mar = lastSunday(y, 2), m = t.getMonth();
  let close;
  if (md >= oct || m <= 1) close = 17 * 60 + 45; // last Sunday of October to February
  else if (m === 2) close = md < mar ? 19 * 60 : 20 * 60 + 30;
  else if (m === 3) close = 20 * 60 + 30;
  else if (m >= 4 && m <= 7) close = 21 * 60 + 30;
  else if (m === 8) close = 20 * 60 + 30;
  else close = 19 * 60 + 30; // October before its last Sunday
  return mins >= open && mins < close;
}
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }, WD = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
// small OpenStreetMap opening_hours reader (months, weekdays, time ranges, closed); null when the syntax is beyond it
function ohOpen(oh, t) {
  if (/^\s*24\/7\s*$/.test(oh)) return true;
  if (/sun(rise|set)|\|\||"|week|easter/i.test(oh)) return null;
  const y = t.getFullYear();
  oh = oh.replace(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) Su\[-1\]/g, (x, mo) => `${mo} ${lastSunday(y, MON[mo]).getDate()}`); // last Sunday of the month
  if (/\[/.test(oh)) return null;
  const m = t.getMonth(), d = t.getDate(), wd = t.getDay(), mins = t.getHours() * 60 + t.getMinutes();
  const val = (mo, dd) => mo * 100 + dd, cur = val(m, d);
  const DAYN = '(?: ?\\d{1,2}(?![\\d:]))?', MO = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
  const monRe = new RegExp(`^((?:${MO}${DAYN}(?:-${MO}?${DAYN})?,?)+)\\s*:?\\s*`);
  let res = null;
  // ';' starts a rule that replaces the previous ones for its days; ', ' adds to (or with "off" removes from) the current rule
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
// sunrise / sunset in Paris for a given day (NOAA approximation, about ±2 min)
function sunTimes(t) {
  const rad = Math.PI / 180, lat = 48.8566, lon = 2.3522;
  const start = Date.UTC(t.getFullYear(), 0, 0), n = Math.floor((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - start) / 864e5);
  const g = 2 * Math.PI / 365 * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)) / rad;
  const utc = m => new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) + m * 60000);
  return { rise: utc(720 - 4 * (lon + ha) - eq), set: utc(720 - 4 * (lon - ha) - eq) };
}
// is any part of the run in the dark (from 20 min after sunset to 20 min before sunrise)?
function runInDark(t0, minutes) {
  for (let k = 0; k <= minutes + 9; k += 10) { const t = new Date(+t0 + Math.min(k, minutes) * 60000), { rise, set } = sunTimes(t);
    if (t > new Date(+set + 20 * 60000) || t < new Date(+rise - 20 * 60000)) return true; }
  return false;
}
// departure time chosen by the runner (today; tomorrow if that time is already well past)
function departure() {
  const now = new Date(); if (S.depNow !== false || !$('#dep-time').value) return now;
  const [h, m] = $('#dep-time').value.split(':').map(Number); const t = new Date(now); t.setHours(h, m, 0, 0);
  if (t < now - 30 * 60000) t.setDate(t.getDate() + 1); return t;
}
// parks closed at some point between departure and arrival
function closedParks(t0, minutes) {
  const out = []; for (const p of PARKS) { for (let k = 0; k <= minutes + 9; k += 10) { if (!parkOpen(p, new Date(+t0 + Math.min(k, minutes) * 60000))) { out.push(p); break; } } } return out;
}
const hhmm = t => `${t.getHours()}h${String(t.getMinutes()).padStart(2, '0')}`;
// drinking fountains within 30 m of the route, with their position along it (m), and the longest stretch without water
function routeFountains(r) {
  if (!FONT.length) return null; if (r._font) return r._font;
  const P = laneInfo(r).pts, hit = new Map(); let acc = 0;
  for (let i = 0; i < P.length; i++) { if (i) acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    for (const f of FONT) { if (Math.abs(f.x - P[i][0]) > 30 || Math.abs(f.y - P[i][1]) > 30) continue; const d = Math.hypot(f.x - P[i][0], f.y - P[i][1]); if (d <= 30 && (!hit.has(f) || hit.get(f).d > d)) hit.set(f, { d, at: acc }); } }
  const list = [...hit].map(([f, h]) => ({ f, at: h.at })).sort((a, b) => a.at - b.at);
  // a fountain met twice (out and back) counts once, at its first pass
  const seen = new Set(), uniq = list.filter(x => !seen.has(x.f) && seen.add(x.f));
  let gap = 0, prev = 0; for (const x of uniq) { gap = Math.max(gap, x.at - prev); prev = x.at; } gap = Math.max(gap, r.len - prev);
  const stops = []; for (const x of uniq) if (!stops.length || x.at - stops[stops.length - 1] > 400) stops.push(x.at); // fountains less than 400 m apart = one water stop
  return (r._font = { list: uniq, gap, stops });
}
function drawDrop(sx, sy, r, hi) {
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fillStyle = hi ? colors.font : '#fff'; ctx.fill(); ctx.lineWidth = hi ? 2 : 1.5; ctx.strokeStyle = hi ? '#fff' : colors.font; ctx.stroke();
  const k = r * 0.55; ctx.beginPath(); ctx.moveTo(sx, sy - k * 1.25); ctx.bezierCurveTo(sx + k * 0.9, sy - k * 0.2, sx + k * 0.95, sy + k * 0.95, sx, sy + k); ctx.bezierCurveTo(sx - k * 0.95, sy + k * 0.95, sx - k * 0.9, sy - k * 0.2, sx, sy - k * 1.25);
  ctx.fillStyle = hi ? '#fff' : colors.font; ctx.fill();
}
// closest metro / RER station to a point (straight line, metres)
function nearestStation(x, y) { let b = null, bd = 1e9; for (const s of METRO.st) { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; b = s; } } return b && { s: b, d: bd }; }
function lineBadge(l) { const b = document.createElement('span'); b.className = 'lb'; const c = METRO.lines[l] || '#888'; b.style.background = c;
  const h = c.replace('#', ''), [R, Gc, B] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); b.style.color = (R * 299 + Gc * 587 + B * 114) / 1000 > 150 ? '#111' : '#fff';
  b.textContent = l.replace(/^M/, ''); b.title = l.startsWith('M') ? 'Métro ' + l.slice(1) : l; return b; }

// ---------- search index ----------
let IDX = [];
function buildSearch() {
  const typeLabel = { station: 'Gare / métro', park: 'Parc', attraction: 'Lieu', museum: 'Musée', viewpoint: 'Point de vue', square: 'Place', monument: 'Monument', marketplace: 'Marché', university: 'Université', mall: 'Centre commercial', stadium: 'Stade' };
  for (const [n, t, la, lo] of M.poi) IDX.push({ name: n, type: typeLabel[t] || 'Lieu', lat: la, lon: lo, k: norm(n) });
  // streets: centroid of longest edge per name
  const best = new Map();
  // one entry per street name and town (the same name exists in several communes)
  const town = e => { const q = M.quartiers[G.nq[G.ea[e]] - 1]; return q && q.ar > 100 ? q.name : ''; };
  for (let e = 0; e < G.nE; e++) { const n = G.en[e]; if (!n) continue; const L = G.LEN[e], key = n + '|' + town(e); const b = best.get(key); if (!b || L > b[0]) best.set(key, [L, e, n]); }
  for (const [key, [, e, n]] of best) {
    const a = G.ea[e], b = G.eb[e]; const [la, lo] = E.toLL((G.NX[a] + G.NX[b]) / 2, (G.NY[a] + G.NY[b]) / 2);
    const name = M.names[n - 1], tw = key.split('|')[1]; IDX.push({ name, type: tw ? 'Rue · ' + tw : 'Rue', lat: la, lon: lo, k: norm(name + (tw ? ' ' + tw : '')) });
  }
}
function searchBox(inp, res, onPick) {
  const run = () => {
    const q = norm(inp.value.trim()); if (q.length < 2) { res.hidden = true; return; }
    const words = q.split(/\s+/);
    const hits = IDX.filter(x => words.every(w => x.k.includes(w)))
      .sort((a, b) => (a.k.startsWith(q) ? 0 : 1) - (b.k.startsWith(q) ? 0 : 1) || a.type.startsWith('Rue') - b.type.startsWith('Rue') || a.name.length - b.name.length).slice(0, 8);
    res.innerHTML = '';
    if (!hits.length) { res.innerHTML = '<button disabled>Aucun résultat sur la carte</button>'; res.hidden = false; return; }
    for (const h of hits) { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<span></span><em></em>`; b.firstChild.textContent = h.name; b.lastChild.textContent = h.type; b.onclick = () => { onPick(h); inp.value = ''; res.hidden = true; }; res.appendChild(b); }
    res.hidden = false;
  };
  inp.addEventListener('input', run); inp.addEventListener('focus', run);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = res.querySelector('button:not([disabled])'); if (b) b.click(); } if (e.key === 'Escape') res.hidden = true; });
  document.addEventListener('click', e => { if (!res.contains(e.target) && e.target !== inp) res.hidden = true; });
}

// ---------- zones ----------
function arrLabel(n) { return n === 1 ? '1<sup>er</sup>' : n + '<sup>e</sup>'; }
function buildZones() {
  const box = $('#arr');
  for (let a = 1; a <= 20; a++) { const b = document.createElement('button'); b.type = 'button'; b.dataset.ar = a; b.innerHTML = arrLabel(a); b.setAttribute('aria-label', `${a}${a === 1 ? 'er' : 'e'} arrondissement`); b.onclick = () => toggleArr(a); box.appendChild(b); }
  const ql = $('#qlist');
  for (let a = 1; a <= 20; a++) {
    const h = document.createElement('div'); h.className = 'ah'; h.innerHTML = arrLabel(a) + ' arr.'; ql.appendChild(h);
    for (const q of M.quartiers.filter(q => q.ar === a)) {
      const l = document.createElement('label'); l.innerHTML = `<input type="checkbox" data-q="${q.id}"><span></span>`; l.lastChild.textContent = q.name;
      l.firstChild.onchange = e => { e.target.checked ? S.exclQ.add(q.id) : S.exclQ.delete(q.id); zonesChanged(); };
      ql.appendChild(l);
    }
  }
  // neighbouring communes: one zone each
  const cs = M.quartiers.filter(q => q.ar > 100);
  if (cs.length) {
    const h = document.createElement('div'); h.className = 'ah'; h.textContent = 'Communes voisines'; ql.appendChild(h);
    for (const q of cs) {
      const l = document.createElement('label'); l.innerHTML = `<input type="checkbox" data-q="${q.id}"><span></span>`; l.lastChild.textContent = q.name;
      l.firstChild.onchange = e => { e.target.checked ? S.exclQ.add(q.id) : S.exclQ.delete(q.id); zonesChanged(); };
      ql.appendChild(l);
    }
  }
  // initial view: Paris itself (the graph also covers the neighbouring communes)
  { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of M.quartiers) if (q.ar <= 20) for (const [la, lo] of q.rings[0]) { const [x, y] = E.toXY(la, lo); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } if (x1 > x0) M.parisB = [x0, y0, x1, y1]; }
  // centroids of arrondissements for labels
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
// one place for every exclusion: whole arrondissements, single quartiers, places (+ radius)
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
  if (M) for (const q of M.quartiers) if (q.ar > 100 && S.exclQ.has(q.id)) mk(q.name, () => { S.exclQ.delete(q.id); zonesChanged(); });
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
}
// ---------- « Chez moi » (stored only in this browser) ----------
function getHome() { try { const h = JSON.parse(localStorage.getItem('runparis-home') || 'null'); return h && isFinite(h.lat) && isFinite(h.lon) ? h : null; } catch (e) { return null; } }
function renderHome() {
  const h = getHome(), go = $('#home-go'), save = $('#home-save');
  go.hidden = !h;
  const isHome = h && S.start && Math.abs(S.start.lat - h.lat) < 1e-6 && Math.abs(S.start.lon - h.lon) < 1e-6;
  save.textContent = isHome ? 'Retirer « Chez moi »' : h ? 'Remplacer « Chez moi » par ce départ' : 'Enregistrer ce départ comme « Chez moi »';
  save.dataset.mode = isHome ? 'remove' : 'save'; save.hidden = !S.start;
  go.hidden = !h || isHome;
}

// ---------- map rendering ----------
const cv = $('#map'), ctx = cv.getContext('2d');
let V = { s: 0.05, tx: 0, ty: 0 }, W = 0, H = 0, dpr = 1;
function buildPaths() {
  const cls = { minor: new Path2D(), path: new Path2D(), c1: new Path2D(), c2: new Path2D(), c3: new Path2D() };
  for (let e = 0; e < G.nE; e++) {
    if (G.bad[e]) continue;
    const p = G.P[e] ? cls.path : G.C[e] === 3 ? cls.c3 : G.C[e] === 2 ? cls.c2 : G.C[e] === 1 ? cls.c1 : cls.minor;
    const a = G.ea[e], b = G.eb[e];
    p.moveTo(G.NX[a], G.NY[a]);
    for (let k = G.go[e]; k < G.go[e + 1]; k++) p.lineTo(G.GX[k], G.GY[k]);
    p.lineTo(G.NX[b], G.NY[b]);
  }
  paths = cls;
  const polyPath = list => { const p = new Path2D(); for (const rings of list) for (const r of rings) { r.forEach(([la, lo], i) => { const [x, y] = E.toXY(la, lo); i ? p.lineTo(x, y) : p.moveTo(x, y); }); p.closePath(); } return p; };
  if (M.layers) { M.greenPath = polyPath(M.layers.green || []); M.waterPath = polyPath(M.layers.water || []); }
  if (M.cemeteries) M.cemPath = polyPath(M.cemeteries.map(c => c.rings));
  if (M.stations) { const sp = new Path2D(); for (const st of M.stations) for (const r of st.rings) { r.forEach(([la, lo], i) => { const [x, y] = E.toXY(la, lo); i ? sp.lineTo(x, y) : sp.moveTo(x, y); }); sp.closePath(); } M.stationPath = sp; }
  for (const q of M.quartiers) { const p = new Path2D(); for (const r of q.rings) { r.forEach(([la, lo], i) => { const [x, y] = E.toXY(la, lo); i ? p.lineTo(x, y) : p.moveTo(x, y); }); p.closePath(); } q.path = p; }
}
function resize() {
  const r = cv.getBoundingClientRect(); dpr = window.devicePixelRatio || 1; W = r.width; H = r.height;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); draw();
}
// ---------- mobile bottom sheet ----------
const MOB = matchMedia('(max-width: 860px)');
let sheet = 'half';
function sheetPx() { return MOB.matches ? $('.panel').getBoundingClientRect().height : 0; }
function sheetHeights() {
  const foot = [...document.querySelectorAll('.pfoot')].find(f => !f.hidden);
  const peek = $('#grab').offsetHeight + $('.phead').offsetHeight + $('.tabs').offsetHeight + (foot ? foot.offsetHeight : 0);
  return { peek, half: Math.max(peek + 170, Math.round(innerHeight * 0.56)), full: innerHeight - 56 };
}
function setSheet(st, refit) {
  if (!MOB.matches) { document.documentElement.style.removeProperty('--sheet-h'); return; }
  sheet = st; document.documentElement.style.setProperty('--sheet-h', sheetHeights()[st] + 'px');
  document.documentElement.classList.toggle('sheet-full', st === 'full');
  if (refit) setTimeout(() => { if (S.route) (S.tab === 'race' && S.race ? fit(raceBounds()) : fitRoute()); }, 270);
}
(() => {
  let d = null; const panel = $('.panel');
  const start = e => { if (!MOB.matches || e.target.closest('#theme-btn, a.logo')) return; d = { y: e.clientY, h: panel.getBoundingClientRect().height, moved: false }; panel.classList.add('dragging'); e.currentTarget.setPointerCapture(e.pointerId); };
  const move = e => { if (!d) return; const dy = e.clientY - d.y; if (Math.abs(dy) > 4) d.moved = true; const hs = sheetHeights(); document.documentElement.style.setProperty('--sheet-h', Math.max(hs.peek, Math.min(hs.full, d.h - dy)) + 'px'); };
  const end = () => { if (!d) return; panel.classList.remove('dragging'); const h = panel.getBoundingClientRect().height, hs = sheetHeights();
    if (!d.moved) setSheet(sheet === 'peek' ? 'half' : sheet === 'half' ? 'full' : 'peek', true);
    else { const st = Object.entries(hs).sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h))[0][0]; setSheet(st, st !== 'full'); }
    d = null; };
  for (const el of [$('#grab'), $('.phead')]) { el.addEventListener('pointerdown', start); el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); }
  MOB.addEventListener('change', () => { setSheet(sheet); if (MOB.matches) $('#legend').open = false; });
  if (MOB.matches) { $('#legend').open = false; setSheet('half'); }
  addEventListener('resize', () => MOB.matches && setSheet(sheet));
})();
function raceBounds() { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of routePts(S.route)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; }
function fit(bounds) {
  const r = cv.getBoundingClientRect(); W = r.width || 800; H = r.height || 600;
  const Hv = Math.max(160, H - sheetPx()), top = MOB.matches ? 50 : 40; // on phones, fit into the map area left visible above the sheet
  const [x0, y0, x1, y1] = bounds || M.parisB || [0, 0, G.maxX, G.maxY];
  const pad = MOB.matches ? 18 : 30; V.s = Math.min((W - 2 * pad - (MOB.matches ? 50 : 0)) / (x1 - x0 || 1), (Hv - 2 * pad - top) / (y1 - y0 || 1));
  V.tx = (W - (MOB.matches ? 50 : 0)) / 2 - (x0 + x1) / 2 * V.s; V.ty = (Hv + top) / 2 - (y0 + y1) / 2 * V.s; draw();
}
function drawMetro(hiOnly) {
  if (!METRO.st.length) return;
  {
    const endSt = S.route && S.route._metroEnd ? S.route._metroEnd.s : null;
    const big = V.s >= 0.09, badges = V.s >= 0.2;
    ctx.font = `700 10px ${css('--f-cond')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const st of METRO.st) {
      const sx = st.x * V.s + V.tx, sy = st.y * V.s + V.ty; if (sx < -60 || sy < -20 || sx > W + 60 || sy > H + 20) continue;
      const hi = st === endSt; if (hiOnly ? !hi : !S.showMetro || (V.s < 0.04 && !hi)) continue; const r = hi ? 9 : big ? 6.5 : 3;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fillStyle = colors.metroBg; ctx.fill(); ctx.lineWidth = hi ? 2.5 : big ? 1.6 : 1.2; ctx.strokeStyle = hi ? colors.route : colors.metroInk; ctx.stroke();
      if (big || hi) { ctx.fillStyle = colors.metroInk; ctx.font = `800 ${hi ? 11 : 8.5}px ${css('--f-cond')}`; ctx.fillText('M', sx, sy + 0.5); }
      if (badges || hi) { // line badges + name
        let bx = sx + r + 4; ctx.textAlign = 'left';
        for (const l of st.ls) { const lab = l.replace(/^M/, '').replace('RER ', ''), w = Math.max(14, ctx.measureText(lab).width + 6); const c = METRO.lines[l] || '#888';
          ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, sy - 7, w, 14, 3) : ctx.rect(bx, sy - 7, w, 14); ctx.fill();
          const h = c.replace('#', ''), lum = (parseInt(h.substr(0, 2), 16) * 299 + parseInt(h.substr(2, 2), 16) * 587 + parseInt(h.substr(4, 2), 16) * 114) / 1000;
          ctx.fillStyle = lum > 150 ? '#111' : '#fff'; ctx.font = `800 10px ${css('--f-cond')}`; ctx.textAlign = 'center'; ctx.fillText(lab, bx + w / 2, sy + 0.5); ctx.textAlign = 'left'; bx += w + 2; }
        if (V.s >= 0.32 || hi) { ctx.font = `700 11.5px ${css('--f-body')}`; ctx.lineWidth = 3.5; ctx.strokeStyle = colors.bg; ctx.strokeText(st.n, bx + 3, sy + 0.5); ctx.fillStyle = colors.ink; ctx.fillText(st.n, bx + 3, sy + 0.5); }
        ctx.textAlign = 'center';
      }
    }
  }
}
let raf = 0; function draw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
function render() {
  if (!G || !paths.minor) return;
  colors = { street: css('--street'), major: css('--street-major'), path: css('--street-path'), quart: css('--quart'), route: css('--route'), route2: css('--route-2'), font: css('--font'), tree: css('--tree'), metroBg: css('--metro-bg'), metroInk: css('--metro-ink'), casing: css('--route-casing'), avoid: css('--avoid'), avoidFill: css('--avoid-fill'), sig: css('--sig'), bg: css('--map-bg'), ink: css('--ink'), muted: css('--muted'), good: css('--good'), poi: css('--poi'), panel: css('--panel'), station: css('--station'), stationFill: css('--station-fill'), label: css('--label'), water: css('--water'), green: css('--green'), cem: css('--cem'), pinB: css('--pin-b'), accentInk: css('--accent-ink') };
  if (!colors.hatch || colors.hatchKey !== colors.avoid) { const pc = document.createElement('canvas'); pc.width = pc.height = 8; const g = pc.getContext('2d'); g.strokeStyle = colors.avoid; g.globalAlpha = 0.55; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-2, 10); g.lineTo(10, -2); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(6, 10); g.lineTo(10, 6); g.stroke(); colors.hatch = ctx.createPattern(pc, 'repeat'); colors.hatchKey = colors.avoid; }
  if (colors.hatch && colors.hatch.setTransform) colors.hatch.setTransform(new DOMMatrix().scale(1 / (V.s || 1)));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(V.s * dpr, 0, 0, V.s * dpr, V.tx * dpr, V.ty * dpr);
  const px = v => v / V.s;
  // background: green spaces, water, cemeteries
  if (M.greenPath) { ctx.fillStyle = colors.green; ctx.fill(M.greenPath, 'evenodd'); }
  if (M.cemPath) { ctx.fillStyle = colors.cem; ctx.fill(M.cemPath, 'evenodd'); }
  if (M.waterPath) { ctx.fillStyle = colors.water; ctx.fill(M.waterPath, 'evenodd'); }
  // excluded quartiers
  if (S.tab !== 'race') for (const q of M.quartiers) if (S.exclQ.has(q.id)) { ctx.fillStyle = colors.avoidFill; ctx.fill(q.path); if (colors.hatch) { ctx.fillStyle = colors.hatch; ctx.fill(q.path); } }
  if (M.stationPath) { ctx.fillStyle = colors.stationFill; ctx.fill(M.stationPath, 'nonzero'); }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const z = V.s; // px per metre
  ctx.strokeStyle = colors.street; ctx.lineWidth = px(z > 0.25 ? 1.6 : z > 0.1 ? 0.9 : 0.5); ctx.stroke(paths.minor);
  ctx.strokeStyle = colors.path; ctx.setLineDash([px(3), px(2)]); ctx.lineWidth = px(z > 0.25 ? 1.4 : 0.7); ctx.stroke(paths.path); ctx.setLineDash([]);
  ctx.strokeStyle = colors.major; ctx.lineWidth = px(z > 0.25 ? 2 : 1); ctx.stroke(paths.c1);
  ctx.lineWidth = px(z > 0.25 ? 3 : 1.5); ctx.stroke(paths.c2);
  ctx.lineWidth = px(z > 0.25 ? 4 : 2); ctx.stroke(paths.c3);
  // quartier & arr borders
  ctx.strokeStyle = colors.quart; ctx.lineWidth = px(1); ctx.setLineDash([px(5), px(4)]);
  for (const q of M.quartiers) ctx.stroke(q.path);
  ctx.setLineDash([]);
  if (S.tab !== 'race') for (const q of M.quartiers) if (S.exclQ.has(q.id)) { ctx.strokeStyle = colors.avoid; ctx.lineWidth = px(2.4); ctx.stroke(q.path); }
  // avoided places
  if (S.tab !== 'race') for (const p of S.places) { const [x, y] = E.toXY(p.lat, p.lon); ctx.beginPath(); ctx.arc(x, y, p.r, 0, 7); ctx.fillStyle = colors.avoidFill; ctx.fill(); if (colors.hatch) { ctx.fillStyle = colors.hatch; ctx.fill(); } ctx.strokeStyle = colors.avoid; ctx.lineWidth = px(2.4); ctx.stroke(); }
  // signals
  if (S.showSig) { ctx.fillStyle = colors.sig; const h = px(z > 0.2 ? 3 : 1.8); ctx.beginPath(); for (const s of G.SIG) ctx.rect(s.x - h, s.y - h, 2 * h, 2 * h); ctx.fill(); }
  // all street trees, as small dots (a density map when zoomed out)
  if (S.showTrees && TREES) {
    const x0 = -V.tx / V.s, y0 = -V.ty / V.s, x1 = (W - V.tx) / V.s, y1 = (H - V.ty) / V.s, r = px(z > 0.4 ? 2.4 : z > 0.15 ? 1.6 : 1);
    ctx.save(); ctx.globalAlpha = z > 0.15 ? 0.75 : 0.45; ctx.fillStyle = colors.tree; ctx.beginPath();
    for (let i = 0; i < TREES.length; i += 2) { const x = TREES[i], y = TREES[i + 1]; if (x < x0 || x > x1 || y < y0 || y > y1) continue; ctx.rect(x - r, y - r, 2 * r, 2 * r); }
    ctx.fill(); ctx.restore();
  }
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawLabels(); ctx.restore();
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawMetro(false);
  if (S.showFont && V.s >= 0.03) { const r = V.s > 0.2 ? 6.5 : V.s > 0.08 ? 4.5 : 2.5; for (const f of FONT) { const sx = f.x * V.s + V.tx, sy = f.y * V.s + V.ty; if (sx < -10 || sy < -10 || sx > W + 10 || sy > H + 10) continue;
    if (r < 3) { ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fillStyle = colors.font; ctx.fill(); } else drawDrop(sx, sy, r, false); } }
  ctx.restore();
  // route
  const R = S.route;
  if (R && S.alts && S.alts.length > 1) {
    ctx.save(); ctx.globalAlpha = 0.45; ctx.strokeStyle = colors.route; ctx.lineWidth = px(2.5); ctx.setLineDash([px(6), px(5)]);
    for (const a of S.alts) { if (a === R) continue; const p = new Path2D(); let f = true;
      for (const [e, fromA] of a.edges) { const pts = E.edgePts(e); if (!fromA) pts.reverse(); pts.forEach(([x, y], i) => { if (f) { p.moveTo(x, y); f = false; } else if (i) p.lineTo(x, y); }); }
      ctx.stroke(p); }
    ctx.restore();
    // number each proposal at its midpoint
    S.alts.forEach((a, i) => { if (a === R) return; const v = a.nodes[Math.floor(a.nodes.length * 0.55)]; a._label = [G.NX[v], G.NY[v], i + 1]; });
  }
  if (R) {
    // each pass over the same street gets its own lane (to the right of its direction of travel)
    const LI = laneInfo(R), U = 3 / V.s;
    const OP = LI.any ? LI.pts.map(([x, y], i) => [x - LI.ty[i] * LI.lane[i] * U, y + LI.tx[i] * LI.lane[i] * U]) : LI.pts;
    const stroke = (a, b, col) => { const p = new Path2D(); for (let i = a; i <= b; i++) i === a ? p.moveTo(OP[i][0], OP[i][1]) : p.lineTo(OP[i][0], OP[i][1]);
      ctx.strokeStyle = colors.casing; ctx.lineWidth = px(LI.any ? 7 : 8); ctx.stroke(p); ctx.strokeStyle = col; ctx.lineWidth = px(LI.any ? 4 : 4.5); if (col === colors.route2) { ctx.lineCap = 'butt'; ctx.setLineDash([px(7), px(5)]); } ctx.stroke(p); ctx.setLineDash([]); ctx.lineCap = 'round'; };
    // trees along the route, like the feux: small dots drawn UNDER the line, at street zoom only,
    // thinned to one dot per ~8 px so a tree-lined avenue reads as a green fringe, not noise
    const rt = z > 0.22 && !S.showTrees ? routeTrees(R) : null;
    if (rt && rt.length) { const seen = new Set(), rr = px(2.2); ctx.fillStyle = colors.tree; ctx.beginPath();
      for (const i of rt) { const k = Math.floor(TREES[i] * z / 8) + ',' + Math.floor(TREES[i + 1] * z / 8); if (seen.has(k)) continue; seen.add(k); ctx.moveTo(TREES[i] + rr, TREES[i + 1]); ctx.arc(TREES[i], TREES[i + 1], rr, 0, 7); }
      ctx.fill(); }
    if (!LI.any) stroke(0, OP.length - 1, colors.route);
    else for (let a = 0; a < OP.length - 1;) { // short chunks so later passes are drawn over earlier ones; 2nd pass in its own colour
      let b = a + 1; while (b < OP.length - 1 && b - a < 24 && LI.pass[b] === LI.pass[a]) b++;
      stroke(a, b, LI.pass[a] % 2 ? colors.route2 : colors.route); a = b; }
    // feux on route
    const ids = new Set(S.tab === 'race' ? [] : R.clusterIds); ctx.fillStyle = colors.sig; ctx.strokeStyle = colors.casing; ctx.lineWidth = px(1.5);
    for (const s of G.SIG) if (ids.has(s.id)) { const h = px(4.5); ctx.beginPath(); ctx.rect(s.x - h, s.y - h, 2 * h, 2 * h); ctx.fill(); ctx.stroke(); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // direction chevrons every ~70 px along the line
    if (V.s >= 0.09) { const P = LI.pts; let run = 35; ctx.strokeStyle = colors.panel; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 1; i < P.length; i++) { run += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]) * V.s;
        if (run < 70 || i < 2 || i > P.length - 3) continue; run = 0;
        const sx = OP[i][0] * V.s + V.tx, sy = OP[i][1] * V.s + V.ty; if (sx < -10 || sy < -10 || sx > W + 10 || sy > H + 10) continue;
        const dx = LI.tx[i], dy = LI.ty[i], k = 2.6;
        ctx.beginPath(); ctx.moveTo(sx - dx * k - dy * k, sy - dy * k + dx * k); ctx.lineTo(sx + dx * k, sy + dy * k); ctx.lineTo(sx - dx * k + dy * k, sy - dy * k - dx * k); ctx.stroke(); } }
    // km markers, placed on the lane of the pass they belong to
    let acc = 0, next = 1000;
    ctx.font = `800 11px ${css('--f-body')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    {
      const pts = LI.pts;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        while (acc + d >= next && next < R.len - 150) {
          const t = (next - acc) / d, x = OP[i - 1][0] + t * (OP[i][0] - OP[i - 1][0]), y = OP[i - 1][1] + t * (OP[i][1] - OP[i - 1][1]);
          const sx = x * V.s + V.tx, sy = y * V.s + V.ty, km = next / 1000;
          if (V.s > 0.06 || km % 2 === 0 || R.len < 12000) {
            ctx.beginPath(); ctx.arc(sx, sy, 9, 0, 7); ctx.fillStyle = colors.panel; ctx.fill(); ctx.strokeStyle = colors.route; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = colors.ink; ctx.fillText(String(km), sx, sy + 0.5);
          }
          next += 1000;
        }
        acc += d;
      }
    }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (M.stationPath) { ctx.save(); ctx.setTransform(V.s * dpr, 0, 0, V.s * dpr, V.tx * dpr, V.ty * dpr); ctx.strokeStyle = colors.station; ctx.lineWidth = 1.2 / V.s; ctx.setLineDash([4 / V.s, 3 / V.s]); ctx.stroke(M.stationPath); ctx.restore(); }
  // arrondissement numbers when zoomed out
  if (V.s < 0.12 && M.arrC) {
    ctx.font = `800 ${V.s < 0.07 ? 14 : 17}px ${css('--f-display')}`; if ('fontStretch' in ctx) ctx.fontStretch = 'condensed'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = colors.muted; ctx.globalAlpha = .75;
    for (const a in M.arrC) { const c = M.arrC[a]; const x = c[0] / c[2] * V.s + V.tx, y = c[1] / c[2] * V.s + V.ty; if (+a > 100) { if (V.s < 0.045) continue; ctx.save(); ctx.font = `500 ${V.s < 0.07 ? 11 : 12}px ${css('--f-display')}`; ctx.fillText(M.quartiers.find(q => q.ar === +a)?.name || '', x, y); ctx.restore(); } else ctx.fillText(a === '1' ? '1er' : a + 'e', x, y); }
    ctx.globalAlpha = 1; if ('fontStretch' in ctx) ctx.fontStretch = 'normal';
  }
  drawMetro(true);
  if (S.route && V.s >= 0.05) { const rf = routeFountains(S.route); if (rf) for (const { f } of rf.list) drawDrop(f.x * V.s + V.tx, f.y * V.s + V.ty, V.s > 0.15 ? 8 : 6.5, true); }
  // pins
  // lieux (connus ou de passage) : losange magenta (D-69), pour ne pas se confondre avec les arbres
  const dia = (p, label, r) => { if (!p) return; const [x, y] = E.toXY(p.lat, p.lon); const sx = x * V.s + V.tx, sy = y * V.s + V.ty; ctx.beginPath(); ctx.moveTo(sx, sy - r); ctx.lineTo(sx + r, sy); ctx.lineTo(sx, sy + r); ctx.lineTo(sx - r, sy); ctx.closePath(); ctx.fillStyle = colors.poi; ctx.fill(); ctx.strokeStyle = colors.casing; ctx.lineWidth = 2; ctx.stroke(); if (label) { ctx.fillStyle = colors.accentInk === '#0B0B0C' ? '#0B0B0C' : '#FFFFFF'; ctx.font = `800 12px ${css('--f-body')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, sx, sy + 1); } };
  const pin = (p, label, col, txt) => { if (!p) return; const [x, y] = E.toXY(p.lat, p.lon); const sx = x * V.s + V.tx, sy = y * V.s + V.ty; ctx.beginPath(); ctx.arc(sx, sy, 11, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = colors.casing; ctx.lineWidth = 2.5; ctx.stroke(); ctx.fillStyle = txt || '#fff'; ctx.font = `700 13px ${css('--f-display')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, sx, sy + 1); };
  if (R && S.alts) for (const a of S.alts) if (a !== R && a._label) {
    const [x, y, n] = a._label, sx = x * V.s + V.tx, sy = y * V.s + V.ty;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(sx - 11, sy - 10, 22, 20, 6) : ctx.rect(sx - 11, sy - 10, 22, 20); ctx.fillStyle = colors.panel; ctx.fill(); ctx.strokeStyle = colors.route; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = colors.route; ctx.font = `700 12px ${css('--f-display')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), sx, sy + 1);
  }
  // famous places passed by the selected route
  if (R && R.sightsN) {
    ctx.font = `700 12px ${css('--f-body')}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const nm of R.sights) { const sg = SIGHTS.find(x => x.name === nm); if (!sg) continue; const sx = sg.x * V.s + V.tx, sy = sg.y * V.s + V.ty;
      dia(sg, '', 8); ctx.font = `700 12px ${css('--f-body')}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = 3.5; ctx.strokeStyle = colors.bg; ctx.strokeText(nm, sx + 10, sy); ctx.fillStyle = colors.ink; ctx.fillText(nm, sx + 10, sy); }
  }
  if (S.tab === 'race') {
    if (R) { const a = R.nodes[0], b = R.nodes[R.nodes.length - 1]; const ll = v => { const [la, lo] = E.toLL(G.NX[v], G.NY[v]); return { lat: la, lon: lo }; }; pin(ll(a), 'D', colors.route, colors.accentInk); pin(ll(b), 'A', colors.pinB, colors.panel); }
    return;
  }
  S.vias.forEach((v, i) => dia(v, String(i + 1), 13));
  pin(S.start, S.mode === 'ab' ? 'A' : 'D', colors.route, colors.accentInk);
  if (S.mode === 'ab' && !S.endFree) pin(S.end, 'B', colors.pinB, colors.panel);
  if (S.mode === 'ab' && S.endFree && S.route) { const v = S.route.nodes[S.route.nodes.length - 1]; const [la, lo] = E.toLL(G.NX[v], G.NY[v]); pin({ lat: la, lon: lo }, 'B', colors.pinB, colors.panel); }
}

// ---------- street names ----------
let labelOrder = null;
function drawLabels() {
  if (V.s < 0.22) return;
  if (!labelOrder) {
    labelOrder = []; for (let e = 0; e < G.nE; e++) if (G.en[e] && !G.bad[e]) labelOrder.push(e);
    labelOrder.sort((a, b) => (G.C[b] - G.C[a]) || (G.LEN[b] - G.LEN[a]));
  }
  const minC = V.s < 0.35 ? 2 : V.s < 0.6 ? 1 : 0;
  const boxes = [], placed = new Map(); let n = 0;
  const fs = V.s > 1 ? 12.5 : 11.5;
  ctx.font = `500 ${fs}px ${css('--f-body')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = colors.bg; ctx.fillStyle = colors.label;
  const x0 = -V.tx / V.s, y0 = -V.ty / V.s, x1 = (W - V.tx) / V.s, y1 = (H - V.ty) / V.s;
  for (const e of labelOrder) {
    if (G.C[e] < minC) continue;
    const a = G.ea[e]; const ax = G.NX[a], ay = G.NY[a];
    if (ax < x0 - 300 || ax > x1 + 300 || ay < y0 - 300 || ay > y1 + 300) continue;
    const name = M.names[G.en[e] - 1]; if (!name) continue;
    const pts = E.edgePts(e);
    let bi = -1, bl = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (l > bl) { bl = l; bi = i; } }
    const tw = ctx.measureText(name).width;
    if (bl * V.s < tw + 16) continue;
    const p0 = pts[bi - 1], p1 = pts[bi];
    const cx = (p0[0] + p1[0]) / 2 * V.s + V.tx, cy = (p0[1] + p1[1]) / 2 * V.s + V.ty;
    if (cx < -50 || cy < -20 || cx > W + 50 || cy > H + 20) continue;
    let ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
    const prev = placed.get(name); if (prev && prev.some(([px, py]) => Math.hypot(px - cx, py - cy) < 260)) continue;
    const hw = Math.abs(Math.cos(ang)) * tw / 2 + Math.abs(Math.sin(ang)) * fs / 2 + 3, hh = Math.abs(Math.sin(ang)) * tw / 2 + Math.abs(Math.cos(ang)) * fs / 2 + 3;
    if (boxes.some(b => Math.abs(b[0] - cx) < b[2] + hw && Math.abs(b[1] - cy) < b[3] + hh)) continue;
    boxes.push([cx, cy, hw, hh]); if (!prev) placed.set(name, [[cx, cy]]); else prev.push([cx, cy]);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.strokeText(name, 0, 0); ctx.fillText(name, 0, 0); ctx.restore();
    if (++n > 180) break;
  }
}

// ---------- theme ----------
function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  ['auto', 'light', 'dark'].forEach(k => $('#t-' + k).setAttribute('aria-pressed', k === t));
  try { localStorage.setItem('runparis-theme', t); } catch (e) {}
  draw(); if (S.route) drawProfile(S.route);
}
['auto', 'light', 'dark'].forEach(k => $('#t-' + k).onclick = () => { applyTheme(k); $('#themepop').hidden = true; $('#theme-btn').setAttribute('aria-expanded', false); });
$('#theme-btn').onclick = e => { e.stopPropagation(); const p = $('#themepop'); p.hidden = !p.hidden; $('#theme-btn').setAttribute('aria-expanded', !p.hidden); };
document.addEventListener('click', e => { const p = $('#themepop'); if (!p.hidden && !p.contains(e.target)) { p.hidden = true; $('#theme-btn').setAttribute('aria-expanded', false); } });
try { const t = localStorage.getItem('runparis-theme'); if (t && t !== 'auto') applyTheme(t); } catch (e) {}

// ---------- map interaction ----------
const ptrs = new Map(); let drag = null, pinch = null;
cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.offsetX, e.offsetY]); if (ptrs.size === 1) drag = { x: e.offsetX, y: e.offsetY, tx: V.tx, ty: V.ty, moved: false }; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: V.s, tx: V.tx, ty: V.ty, cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 }; drag = null; } });
cv.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const k = Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d; zoomAt(pinch.cx, pinch.cy, pinch.s * k, pinch); return; }
  if (drag) { const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y; if (Math.hypot(dx, dy) > 4) drag.moved = true; if (drag.moved) { V.tx = drag.tx + dx; V.ty = drag.ty + dy; draw(); } }
});
cv.addEventListener('pointerup', e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (drag && !drag.moved) click(e.offsetX, e.offsetY); drag = null; });
cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = null; pinch = null; });
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, V.s * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
function zoomAt(cx, cy, s, base) {
  s = Math.max(0.02, Math.min(3, s)); const b = base || V; const mx = (cx - b.tx) / b.s, my = (cy - b.ty) / b.s;
  V.s = s; V.tx = cx - mx * s; V.ty = cy - my * s; draw();
}
$('#zin').onclick = () => zoomAt(W / 2, H / 2, V.s * 1.5);
$('#zout').onclick = () => zoomAt(W / 2, H / 2, V.s / 1.5);
$('#zfit').onclick = () => fitRoute();
function pip(pt, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [yi, xi] = ring[i], [yj, xj] = ring[j]; if (((yi > pt[0]) !== (yj > pt[0])) && (pt[1] < (xj - xi) * (pt[0] - yi) / (yj - yi) + xi)) c = !c; } return c; }
function click(sx, sy) {
  const x = (sx - V.tx) / V.s, y = (sy - V.ty) / V.s; const [lat, lon] = E.toLL(x, y);
  const q = M.quartiers.find(q => q.rings.some(r => pip([lat, lon], r)));
  const t = S.tool;
  if (t === 'start' || t === 'end') {
    if (!q) return toast('Choisis un point sur la carte (Paris et communes voisines).');
    setPoint(t, { lat, lon, name: `Point sur la carte · ${q.name}` }); setTool(null); generate(); return;
  }
  if ((t === 'quart' || t === 'place' || t === 'via') && !q) return toast('Choisis un point sur la carte (Paris et communes voisines).');
  if (t === 'via') { if (!q) return toast('Choisis un point sur la carte (Paris et communes voisines).'); addVia({ lat, lon, name: `Point · ${q.name}` }); setTool(null); return; }
  if (t === 'quart') { S.exclQ.has(q.id) ? S.exclQ.delete(q.id) : S.exclQ.add(q.id); zonesChanged(); toast(`${q.name}${q.ar > 100 ? '' : ` (${q.ar}${q.ar === 1 ? 'er' : 'e'})`} ${S.exclQ.has(q.id) ? 'évité' : 'réautorisé'}`); return; }
  if (t === 'place') { S.places.push({ lat, lon, r: 150, name: `Point · ${q.name}` }); renderPlaces(); draw(); toast('Lieu évité (150 m). Rayon modifiable dans « À éviter ».'); return; }
}
function setTool(t) {
  S.tool = S.tool === t ? null : t;
  document.querySelectorAll('.tool').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === S.tool));
  cv.classList.toggle('pick', !!S.tool);
  const msg = { start: 'Clique sur la carte pour placer le départ.', end: "Clique sur la carte pour placer l'arrivée.", quart: 'Clique sur un quartier pour l’éviter ou le réautoriser.', place: 'Clique sur la carte pour éviter un lieu (150 m autour).', via: 'Clique sur la carte pour ajouter un lieu par où passer.' };
  if (S.tool) toast(msg[S.tool], 3500);
}
document.querySelectorAll('.tool').forEach(b => b.onclick = () => setTool(b.dataset.tool));
$('#pick-start').onclick = () => setTool('start');
$('#change-start').onclick = () => { const b = $('#start-box'); b.hidden = !b.hidden; $('#change-start').setAttribute('aria-expanded', !b.hidden); $('#change-start').textContent = b.hidden ? 'Changer' : 'Fermer'; if (!b.hidden) $('#start-q').focus(); };
// ---------- départ : ouvrir la recherche, « Autour de moi » (D-70) ----------
function openStart(focus) { $('#start-box').hidden = false; $('#change-start').setAttribute('aria-expanded', true); $('#change-start').textContent = 'Fermer'; if (focus) $('#start-q').focus(); }
function locate() {
  return new Promise(res => {
    if (!navigator.geolocation) { toast('Ta position n’est pas disponible sur cet appareil : choisis un départ.', 4000); openStart(false); return res(false); }
    toast('Recherche de ta position…', 10000);
    navigator.geolocation.getCurrentPosition(p => {
      const la = p.coords.latitude, lo = p.coords.longitude, [x, y] = E.toXY(la, lo), n = E.nearest(x, y);
      if (n < 0 || Math.hypot(G.NX[n] - x, G.NY[n] - y) > 800) { toast('Tu sembles hors de Paris et des communes voisines : choisis un départ.', 4500); openStart(false); return res(false); }
      $('#toast').hidden = true; setPoint('start', { lat: la, lon: lo, name: 'Ma position' }); if (!$('#start-box').hidden) $('#change-start').click(); fitRoute(true); res(true);
    }, e => { toast(e.code === 1 ? 'Position refusée : choisis un départ dans la recherche.' : 'Position introuvable : choisis un départ dans la recherche.', 4500); openStart(false); res(false); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
}
$('#pos-go').onclick = () => locate().then(ok => { if (ok && S.mode === 'loop') generate(); });
// réglages passés dans le lien, depuis l'accueil : ?km=10&arr=back&dep=pos&type=green&go=1, ou ?race=marathon
function applyParams() {
  const Q = new URLSearchParams(location.search); if (![...Q.keys()].length) return false;
  const rid = Q.get('race');
  if (rid) { const r = RACES.find(x => x.id === rid); setTab('race'); if (r) { S.race = r; showRace(r); renderRaces(); } return true; }
  if (Q.has('min')) { setUnit('min'); $('#dur').value = Math.max(5, Math.min(300, Math.round(parseFloat(Q.get('min')) || 45))); }
  else if (Q.has('km')) { setUnit('km'); $('#km').value = clampKm(parseFloat(Q.get('km')) || 10); }
  updateConv();
  const arr = Q.get('arr');
  if (['back', 'place', 'free'].includes(arr)) setArrival(arr);
  if (arr === 'place') { S.end = null; $('#end-name').textContent = 'Choisis ton arrivée'; draw(); }
  const ty = Q.get('type');
  if (ty === 'green' || ty === 'discover') $('#k-' + ty).click(); else if (ty === 'flat') $('#d-flat').click();
  const go = Q.get('go') === '1' && arr !== 'place', dep = Q.get('dep');
  if (dep === 'pos') { locate().then(ok => { if (ok && go) generate(); else if (ok && arr === 'place') $('#end-q').focus(); }); return true; }
  if (dep === 'pick') { openStart(true); return true; }
  if (dep === 'home' && S.start) { if (go) generate(); return true; }
  return false;
}
$('#home-go').onclick = () => { const h = getHome(); if (!h) return; setPoint('start', { lat: h.lat, lon: h.lon, name: 'Chez moi · ' + h.name.replace(/^Chez moi · /, '') }); if (S.mode === 'loop') generate(); };
$('#home-save').onclick = () => {
  const b = $('#home-save');
  try {
    if (b.dataset.mode === 'remove') { localStorage.removeItem('runparis-home'); toast('« Chez moi » retiré.'); }
    else if (S.start) { localStorage.setItem('runparis-home', JSON.stringify({ lat: S.start.lat, lon: S.start.lon, name: S.start.name })); toast('Départ enregistré comme « Chez moi » sur cet appareil.'); }
  } catch (e) { toast('Ce navigateur ne permet pas d’enregistrer « Chez moi ».'); }
  renderHome();
};
$('#avoid-cem').onchange = () => { $('#always').textContent = 'Toujours évités : gares, quais, métro' + ($('#avoid-cem').checked ? ' · cimetières' : '') + '.'; };
$('#avoid-cem').onchange();
$('#pick-end').onclick = () => setTool('end');
let tt; function toast(m, ms = 2600) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, ms); }

// ---------- controls ----------
function seg(ids, onPick) { ids.forEach(id => $('#' + id).onclick = () => { ids.forEach(j => $('#' + j).setAttribute('aria-pressed', j === id)); onPick(id); }); }
// Arrivée : Retour au départ (boucle) / Un lieu (A→B) / N'importe où (aller simple)
function setArrival(k) {
  ['back', 'place', 'free'].forEach(j => $('#a-' + j).setAttribute('aria-pressed', j === k));
  S.mode = k === 'back' ? 'loop' : 'ab'; S.endFree = k === 'free';
  $('#end-fixed').hidden = k !== 'place'; $('#end-free-hint').hidden = k !== 'free'; $('#end-metro-row').hidden = k !== 'free' || !METRO.st.length;
  if (k === 'place' && !S.end) { const p = M.poi.find(p => p[0] === 'Jardin du Luxembourg') || ['Jardin du Luxembourg', 'park', 48.8462, 2.3371]; setPoint('end', { lat: p[2], lon: p[3], name: p[0] }); }
  applyModeLabels(); draw();
}
['back', 'place', 'free'].forEach(k => $('#a-' + k).onclick = () => setArrival(k));
function applyModeLabels() {
  const ab = S.mode === 'ab';
  $('#start-pin').textContent = ab ? 'A' : 'D';
  $('#start-sub').textContent = ab ? 'Départ (A)' : 'Départ et arrivée';
  $('#start-q').placeholder = ab ? 'Rechercher le départ A (lieu, rue, métro…)' : 'Rechercher un départ (lieu, rue, métro…)';
  $('#tl-start').textContent = ab ? 'Placer A (départ)' : 'Placer le départ';
  document.querySelector('[data-tool="end"]').hidden = !ab || S.endFree;
}
// Distance ou durée
const clampKm = v => Math.max(1, Math.min(42, v));
function updateConv() {
  const p = pace();
  if (S.unit === 'km') { const v = parseFloat(String($('#km').value).replace(',', '.')); const sec = isFinite(v) && v > 0 ? v * p : 0; $('#conv').textContent = sec ? `≈ ${fmtDur(sec)}` : ''; }
  else { const v = parseFloat($('#dur').value); $('#conv').textContent = isFinite(v) && v > 0 ? `≈ ${fmt(clampKm(v * 60 / p))} km` : ''; }
  const cur = S.unit === 'km' ? parseFloat(String($('#km').value).replace(',', '.')) : parseFloat($('#dur').value);
  document.querySelectorAll(`#chips-${S.unit} button`).forEach(b => b.setAttribute('aria-pressed', Math.abs(+b.dataset.v - cur) < 0.01));
}
function fmtDur(sec) { const h = Math.floor(sec / 3600), m = Math.round(sec % 3600 / 60); return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`; }
function setUnit(u) {
  if (u === S.unit) return;
  const p = pace();
  if (u === 'min') { const v = parseFloat(String($('#km').value).replace(',', '.')); if (isFinite(v) && v > 0) $('#dur').value = Math.max(5, Math.round(v * p / 60 / 5) * 5); }
  else { const v = parseFloat($('#dur').value); if (isFinite(v) && v > 0) $('#km').value = Math.round(clampKm(v * 60 / p) * 2) / 2; }
  S.unit = u; ['km', 'min'].forEach(k => { $('#u-' + k).setAttribute('aria-pressed', k === u); $('#num-' + k).hidden = k !== u; $('#chips-' + k).hidden = k !== u; });
  updateConv();
}
$('#u-km').onclick = () => setUnit('km'); $('#u-min').onclick = () => setUnit('min');
function step(dir) {
  if (S.unit === 'km') { const v = parseFloat(String($('#km').value).replace(',', '.')) || 10; $('#km').value = clampKm(Math.round((v + dir * 0.5) * 2) / 2); }
  else { const v = parseFloat($('#dur').value) || 55; $('#dur').value = Math.max(5, Math.min(300, Math.round((v + dir * 5) / 5) * 5)); }
  updateConv();
}
$('#minus').onclick = () => step(-1); $('#plus').onclick = () => step(1);
document.querySelectorAll('#chips-km button').forEach(b => b.onclick = () => { $('#km').value = b.dataset.v; updateConv(); });
document.querySelectorAll('#chips-min button').forEach(b => b.onclick = () => { $('#dur').value = b.dataset.v; updateConv(); });
$('#km').addEventListener('input', updateConv); $('#dur').addEventListener('input', updateConv); $('#pace').addEventListener('input', updateConv);
$('#dur').addEventListener('keydown', e => { if (e.key === 'Enter') generate(); });
seg(['d-flat', 'd-any', 'd-target'], id => { S.dmode = id.slice(2); $('#dplus-row').hidden = S.dmode !== 'target'; });
// Feux : interrupteur (Ignorer / éviter) + intensité (Limiter / Au maximum)
let sigLevel = 1;
seg(['s-1', 's-2'], id => { sigLevel = +id.slice(2); S.sig = $('#sig-on').checked ? sigLevel : 0; });
$('#sig-on').onchange = e => { S.sig = e.target.checked ? sigLevel : 0; $('#sig-level').hidden = !e.target.checked; };
$('#show-sig').onclick = e => { S.showSig = !S.showSig; e.currentTarget.setAttribute('aria-pressed', S.showSig); draw(); };
$('#ly-metro').onclick = e => { S.showMetro = !S.showMetro; e.currentTarget.setAttribute('aria-pressed', S.showMetro); draw(); };
$('#ly-font').onclick = e => { S.showFont = !S.showFont; e.currentTarget.setAttribute('aria-pressed', S.showFont); draw(); };
$('#ly-trees').onclick = e => { S.showTrees = !S.showTrees; e.currentTarget.setAttribute('aria-pressed', S.showTrees); if (S.showTrees && !TREES) toast('Arbres en cours de chargement…'); draw(); };
$('#end-metro').onchange = () => markStale();
S.depNow = true;
$('#dep-now').onclick = () => { S.depNow = true; $('#dep-now').setAttribute('aria-pressed', true); $('#dep-at').setAttribute('aria-pressed', false); $('#dep-time').hidden = true; markStale(); };
$('#dep-at').onclick = () => { S.depNow = false; $('#dep-now').setAttribute('aria-pressed', false); $('#dep-at').setAttribute('aria-pressed', true); const i = $('#dep-time'); i.hidden = false;
  if (!i.value) { const t = new Date(Date.now() + 30 * 60000); t.setMinutes(Math.ceil(t.getMinutes() / 15) * 15 % 60, 0, 0); if (t.getMinutes() === 0 && new Date().getMinutes() > 45) t.setHours(t.getHours() + 1); i.value = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; } i.focus(); markStale(); };
$('#dep-time').onchange = () => markStale();
searchBox($('#start-q'), $('#start-res'), h => { setPoint('start', h); fitRoute(true); if (!$('#start-box').hidden) $('#change-start').click(); });
searchBox($('#end-q'), $('#end-res'), h => { setPoint('end', h); });
searchBox($('#avoid-q'), $('#avoid-res'), h => { S.places.push({ lat: h.lat, lon: h.lon, r: h.type === 'Parc' ? 300 : 150, name: h.name }); renderPlaces(); draw(); });
$('#gen').onclick = () => generate();
$('#pace').addEventListener('change', () => { if (!parsePace($('#pace').value)) toast('Allure non reconnue. Exemple : 5:30 (5 min 30 s par km).'); else if (S.route) { renderAlts(); showRoute(S.route, S.baseNotes.concat(routeNotes(S.route))); } });
$('#km').addEventListener('keydown', e => { if (e.key === 'Enter') generate(); });
$('#again').onclick = () => { S.seed++; generate(true); };
$('#recalc').onclick = () => generate(true);
// legend: open by default on large screens, closed on phones; remembered on this device
$('#legend').open = false; // légende intégrée (D-65) : le « ? » ouvre la liste complète
document.addEventListener('click', e => { const lg = $('#legend'); if (lg.open && !lg.contains(e.target)) lg.open = false; });
$('#edit').onclick = e => { e.stopPropagation(); showView('set'); };
$('.summary').onclick = () => showView('set');
function showView(v) {
  S.view = v;
  $('#view-set').hidden = v !== 'set'; $('#foot-set').hidden = v !== 'set';
  $('#view-res').hidden = v !== 'res'; $('#foot-res').hidden = v !== 'res';
  if (v === 'res') { $('#view-res').scrollTop = 0; requestAnimationFrame(() => { drawProfile(S.route); scrollToMap(); }); }
  else { $('#stale').hidden = true; $('#view-set').scrollTop = 0; if (MOB.matches && sheet !== 'full') setSheet('full'); }
}

// bring the map into view after a calculation (useful when the page is narrow and the map sits above the panel)
function scrollToMap() {
  if (MOB.matches) { setSheet('half', true); return; }
  const r = $('#mapwrap').getBoundingClientRect();
  if (r.top < -10 || r.top > innerHeight * 0.4) window.scrollTo({ top: Math.max(0, scrollY + r.top), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
// ---------- type of route ----------
const KHINT = { green: 'Passe au maximum par les parcs, jardins, quais et rues bordées d’arbres (≈ 160 000 arbres recensés dans OpenStreetMap), quitte à faire quelques détours.', discover: 'Passe devant des monuments et lieux connus à portée de ta distance. Tu peux aussi choisir tes lieux avec « Passer par un lieu ».' };
['classic', 'green', 'discover'].forEach(k => $('#k-' + k).onclick = () => { S.kind = k; ['classic', 'green', 'discover'].forEach(j => $('#k-' + j).setAttribute('aria-pressed', j === k)); $('#k-hint').hidden = k === 'classic'; $('#k-hint').textContent = KHINT[k] || ''; });
// ---------- places to pass by ----------
function addVia(p) {
  if (S.vias.length >= 5) return toast('5 lieux au maximum.');
  S.vias.push(p); renderVias(); markStale(); draw();
}
function renderVias() {
  const box = $('#via-list'); box.innerHTML = '';
  S.vias.forEach((v, i) => {
    const c = document.createElement('span'); c.className = 'vchip';
    c.innerHTML = `<span class="name"></span><button type="button">×</button>`;
    c.querySelector('.name').textContent = `${i + 1}. ${v.name}`;
    c.querySelector('button').setAttribute('aria-label', 'Ne plus passer par ' + v.name);
    c.querySelector('button').onclick = () => { S.vias.splice(i, 1); renderVias(); markStale(); draw(); };
    box.appendChild(c);
  });
  const add = document.createElement('button'); add.type = 'button'; add.className = 'link';
  const open = !$('#via-box').hidden;
  add.textContent = open ? 'Fermer' : '+ Passer par un lieu';
  add.onclick = () => { $('#via-box').hidden = !$('#via-box').hidden; renderVias(); if (!$('#via-box').hidden) $('#via-q').focus(); };
  box.appendChild(add);
}
searchBox($('#via-q'), $('#via-res'), h => { addVia({ lat: h.lat, lon: h.lon, name: h.name }); });
// ---------- official races ----------
function setTab(t) {
  S.tab = t; $('#tab-gen').setAttribute('aria-selected', t === 'gen'); $('#tab-race').setAttribute('aria-selected', t === 'race');
  const tools = document.querySelector('.tools'); tools.hidden = t === 'race';
  if (t === 'race') {
    $('#view-set').hidden = true; $('#foot-set').hidden = true; $('#view-res').hidden = true; $('#stale').hidden = true;
    $('#view-race').hidden = false; $('#foot-res').hidden = !S.race; $('#again').hidden = true;
    S.saved = { route: S.route, alts: S.alts, lastTarget: S.lastTarget, lastD: S.lastD, baseNotes: S.baseNotes };
    if (S.race) showRace(S.race, S.raceFrom, S.raceTo); else { S.route = null; S.alts = []; draw(); }
  } else {
    $('#view-race').hidden = true; $('#again').hidden = false;
    $('#view-res').appendChild($('#notes')); $('#view-res').appendChild($('#detail'));
    const sv = S.saved || {}; S.route = sv.route || null; S.alts = sv.alts || []; S.lastTarget = sv.lastTarget; S.lastD = sv.lastD; S.baseNotes = sv.baseNotes || [];
    showView(S.route ? 'res' : 'set'); if (S.route) { renderAlts(); showRoute(S.route, S.baseNotes.concat(routeNotes(S.route))); fitRoute(); } draw();
  }
}
$('#tab-gen').onclick = () => S.tab !== 'gen' && setTab('gen');
$('#tab-race').onclick = () => S.tab !== 'race' && setTab('race');
// ---- overlapping passes: resample the route, find where it runs over itself, and give each pass its own lane
function laneInfo(R) {
  if (R._lanes) return R._lanes;
  const src = routePts(R), step = 8, pts = [];
  for (let i = 1; i < src.length; i++) {
    const [ax, ay] = src[i - 1], [bx, by] = src[i], d = Math.hypot(bx - ax, by - ay); if (!d) continue;
    if (!pts.length) pts.push([ax, ay]);
    let last = pts[pts.length - 1], rem = Math.hypot(bx - last[0], by - last[1]);
    while (rem >= step) { const t = 1 - (rem - step) / d; last = [ax + (bx - ax) * Math.min(1, t), ay + (by - ay) * Math.min(1, t)]; pts.push(last); rem = Math.hypot(bx - last[0], by - last[1]); }
  }
  if (src.length) pts.push(src[src.length - 1]);
  const n = pts.length, tx = new Float32Array(n), ty = new Float32Array(n), lane = new Float32Array(n), pass = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const a = pts[Math.max(0, i - 2)], b = pts[Math.min(n - 1, i + 2)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; tx[i] = (b[0] - a[0]) / l; ty[i] = (b[1] - a[1]) / l; }
  const C = 14, grid = new Map(), key = (x, y) => Math.floor(x / C) + ',' + Math.floor(y / C);
  let any = false;
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i]; const cx = Math.floor(x / C), cy = Math.floor(y / C); const js = [];
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) for (const j of grid.get(gx + ',' + gy) || [])
      if (i - j >= 10 && Math.hypot(pts[j][0] - x, pts[j][1] - y) <= 12) js.push(j);
    if (js.length) { // one earlier pass = a run of consecutive samples; count the passes going the same way
      js.sort((a, b) => a - b); let same = 0, tot = 0, prev = -99;
      for (const j of js) { if (j - prev > 6) { tot++; if (tx[i] * tx[j] + ty[i] * ty[j] > 0) same++; } prev = j; }
      lane[i] = 1 + 2 * Math.min(same, 3); pass[i] = Math.min(tot, 3); any = true;
    }
    const k = key(x, y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
  }
  // the first pass also moves to its own lane wherever a later pass comes back over it
  if (any) for (let i = 0; i < n; i++) if (lane[i]) {
    const [x, y] = pts[i]; const cx = Math.floor(x / C), cy = Math.floor(y / C);
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) for (const j of grid.get(gx + ',' + gy) || []) if (j < i - 10 && !lane[j] && Math.hypot(pts[j][0] - x, pts[j][1] - y) <= 12) lane[j] = 1;
  }
  // smooth lane changes over ~40 m so the line glides from one lane to the other
  const sm = new Float32Array(n); for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = -5; k <= 5; k++) { const j = i + k; if (j >= 0 && j < n) { s += lane[j]; c++; } } sm[i] = s / c; }
  // a pass shorter than ~50 m is noise (crossing, corner): keep it in the colour of what surrounds it
  for (let i = 0; i < n;) { let j = i; while (j < n && pass[j] === pass[i]) j++; if (j - i < 6 && i > 0) for (let k = i; k < j; k++) pass[k] = pass[i - 1]; i = j; }
  return (R._lanes = { pts, tx, ty, lane: sm, pass, any });
}
// polyline of a route in map metres: from street edges, or from a GPX geometry (official races)
function routePts(r) {
  if (r.geom) return r.geom;
  if (r._pts) return r._pts;
  const pts = []; let first = true;
  for (const [e, fromA] of r.edges) { const p = E.edgePts(e); if (!fromA) p.reverse(); p.forEach((q, i) => { if (first || i) pts.push(q); first = false; }); }
  return (r._pts = pts);
}
// route object from a polyline (x, y in metres): length, smoothed D+, feux crossed, streets and quartiers
function geomRoute(xy) {
  let len = 0; const prof = [], nodes = [], names = new Map(), quart = new Map(), clusters = new Set();
  const step = 15; let acc = 0, next = 0;
  for (let i = 0; i < xy.length; i++) {
    if (i) { const d = Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]); len += d; }
    if (len >= next || i === xy.length - 1) {
      next = len + step;
      const v = E.nearest(xy[i][0], xy[i][1]); if (v < 0) continue;
      if (Math.hypot(G.NX[v] - xy[i][0], G.NY[v] - xy[i][1]) < 60) { prof.push([len, G.NZ[v]]); if (nodes[nodes.length - 1] !== v) nodes.push(v); quart.set(G.nq[v], (quart.get(G.nq[v]) || 0) + step);
        for (let k = G.deg[v]; k < G.deg[v + 1]; k++) { const e = G.adjE[k]; if (G.en[e]) names.set(G.en[e] - 1, (names.get(G.en[e] - 1) || 0) + step / 2); } }
    }
  }
  for (const s of G.SIG) { for (let i = 0; i < xy.length; i += 1) { if (Math.abs(xy[i][0] - s.x) < 20 && Math.abs(xy[i][1] - s.y) < 20) { clusters.add(s.id); break; } } }
  let gl = 0; // green share from nearest street edge
  return { geom: xy, len, prof, nodes, names, quart, up: E.smoothClimb(prof), feux: clusters.size, clusterIds: [...clusters], edges: [], green: null, kind: 'course' };
}
function sliceGeom(xy, a, b) {
  const out = []; let acc = 0;
  for (let i = 1; i < xy.length; i++) {
    const p = xy[i - 1], q = xy[i], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const lerp = t => [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
    if (acc + d >= a && acc <= b) { if (!out.length) out.push(lerp(Math.max(0, (a - acc) / d))); out.push(acc + d <= b ? q : lerp((b - acc) / d)); }
    acc += d;
  }
  return out;
}
function raceStats(race) {
  if (race.geom && !race._full) { race._xy = race.geom.map(([la, lo]) => E.toXY(la, lo)); race._full = geomRoute(race._xy); }
  if (!race._full) { const edges = race.edges.map(x => x >= 0 ? [x, true] : [-x - 1, false]); const e0 = edges[0]; const start = e0[1] ? G.ea[e0[0]] : G.eb[e0[0]]; race._full = E.statsOf(edges, start); race._full.kind = 'course'; }
  return race._full;
}
const RACE_CATS = [['all', 'Toutes'], ['10', '10 km'], ['long', 'Semi et plus'], ['bois', 'Bois et trail']];
function renderRaces() {
  const box = $('#races'), det = $('#race-detail'); $('#view-race').appendChild(det); box.innerHTML = '';
  if (!RACES.length) { box.innerHTML = '<p class="hint">Tracés indisponibles (données non chargées).</p>'; return; }
  const cat = S.raceCat || 'all';
  const fb = $('#race-filter'); fb.innerHTML = '';
  for (const [k, lab] of RACE_CATS) { const n = k === 'all' ? RACES.length : RACES.filter(r => (r.cat === 'semi' ? 'long' : r.cat === 'trail' ? 'bois' : r.cat) === k).length; if (!n) continue;
    const c = document.createElement('button'); c.type = 'button'; c.textContent = `${lab} · ${n}`; c.setAttribute('aria-pressed', cat === k); c.onclick = () => { S.raceCat = k; renderRaces(); }; fb.appendChild(c); }
  const group = r => r.cat === 'semi' ? 'long' : r.cat === 'trail' ? 'bois' : r.cat;
  const list = RACES.filter(r => cat === 'all' || group(r) === cat || r === S.race);
  for (const race of list) {
    const st = raceStats(race);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'race'; b.setAttribute('aria-pressed', S.race === race);
    b.innerHTML = '<span class="k lbl"></span><span class="t"></span><span class="s"></span>';
    b.querySelector('.k').textContent = { long: 'Longue distance', semi: 'Semi-marathon', bois: 'Bois', trail: 'Trail', '10': '10 km' }[race.cat] || '';
    b.querySelector('.t').textContent = race.name;
    b.querySelector('.s').textContent = `${fmt(race.official, race.official % 1 ? 1 : 0)} km · ${Math.round(st.up)} m D+`;
    b.onclick = () => { S.race = race; showRace(race); renderRaces(); track('course', race.name); if (MOB.matches) { const c = $('.race[aria-pressed="true"]'); if (c) $('#view-race').scrollTop += c.getBoundingClientRect().top - $('#view-race').getBoundingClientRect().top - 8; } };
    box.appendChild(b);
    if (S.race === race) box.appendChild(det); // the detail opens right under the chosen race
  }
}
function showRace(race, from, to) {
  const full = raceStats(race), L = full.len;
  from = Math.max(0, Math.min(from || 0, L / 1000)); to = to ? Math.min(to, L / 1000) : L / 1000; if (to - from < 0.5) { from = 0; to = L / 1000; }
  S.raceFrom = from; S.raceTo = to;
  let st = full;
  if (from > 0.01 || to < L / 1000 - 0.01) {
    const sel = []; let acc = 0; let start = null;
    if (!race.geom) for (const [e, fa] of full.edges) { const mid = acc + G.LEN[e] / 2; if (mid >= from * 1000 && mid <= to * 1000) { if (start == null) start = fa ? G.ea[e] : G.eb[e]; sel.push([e, fa]); } acc += G.LEN[e]; }
    if (sel.length) { st = E.statsOf(sel, start); st.kind = 'course'; }
  }
  if (race.geom && (from > 0.01 || to < L / 1000 - 0.01)) st = geomRoute(sliceGeom(race._xy, from * 1000, to * 1000));
  E.sightsOn(st, SIGHTS);
  S.route = st; S.alts = [st]; S.lastTarget = st.len; S.lastD = null; S.baseNotes = [];
  $('#race-detail').hidden = false; $('#foot-res').hidden = false;
  $('#race-desc').textContent = `${race.desc} Tracé de ${fmt(full.len / 1000)} km pour ${fmt(race.official, race.official % 1 ? 1 : 0)} km de référence. Les conditions réelles (fermetures de voies, tunnels) peuvent différer.`;
  $('#p-from').value = Math.round(from * 10) / 10; $('#p-to').value = Math.round(to * 10) / 10; $('#p-to').max = $('#p-from').max = (Math.round(L / 100) / 10);
  const chips = $('#portion-chips'); chips.innerHTML = '';
  const Lk = L / 1000, opts = [['En entier', 0, Lk], ['5 premiers km', 0, 5], ['10 premiers km', 0, 10], ['5 derniers km', Lk - 5, Lk], ['La moitié', 0, Lk / 2]];
  // steepest 3 km window
  let best = null; const P = full.prof; for (let i = 0; i < P.length; i++) { let up = 0; for (let j = i + 1; j < P.length && P[j][0] - P[i][0] <= 3000; j++) up += Math.max(0, P[j][1] - P[j - 1][1]); if (!best || up > best[1]) best = [P[i][0], up]; }
  if (best && Lk > 6) opts.push(['3 km les plus vallonnés', best[0] / 1000, best[0] / 1000 + 3]);
  for (const [lab, a, b] of opts) { if (b > Lk + 0.01 || a < 0) continue; const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = lab; btn.setAttribute('aria-pressed', Math.abs(a - from) < 0.05 && Math.abs(b - to) < 0.05); btn.onclick = () => showRace(race, a, b); chips.appendChild(btn); }
  const slot = $('#race-slot'); slot.appendChild($('#notes')); slot.appendChild($('#detail'));
  showRoute(st, from > 0.01 || to < Lk - 0.01 ? [`Portion du km ${fmt(from)} au km ${fmt(to)} : ${fmt(st.len / 1000)} km.`] : []);
  $('#st-km-d').textContent = from > 0.01 || to < Lk - 0.01 ? 'portion' : `référence ${fmt(race.official, race.official % 1 ? 1 : 0)}`; $('#st-km-d').className = 'delta';
  $('#st-sig').textContent = '—'; $('#st-sig').title = 'Course : routes fermées à la circulation';
  drawProfile(st);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of routePts(st)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  fit([x0, y0, x1, y1]); draw(); scrollToMap();
}
$('#p-apply').onclick = () => { if (S.race) showRace(S.race, parseFloat(String($('#p-from').value).replace(',', '.')) || 0, parseFloat(String($('#p-to').value).replace(',', '.')) || 0); };

// summary of the settings used for the results on screen
function renderSummary() {
  const kf = v => fmt(v, v % 1 ? 1 : 0); const kmTxt = S.unit === 'min' ? `${$('#dur').value} min (${fmt(S.lastKm || 0)} km)` : `${kf(S.lastKm || parseFloat($('#km').value) || 0)} km`;
  const where = !S.start ? '—' : /^Chez moi/.test(S.start.name) ? 'Chez moi' : S.start.name.replace(/^Point sur la carte · /, '');
  const mode = (S.kind === 'green' ? 'Vert · ' : S.kind === 'discover' ? 'Découverte · ' : '') + (S.mode === 'loop' ? 'Boucle' : S.endFree ? 'Aller simple' : `Jusqu'à ${S.end ? S.end.name : 'B'}`);
  $('#sum-t').textContent = `${mode} · ${kmTxt} · ${where}`;
  const d = S.dmode === 'flat' ? 'Plat' : S.dmode === 'target' ? `Vallonné (D+ ${$('#dplus').value} m)` : 'Dénivelé normal';
  const f = ['feux ignorés', 'feux limités', 'feux évités au max'][S.sig];
  const n = S.exclQ.size ? `${S.exclQ.size} quartier${S.exclQ.size > 1 ? 's' : ''} évité${S.exclQ.size > 1 ? 's' : ''}` : '';
  const pl = S.places.length ? `${S.places.length} lieu${S.places.length > 1 ? 'x' : ''} évité${S.places.length > 1 ? 's' : ''}` : '';
  $('#sum-s').textContent = [d, f, $('#prefer-paths').checked ? 'parcs et quais' : '', n, pl, $('#allow-repeat').checked ? 'allers-retours permis' : '', S.vias.length ? 'par ' + S.vias.map(v => v.name.replace(/^Point · /, '')).join(', ') : '', S.mode === 'ab' && S.endFree && $('#end-metro').checked && !S.vias.length && S.kind !== 'discover' ? 'arrivée à un métro' : '', $('#water-on').checked ? 'points d’eau' : '', S.depNow === false && S.lastDep ? 'départ ' + hhmm(S.lastDep.dep) : ''].filter(Boolean).join(' · ');
}
new ResizeObserver(resize).observe(cv);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });



// ---------- generate ----------
let busy = false;
// ---------- input validation ----------
function readKm() {
  if (S.unit === 'min') {
    const v = parseFloat(String($('#dur').value).trim().replace(',', '.'));
    if (!isFinite(v) || v <= 0) return { err: 'Indique une durée en minutes (par exemple 45).' };
    const km = Math.round(v * 60 / pace() * 10) / 10;
    if (km < 1) return { km: 1, info: `${fmt(v, 0)} min à ton allure font moins de 1 km : le parcours est calculé pour 1 km.` };
    if (km > 42) return { km: 42, info: `${fmt(v, 0)} min à ton allure dépassent 42 km (un marathon) : le parcours est calculé pour 42 km.` };
    return { km };
  }
  const raw = String($('#km').value).trim().replace(',', '.');
  const v = parseFloat(raw);
  if (!raw || !isFinite(v) || v <= 0) return { err: 'Indique une distance en kilomètres, entre 1 et 42 km.' };
  if (v < 1) return { km: 1, info: 'Distance minimale : 1 km. Le parcours est calculé pour 1 km.' };
  if (v > 42) return { km: 42, info: `Distance maximale : 42 km (un marathon). Le parcours est calculé pour 42 km au lieu de ${fmt(v, 0)}.` };
  return { km: v };
}
function parsePace(str) {
  const m = /^\s*(\d{1,2})\s*(?:[:'’.,h]\s*(\d{1,2}))?\s*(?:"|min)?\s*$/.exec(str || '');
  if (!m) return null; const min = +m[1], sec = +(m[2] || 0);
  if (sec >= 60 || min < 2 || min > 15) return null;
  return min * 60 + sec;
}
function pace() { return parsePace($('#pace').value) || 330; }
function readDplus() {
  const raw = String($('#dplus').value).trim().replace(',', '.'); const v = parseFloat(raw);
  if (!raw || !isFinite(v) || v < 0) return { err: 'Indique un D+ visé en mètres (0 ou plus).' };
  if (v > 600) return { dplus: 600, info: 'D+ visé limité à 600 m.' };
  return { dplus: Math.round(v) };
}

// ---------- generate ----------
function fail(msgs) { S.route = null; S.alts = []; renderAlts(); renderSummary(); showRoute(null, msgs); showView('res'); draw(); }
async function generate(isAgain) {
  if (!G || busy) return;
  const notes = [], errs = [];
  if (!S.start) { showView('set'); openStart(true); toast('Choisis d’abord ton départ : un lieu, une rue ou un point sur la carte.'); return; }
  const k = readKm(); if (k.err) { fail([{ t: k.err, err: true }]); return; }
  if (k.info) notes.push(k.info);
  const km = k.km, target = km * 1000;
  if (!parsePace($('#pace').value)) notes.push('Allure non reconnue (exemple : 5:30) : le temps est estimé à 5:30 /km.');
  let dplus = null;
  if (S.dmode === 'target') { const d = readDplus(); if (d.err) { fail([{ t: d.err, err: true }]); return; } if (d.info) notes.push(d.info); dplus = d.dplus; }
  if (S.mode === 'ab' && !S.endFree && !S.end) { showView('set'); $('#end-q').focus(); toast('Choisis d’abord ton arrivée, ou « N’importe où ».'); return; }
  if (S.exclQ.size >= M.quartiers.length) { fail([{ t: 'Tu as exclu toute la carte. Réautorise au moins un arrondissement, un quartier ou une commune.', err: true }]); return; }

  busy = true; $('#gen').disabled = true; $('#again').disabled = true; $('#recalc').disabled = true; $('#gen').textContent = 'Calcul en cours…'; $('#again').textContent = 'Calcul en cours…';
  const bar = $('#bar'); bar.style.width = '5%';
  let r = null;
  try {
    await new Promise(res => setTimeout(res, 20));
    const dep = departure(), runMin = Math.round(km * pace() / 60), closed = PARKS.length ? closedParks(dep, runMin) : [];
    S.lastDep = { dep, closed, now: S.depNow !== false, night: runInDark(dep, runMin), sun: sunTimes(dep) };
    E.setConstraints(S.exclQ, S.places, { avoidCemeteries: $('#avoid-cem').checked, closedEdges: closed.flatMap(p => p.e) });
    const tpk = dplus != null ? dplus / km : 0, nat = 5; // ~5 m of D+ per km on an average Paris loop (smoothed D+)
    const climb = S.dmode === 'flat' ? 30 : dplus == null ? 0 : tpk > nat ? -Math.min(30, 4 + (tpk - nat) * 3) : (nat - tpk) * 2;
    const allowRepeat = $('#allow-repeat').checked;
    const green = S.kind === 'green';
    E.setWeights({ climb, sig: [0, 150, 450][S.sig], path: $('#prefer-paths').checked || green ? -0.3 : 0, reuse: allowRepeat ? 1 : 4, green: green ? 0.7 : 0, road: green ? [0, 0.3, 0.6, 0.9] : [0, 0.15, 0.35, 0.6] , dark: S.lastDep.night ? 2.5 : 0 });
    const opt = { seed: S.seed * 7919 + 13, sigScore: [0, 0.5, 1.5][S.sig], dplus, flat: S.dmode === 'flat', hill: dplus != null && tpk > nat, allowRepeat, green };
    opt.night = S.lastDep.night;
    if ($('#water-on').checked && FONT.length) { // street nodes right next to a fountain (allowed zones only)
      const set = new Set(), pts = []; for (const f of FONT) { const n = E.nearest(f.x, f.y); if (n >= 0 && Math.hypot(G.NX[n] - f.x, G.NY[n] - f.y) <= 30 && !set.has(n)) { set.add(n); pts.push({ n, x: G.NX[n], y: G.NY[n] }); } }
      opt.water = { set, pts, every: 3000 };
    }
    const ab = S.mode === 'ab', A = ab ? 'A' : 'le départ';
    const [sx, sy] = E.toXY(S.start.lat, S.start.lon);
    const s = E.nearest(sx, sy);
    if (s < 0) errs.push(`Aucune rue accessible autour de ${A} avec ces exclusions. Réautorise un quartier proche ou retire un lieu évité.`);
    else {
      const snapD = Math.hypot(G.NX[s] - sx, G.NY[s] - sy);
      if (snapD > 250) notes.push(`${ab ? 'A est' : 'Ton départ est'} dans une zone évitée : le parcours part de la rue autorisée la plus proche (${Math.round(snapD)} m).`);
      const prog = f => bar.style.width = (5 + f * 95) + '%';
      // places to pass by, or discovery of famous places
      let endN = null;
      if (ab && !S.endFree) {
        const [ex, ey] = E.toXY(S.end.lat, S.end.lon); endN = E.nearest(ex, ey);
        if (endN < 0) errs.push('Aucune rue accessible autour de l’arrivée avec ces exclusions.');
        else if (endN === s || Math.hypot(ex - sx, ey - sy) < 30) errs.push('Le départ et l’arrivée sont au même endroit. Choisis « Retour au départ » ou « N’importe où ».');
      }
      const endArg = !ab ? s : S.endFree ? 'free' : endN;
      if (errs.length) { /* reported below */ }
      else if (S.vias.length) {
        const vn = [];
        for (const v of S.vias) { const [vx, vy] = E.toXY(v.lat, v.lon); const n = E.nearest(vx, vy); if (n < 0 || Math.hypot(G.NX[n] - vx, G.NY[n] - vy) > 400) { errs.push(`« ${v.name} » est dans une zone évitée ou inaccessible : retire-le ou réautorise sa zone.`); } else vn.push(n); }
        if (!errs.length) {
          r = await E.viaRoute(s, vn, endArg, target, opt, prog);
          if (!r) errs.push('Impossible de passer par ces lieux sans traverser une zone évitée. Retire un lieu ou réautorise un quartier.');
          else if (r.shortest) notes.push(`Passer par ces lieux fait déjà ${fmt(r.len / 1000)} km : c'est le parcours le plus court qui est proposé.`);
        }
      } else if (S.kind === 'discover') {
        r = await E.discover(s, endArg, target, SIGHTS.map(x => Object.assign({}, x)), opt, prog);
        if (!r) errs.push('Aucun lieu connu assez proche pour cette distance. Allonge la distance, change de départ ou ajoute toi-même des lieux par où passer.');
        else if (!(r.sightsN > 0)) notes.push('Peu de lieux connus à portée : ce parcours en croise peu. Allonge la distance ou pars plus près du centre.');
      } else if (!ab) {
        r = await E.loop(s, target, opt, prog);
        if (!r) errs.push("Aucune boucle trouvée avec ces réglages : les zones évitées isolent le départ. Réautorise un quartier ou change la distance.");
      } else if (S.endFree) {
        if ($('#end-metro').checked && METRO.st.length) { // finish at a station: their nearest allowed street node
          opt.endNodes = []; for (const st of METRO.st) { const n = E.nearest(st.x, st.y); if (n >= 0 && Math.hypot(G.NX[n] - st.x, G.NY[n] - st.y) < 120) opt.endNodes.push({ n, x: st.x, y: st.y }); }
        }
        r = await E.oneWay(s, target, opt, prog);
        if (!r) errs.push("Aucun aller simple trouvé depuis A avec ces réglages. Réautorise un quartier ou change la distance.");
      } else {
        const [ex, ey] = E.toXY(S.end.lat, S.end.lon); const t = endN;
        {
          const snapB = Math.hypot(G.NX[t] - ex, G.NY[t] - ey);
          if (snapB > 250) notes.push(`B est dans une zone évitée : l'arrivée est déplacée à la rue autorisée la plus proche (${Math.round(snapB)} m).`);
          r = await E.aToB(s, t, target, opt, prog);
          if (!r) errs.push("Impossible de relier A et B sans traverser une zone évitée. Réautorise un quartier entre les deux.");
          else if (r.shortest && r.len > target * 1.03) notes.push(`Le plus court chemin de A à B fait déjà ${fmt(r.len / 1000)} km : c'est lui qui est proposé.`);
        }
      }
      if (r && r.alts && r.alts.length === 1 && !r.shortest) notes.push('Une seule proposition trouvée avec ces réglages.');
    }
  } catch (e) {
    console.error(e); r = null; errs.push('Le calcul a échoué de façon inattendue. Réessaie ; si ça se reproduit, change un réglage.');
  } finally {
    bar.style.width = '100%'; setTimeout(() => bar.style.width = '0', 300);
    busy = false; $('#gen').disabled = false; $('#again').disabled = false; $('#recalc').disabled = false; $('#gen').textContent = 'Générer 3 parcours'; $('#again').textContent = '↻ Voir 3 autres parcours';
  }
  S.lastKm = km; $('#stale').hidden = true;
  if (r && r.alts) for (const a of r.alts) E.sightsOn(a, SIGHTS);
  if (r) track(isAgain ? 'autres' : 'generer', (S.mode === 'loop' ? 'Boucle' : S.endFree ? 'Aller simple' : 'A-B') + ' ' + Math.round(target / 1000) + ' km' + (S.depNow === false ? ' (heure choisie)' : ''));
  if (r && !errs.length) {
    S.alts = r.alts || [r]; S.baseNotes = notes; S.lastTarget = target; S.lastD = dplus;
    renderSummary(); showView('res'); selectAlt(0);
    if (!isAgain) fitRoute();
  } else { S.route = null; S.alts = []; renderAlts(); renderSummary(); showRoute(null, errs.map(t => ({ t, err: true })).concat(notes)); showView('res'); }
  draw();
}
function hillHint() {
  const hills = [['Montmartre', 18], ['Belleville', 20], ['les Buttes-Chaumont', 19], ['Ménilmontant', 20], ['la Butte-aux-Cailles', 13]];
  const ok = hills.filter(([, a]) => M.quartiers.filter(q => q.ar === a).some(q => !S.exclQ.has(q.id)));
  if (!ok.length) return 'Les buttes de Paris sont dans tes zones évitées : réautorise le 18e, 19e ou 20e pour grimper plus.';
  const names = ok.slice(0, 3).map(([n, a]) => `${n} (${a}e)`);
  return 'Pour grimper plus, pars vers ' + (names.length > 1 ? names.slice(0, -1).join(', ') + ' ou ' + names[names.length - 1] : names[0]) + '.';
}
function routeNotes(r) {
  const notes = [], km = S.lastKm, target = S.lastTarget, dplus = S.lastD;
  if (Math.abs(r.len - target) / target > 0.05 && !r.shortest) notes.push(`Distance la plus proche trouvée : ${fmt(r.len / 1000)} km pour ${fmt(km)} demandés. Les exclusions limitent les rues disponibles.`);
  if (dplus != null && r.up < dplus * 0.8) notes.push(`D+ maximum trouvé ici : ${Math.round(r.up)} m pour ${dplus} m visés. ${hillHint()}`);
  if (r.kind === 'aller-retour') notes.push('Aller-retour : tu reviens par le même chemin.');
  if (r.cemLen > 50) notes.push(`Le parcours traverse un cimetière sur ${Math.round(r.cemLen)} m : horaires d'ouverture limités et lieu de recueillement.`);
  const ld = S.lastDep;
  if (ld && ld.closed.length && S.tab !== 'race') { // closed parks the route goes around
    const P = routePts(r); const near = ld.closed.filter(p => P.some(([x, y], i) => i % 6 === 0 && Math.abs(x - p.c[0]) < 350 && Math.abs(y - p.c[1]) < 350)).sort((a, b) => b.e.length - a.e.length);
    if (near.length) notes.push(`Fermé${near.length > 1 ? 's' : ''} à l'heure de ta sortie (départ ${hhmm(ld.dep)}), donc contourné${near.length > 1 ? 's' : ''} : ${near.slice(0, 3).map(p => p.n).join(', ')}${near.length > 3 ? '…' : '.'}`);
  }
  if (ld && ld.night && S.tab !== 'race' && r.lit != null) {
    const pct = Math.round(r.lit * 100);
    notes.push(`Sortie de nuit (coucher du soleil à ${hhmm(ld.sun.set)}) : le parcours privilégie les rues éclairées, ${pct} % du trajet l'est.${pct < 85 ? ' Des passages restent sombres (allées de parc ou de bois, berges) : prends une lampe frontale.' : ''}`);
  }
  return notes;
}
const KIND = { 'boucle': 'Boucle', 'aller-retour': 'Aller-retour', 'aller-simple': 'Aller simple', 'a-b': 'A → B' };
function shortStreet(n) { return n.replace(/^(Rue|Boulevard|Avenue)\s+((de la|de l'|de l’|du|des|de|d'|d’)\s*)?/i, '').replace(/^./, c => c.toUpperCase()); }
function altNames(a) { return [...a.names].sort((x, y) => y[1] - x[1]).slice(0, 2).map(([i]) => shortStreet(M.names[i] || '')).filter(Boolean).join(' · ') || (KIND[a.kind] || 'Parcours'); }
function altLabels(alts) {
  const L = new Array(alts.length).fill(null);
  if (alts.length < 2) return [alts.length ? 'Recommandé' : ''];
  const crit = [
    ...(S.kind === 'green' ? [['Le plus vert', a => a.green, -1, 0.04]] : []),
    ...(S.kind === 'discover' || S.vias.length ? [['Le plus de lieux connus', a => a.sightsN || 0, -1, 1]] : []),
    ['Le moins de feux', a => a.feux, 1, 2],
    ['Le plus plat', a => a.up, 1, 8],
    ['Le plus vallonné', a => a.up, -1, 8],
    ['Le plus proche de la distance', a => Math.abs(a.len - S.lastTarget), 1, 150],
  ];
  for (const [name, f, sgn, gap] of crit) {
    const order = alts.map((a, i) => i).sort((i, j) => sgn * (f(alts[i]) - f(alts[j])));
    const best = order[0], second = order[1];
    if (L[best] || Math.abs(f(alts[best]) - f(alts[second])) < gap) continue;
    L[best] = name;
  }
  return L.map((l, i) => l || (i === 0 ? 'Recommandé' : 'Autre itinéraire'));
}
function renderAlts() {
  const box = $('#alts'); box.innerHTML = '';
  const n = S.alts ? S.alts.length : 0;
  $('#alts-h').hidden = !n; $('#alts-h').textContent = n > 1 ? `${n} parcours trouvés` : '1 parcours trouvé';
  if (!n) return;
  const labels = altLabels(S.alts);
  S.alts.forEach((a, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'alt'; b.setAttribute('aria-pressed', a === S.route);
    b.innerHTML = `<span class="k"></span><span class="t"></span><span class="s"></span><span class="v"></span>`;
    b.querySelector('.k').textContent = `${String(i + 1).padStart(2, '0')} · ${labels[i]}${a.kind === 'aller-retour' ? ' · aller-retour' : ''}`;
    b.querySelector('.t').textContent = altNames(a);
    b.querySelector('.s').textContent = `${fmt(a.len / 1000)} km · ${Math.round(a.up)} m D+ · ${a.feux} feux · ${fmtDur(a.len / 1000 * pace())}` + (S.kind === 'green' ? ` · ${Math.round(a.green * 100)} % vert` : '');
    const vv = b.querySelector('.v'); vv.textContent = a.sightsN ? 'Passe par ' + a.sights.slice(0, 4).join(', ') + (a.sightsN > 4 ? '…' : '') : ''; vv.hidden = !a.sightsN;
    b.onclick = () => selectAlt(i);
    box.appendChild(b);
  });
}
function selectAlt(i) {
  const r = S.alts[i]; if (!r) return;
  S.route = r; renderAlts(); showRoute(r, S.baseNotes.concat(routeNotes(r))); draw();
}
function fitRoute(onlyStart) {
  if (onlyStart || !S.route) { if (S.start) { const [x, y] = E.toXY(S.start.lat, S.start.lon); zoomAt(0, 0, V.s); V.s = Math.max(V.s, 0.12); V.tx = W / 2 - x * V.s; V.ty = (H - sheetPx()) / 2 - y * V.s; draw(); } else fit(); return; }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const a of (S.alts && S.alts.length ? S.alts : [S.route])) for (const v of a.nodes) { x0 = Math.min(x0, G.NX[v]); x1 = Math.max(x1, G.NX[v]); y0 = Math.min(y0, G.NY[v]); y1 = Math.max(y1, G.NY[v]); }
  fit([x0, y0, x1, y1]);
}
function showRoute(r, notes) {
  const n = $('#notes'); n.innerHTML = ''; for (const x of notes) { const d = document.createElement('div'); d.className = 'note' + (x && x.err ? ' err' : x && x.info ? ' info' : ''); d.setAttribute('role', x && x.err ? 'alert' : 'status'); d.textContent = typeof x === 'string' ? x : x.t; n.appendChild(d); }
  $('#detail').hidden = !r;
  if (!r) { ['#st-km', '#st-up', '#st-sig', '#st-time'].forEach(s => $(s).textContent = '–'); $('#via').textContent = ''; drawProfile(null); return; }
  $('#st-km').innerHTML = `${fmt(r.len / 1000, 1)}<small>km</small>`;
  $('#st-up').innerHTML = `${Math.round(r.up)}<small>m</small>`;
  $('#st-sig').textContent = r.feux;
  const sec = r.len / 1000 * pace(); const h = Math.floor(sec / 3600), m = Math.round(sec % 3600 / 60);
  $('#st-time').innerHTML = h ? `${h}<small>h</small>${String(m).padStart(2, '0')}` : `${m}<small>min</small>`;
  $('#st-km-d').textContent = '';
  const dk = (r.len - S.lastTarget) / S.lastTarget * 100;
  const kd = $('#st-km-d'); kd.textContent = `${dk >= 0 ? '+' : ''}${fmt(dk, 1)} %`; kd.className = 'delta ' + (Math.abs(dk) <= 5 ? 'ok' : 'off');
  const ud = $('#st-up-d'); if (S.lastD != null) { ud.textContent = `visé ${S.lastD}`; ud.className = 'delta ' + (Math.abs(r.up - S.lastD) <= Math.max(20, S.lastD * .2) ? 'ok' : 'off'); } else ud.textContent = '';
  const top = [...r.names].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([i]) => M.names[i]);
  const arrs = [...new Set([...r.quart.keys()].map(q => M.quartiers[q - 1]?.ar).filter(Boolean))].sort((a, b) => a - b);
  $('#via').innerHTML = ''; const sp = document.createElement('span');
  sp.innerHTML = `Par <strong></strong> · ${arrs.map(a => a > 100 ? M.quartiers.find(q => q.ar === a).name : a === 1 ? '1er' : a + 'e').join(', ')}`; sp.querySelector('strong').textContent = top.join(', ');
  if (r.green != null && G.GR) sp.appendChild(document.createTextNode(` · ${Math.round(r.green * 100)} % du parcours au vert (parcs, rues arborées)`));
  if (r.sightsN) sp.appendChild(document.createTextNode(` · Lieux : ${r.sights.join(', ')}`));
  if (r.lit != null && S.lastDep && S.lastDep.night && S.tab !== 'race') sp.appendChild(document.createTextNode(` · ${Math.round(r.lit * 100)} % éclairé`));
  const rt = routeTrees(r); if (rt) sp.appendChild(document.createTextNode(` · ${rt.length.toLocaleString('fr-FR')} arbres le long du parcours`));
  $('#via').appendChild(sp);
  // drinking water along the way
  const rf = routeFountains(r);
  if (rf) { const box = document.createElement('div'); box.className = 'water-box';
    const l = document.createElement('span'); l.className = 'lbl'; l.textContent = 'Points d’eau'; box.appendChild(l);
    const t = document.createElement('span');
    if (!rf.list.length) t.textContent = 'Aucune fontaine à moins de 30 m du parcours : pense à emporter de l’eau.';
    else { t.innerHTML = `<strong></strong> · km ${rf.stops.slice(0, 10).map(a => fmt(a / 1000)).join(' · ')}${rf.stops.length > 10 ? '…' : ''}`; t.querySelector('strong').textContent = `${rf.list.length} fontaine${rf.list.length > 1 ? 's' : ''}, ${rf.stops.length} point${rf.stops.length > 1 ? 's' : ''} d’eau`;
      if (r.len > 4000) { const g = document.createElement('small'); g.textContent = `Plus long passage sans eau : ${fmt(rf.gap / 1000)} km. Certaines fontaines sont coupées en hiver.`; t.appendChild(g); } }
    box.appendChild(t); $('#via').appendChild(box); }
  // one-way routes: nearest metro / RER at the arrival, to get back home
  const P = routePts(r), a = P[0], b = P[P.length - 1]; r._metroEnd = null;
  if (METRO.st.length && Math.hypot(b[0] - a[0], b[1] - a[1]) > 300) {
    const ns = nearestStation(b[0], b[1]); r._metroEnd = ns;
    const box = document.createElement('div'); box.className = 'metro-end';
    const l = document.createElement('span'); l.className = 'lbl'; l.textContent = 'Pour rentrer'; box.appendChild(l);
    const t = document.createElement('span'); const d = Math.round(ns.d * 1.25 / 10) * 10; // walking ≈ 1.25 × straight line
    t.innerHTML = `<strong></strong> à ${d < 30 ? 'l’arrivée' : '~' + d + ' m à pied'}`; t.querySelector('strong').textContent = (ns.d > 1500 ? 'Pas de station proche · la plus proche : ' : ns.s.ls.every(x => x.startsWith('RER')) ? 'RER ' : 'Métro ') + ns.s.n;
    box.appendChild(t); for (const ln of ns.s.ls) box.appendChild(lineBadge(ln));
    $('#via').appendChild(box);
  }
  drawProfile(r);
}

// ---------- profile ----------
function drawProfile(r) {
  const c = $('#prof'), b = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  if (!b.width) return;
  c.width = Math.round(b.width * d); c.height = Math.round(b.height * d);
  const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, b.width, b.height);
  if (!r) return;
  const P = r.prof, L = r.len; let zmin = Infinity, zmax = -Infinity; for (const [, z] of P) { zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
  const lo = Math.floor((zmin - 3) / 10) * 10, hi = Math.max(lo + 30, Math.ceil((zmax + 3) / 10) * 10);
  const padL = 42, padB = 16, w = b.width - padL - 4, h = b.height - padB - 6;
  const X = s => padL + s / L * w, Y = z => 6 + (1 - (z - lo) / (hi - lo)) * h;
  x.font = `600 11.5px ${css('--f-mono')}`; x.fillStyle = css('--muted'); x.strokeStyle = css('--line'); x.lineWidth = 1; x.textBaseline = 'middle'; x.textAlign = 'right';
  for (const z of [lo, Math.round((lo + hi) / 2), hi]) { x.beginPath(); x.moveTo(padL, Y(z)); x.lineTo(padL + w, Y(z)); x.stroke(); x.fillText(z + ' m', padL - 4, Y(z)); }
  x.textAlign = 'center'; x.textBaseline = 'top';
  const stepKm = L > 15000 ? 5 : L > 6000 ? 2 : 1;
  for (let k = 0; k * 1000 <= L; k += stepKm) x.fillText(k + ' km', Math.min(X(k * 1000), padL + w - 14), 6 + h + 3);
  const col = css('--route');
  x.beginPath(); x.moveTo(X(0), Y(lo)); for (const [s, z] of P) x.lineTo(X(s), Y(z)); x.lineTo(X(L), Y(lo)); x.closePath();
  x.globalAlpha = .18; x.fillStyle = col; x.fill(); x.globalAlpha = 1;
  x.beginPath(); P.forEach(([s, z], i) => i ? x.lineTo(X(s), Y(z)) : x.moveTo(X(s), Y(z))); x.strokeStyle = col; x.lineWidth = 1.8; x.stroke();
  // highest point
  let im = 0; P.forEach((p, i) => { if (p[1] > P[im][1]) im = i; });
  x.beginPath(); x.arc(X(P[im][0]), Y(P[im][1]), 3.5, 0, 7); x.fillStyle = col; x.fill();
}
window.addEventListener('resize', () => S.route && drawProfile(S.route));

// ---------- GPX ----------
function gpx() {
  const r = S.route; if (!r) return null;
  const pts = routePts(r);
  const esc = s => s.replace(/[<&>]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c]));
  const name = S.tab === 'race' && S.race ? `${S.race.name} – RunParis, km ${fmt(S.raceFrom)} à ${fmt(S.raceTo)}` : `RunParis ${fmt(r.len / 1000)} km – départ ${S.start.name}`;
  const body = pts.map(([x, y]) => { const [la, lo] = E.toLL(x, y); return `<trkpt lat="${la.toFixed(6)}" lon="${lo.toFixed(6)}"></trkpt>`; }).join('\n      ');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="RunParis" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${esc(name)}</name></metadata>\n  <trk><name>${esc(name)}</name><type>running</type><trkseg>\n      ${body}\n  </trkseg></trk>\n</gpx>\n`;
}
$('#gpx').onclick = async () => {
  const g = gpx(); if (!g) return toast("Génère d'abord un parcours.");
  try {
    const fn = `runparis-${Math.round(S.route.len / 100) / 10}km`; track('gpx', S.tab === 'race' && S.race ? 'GPX parcours mythique ' + S.race.name : 'GPX parcours');
    if (!window.claude) { // public site: a real .gpx file
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([g], { type: 'application/gpx+xml' })); a.download = fn + '.gpx';
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return toast('GPX téléchargé : importe-le dans ta montre ou Strava.', 4000);
    }
    const dl = await window.claude.use('downloads');
    if (!dl) return toast('Export indisponible ici : utilise « Copier ».');
    await dl.save({ filename: fn + '.gpx.txt', data: g });
    toast('GPX enregistré : renomme-le en .gpx pour ta montre ou Strava.', 4500);
  } catch (e) { if (e && e.code === 'declined') return; toast('Export impossible ici : utilise « Copier ».'); }
};
$('#copy').onclick = async () => {
  const g = gpx(); if (!g) return toast("Génère d'abord un parcours.");
  try { await navigator.clipboard.writeText(g); toast('GPX copié : colle-le dans un fichier .gpx.'); track('copier', 'Copier GPX'); } catch { toast('Copie refusée par le navigateur.'); }
};

// ---------- audience (public site only): GoatCounter, anonymous, no cookie ----------
const GC = 'runparis'; // code du compte GoatCounter (https://runparis.goatcounter.com)
const PUBLIC = !window.claude && (/netlify\.app$|runparis/i.test(location.hostname) || /[?&]test-public\b/.test(location.search));
const STATS = PUBLIC && location.hostname === 'runparis.netlify.app'; // pas de stats sur staging ni en local
if (STATS) { const sc = document.createElement('script'); sc.async = true; sc.src = 'https://gc.zgo.at/count.js'; sc.dataset.goatcounter = `https://${GC}.goatcounter.com/count`; document.head.appendChild(sc); }
function track(ev, title) { try { if (STATS && window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: 'evt-' + ev, title: title || ev, event: true }); } catch (e) {} }
// ---------- feedback (Netlify Forms) ----------
if (PUBLIC) $('#fb-open').hidden = false;
$('#fb-open').onclick = () => { $('#fb-err').hidden = true; $('#fb-route').checked = !!S.route; $('#fb-route').disabled = !S.route; $('#fb').showModal(); $('#fb-msg').focus(); };
$('#fb-cancel').onclick = () => $('#fb').close();
function routeContext() {
  if (!S.route) return '';
  const P = routePts(S.route), step = Math.max(1, Math.floor(P.length / 40));
  const pts = P.filter((p, i) => i % step === 0 || i === P.length - 1).map(([x, y]) => E.toLL(x, y).map(v => v.toFixed(5)).join(',')).join(' ');
  const head = S.tab === 'race' && S.race ? `Course : ${S.race.name}, km ${fmt(S.raceFrom)} à ${fmt(S.raceTo)}` : `${$('#sum-t').textContent} | ${$('#sum-s').textContent}`;
  return `${head} | ${fmt(S.route.len / 1000)} km | points : ${pts}`;
}
$('#fb-form').onsubmit = async ev => {
  ev.preventDefault(); const msg = $('#fb-msg').value.trim(); if (!msg) { $('#fb-err').textContent = 'Écris un message.'; $('#fb-err').hidden = false; return; }
  const body = new URLSearchParams({ 'form-name': 'signalement', type: $('#fb-type').value, message: msg, email: $('#fb-mail').value.trim(), parcours: $('#fb-route').checked ? routeContext() : '', page: location.href });
  $('#fb-send').disabled = true;
  try { const r = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() }); if (!r.ok) throw new Error(r.status);
    $('#fb').close(); $('#fb-msg').value = ''; toast('Merci ! Ton message a bien été envoyé.'); track('signalement', $('#fb-type').value);
  } catch (e) { $('#fb-err').textContent = 'Envoi impossible pour le moment (connexion ?). Réessaie dans un instant.'; $('#fb-err').hidden = false; }
  finally { $('#fb-send').disabled = false; }
};
$('#attrib-more').onclick = () => toast('Rues, arbres, métro, parcs : © contributeurs OpenStreetMap (ODbL). Altitudes : IGN RGE ALTI. Quartiers : Paris Open Data. Parcours mythiques : tracés issus de fichiers GPX publics.', 7000);
// public site: the logo leads back to the welcome page
if (!window.claude && /app\.html$/.test(location.pathname)) { const l = $('.logo'); const a = document.createElement('a'); a.href = './'; a.className = 'logo'; a.setAttribute('aria-label', 'RunParis, accueil'); a.innerHTML = l.innerHTML; l.replaceWith(a); }
boot();
})();
</script>
