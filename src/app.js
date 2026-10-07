<script>
(() => {
const $ = s => document.querySelector(s);
// Fonctions réservées à l'application (D-83) : mode course, Mes parcours, envoi de parcours, « Je l'ai fait » et image à partager.
// Elles ne s'allument que hors production (staging, tests) ; ?web=1 force la version du site pour la recette.
const APPF = location.hostname !== 'runparis.netlify.app' && !/[?&]web=1/.test(location.search);
document.documentElement.classList.toggle('appf', APPF);
// Application iPhone (Capacitor, D-85) : même code, avec les modules du téléphone (position écran verrouillé, partage, écran allumé).
const CAP = window.Capacitor, NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
// sans @capacitor/core (pas de bundler) : on appelle les modules par le pont natif (nativePromise / nativeCallback)
const plug = n => new Proxy({}, { get: (_, m) => (o, cb) => cb ? Promise.resolve(CAP.nativeCallback(n, m, o || {}, cb)) : CAP.nativePromise(n, m, o || {}) });
const NP = NATIVE ? { share: plug('Share'), fs: plug('Filesystem'), awake: plug('KeepAwake'), geo: plug('Geolocation'), bg: plug('BackgroundGeolocation'), sb: plug('StatusBar'), hap: plug('Haptics') } : null;
// écran de lancement animé (D-86) : la boucle se dessine depuis le D, puis le logo ; retiré quand les données sont prêtes (au moins 1,5 s)
const SPLASH_T0 = Date.now();
if (NATIVE) { const sp = document.createElement('div'); sp.id = 'splash'; sp.setAttribute('aria-hidden', 'true');
  sp.innerHTML = '<svg viewBox="0 0 100 100" width="150" height="150"><g class="sp-st"><path d="M-10 22L110 12M-10 84L110 76M18 -10L24 110M86 -10L82 110"/></g><path class="sp-l sp-c" d="M26 33L64 23L76 63L38 75Z" pathLength="140"/><path class="sp-l sp-r" d="M26 33L64 23L76 63L38 75Z" pathLength="140"/><circle class="sp-d" cx="26" cy="33" r="9"/><text class="sp-dt" x="26" y="37" text-anchor="middle">D</text></svg><div class="sp-logo">RUN<span>PARIS</span></div>';
  document.body.appendChild(sp); }
function splashDone() { const sp = document.getElementById('splash'); if (!sp) return; setTimeout(() => { sp.classList.add('out'); setTimeout(() => sp.remove(), 320); }, Math.max(0, 1500 - (Date.now() - SPLASH_T0))); }
// barre d'état : suit le thème de l'app (et l'écran toujours sombre de l'image à partager)
function sbSync() { if (!NATIVE) return; const t = document.documentElement.getAttribute('data-theme'), dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; const shx = document.getElementById('shx');
  NP.sb.setStyle({ style: (dark || (shx && !shx.hidden)) ? 'DARK' : 'LIGHT' }).catch(() => {}); }
if (NATIVE) { new MutationObserver(sbSync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sbSync); }
// vibrations du mode course (D-86) : courtes, jamais en continu
function navBuzz(k) { if (!NATIVE || !NAV.buzz) return; const h = NP.hap; (k === 'off' ? h.impact({ style: 'HEAVY' }).then(() => setTimeout(() => h.impact({ style: 'HEAVY' }), 160)) : k === 'end' ? h.notification({ type: 'SUCCESS' }) : h.impact({ style: 'LIGHT' })).catch(() => {}); }
document.documentElement.classList.toggle('native', NATIVE);
const WEB_APP = 'https://staging--runparis.netlify.app/app.html'; // adresse des liens envoyés depuis l'application
if (NATIVE && NP.geo && navigator.geolocation) navigator.geolocation.getCurrentPosition = (ok, ko, o) => {
  NP.geo.getCurrentPosition({ enableHighAccuracy: !!(o && o.enableHighAccuracy), timeout: (o && o.timeout) || 10000, maximumAge: (o && o.maximumAge) || 0 })
    .then(ok, e => ko && ko({ code: /denied|permission|authoriz/i.test((e && (e.message || e.code)) || '') ? 1 : 2, message: e && e.message }));
};
async function nativeShareFile(name, data, text) {
  const b64 = typeof data === 'string' ? btoa(unescape(encodeURIComponent(data))) : await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(data); });
  const w = await NP.fs.writeFile({ path: name, data: b64, directory: 'CACHE' });
  try { await NP.share.share({ files: [w.uri], text, dialogTitle: name }); } catch (e) { /* partage annulé */ }
}
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
    const [gr, rc, sg, mt, ft, pk, dk, pv] = await Promise.all([fetch('green.txt' + DV).then(r => r.ok ? r.text() : null).catch(() => null), fetch('races.json' + DV).then(r => r.ok ? r.json() : []).catch(() => []), fetch('sights.json' + DV).then(r => r.ok ? r.json() : []).catch(() => []), fetch('metro.json' + DV).then(r => r.ok ? r.json() : null).catch(() => null), fetch('fountains.json' + DV).then(r => r.ok ? r.json() : []).catch(() => []), fetch('parks.json' + DV).then(r => r.ok ? r.json() : []).catch(() => []), fetch('dark.txt' + DV).then(r => r.ok ? r.text() : null).catch(() => null), fetch('private.txt' + DV).then(r => r.ok ? r.text() : null).catch(() => null)]);
    if (mt) { METRO.lines = mt.lines; METRO.st = mt.stations.map(([n, la, lo, ls]) => { const [x, y] = E.toXY(la, lo); return { n, lat: la, lon: lo, ls, x, y }; }); }
    else { $('#ly-metro').disabled = true; $('#end-metro').checked = false; }
    FONT = (ft || []).map(([la, lo, t]) => { const [x, y] = E.toXY(la, lo); return { lat: la, lon: lo, t, x, y }; }); if (!FONT.length) $('#ly-font').disabled = true;
    PARKS = pk || []; if (!PARKS.length) { $('#dep-hint').hidden = true; }
    if (gr) E.setGreen(b64(gr));
    if (pv) E.setPrivate(b64(pv)); // voies privées et impasses fermées : jamais empruntées (D-80)
    if (dk) E.setDark(b64(dk)); else $('#k-green').disabled = true;
    RACES = rc || []; SIGHTS = sg || [];
    for (const x of SIGHTS) { const [px, py] = E.toXY(x.lat, x.lon); x.x = px; x.y = py; const n = E.nearest(px, py); x._n = n >= 0 && Math.hypot(G.NX[n] - px, G.NY[n] - py) < 250 ? n : null; }
  } catch (e) { $('#loading').innerHTML = '<div style="display:flex;flex-direction:column;gap:10px;align-items:center;text-align:center;padding:0 16px">Impossible de charger les données de Paris (connexion interrompue ?).<button class="btn primary" style="flex:none" onclick="location.reload()">Réessayer</button></div>'; return; }
  mApply(); buildSearch(); buildZones(); buildPaths(); fit(); $('#loading').hidden = true; splashDone(); sbSync(); renderAvoid(); renderVias(); renderRaces(); updateConv();
  const home = getHome();
  if (home) setPoint('start', { lat: home.lat, lon: home.lon, name: 'Chez moi · ' + home.name.replace(/^Chez moi · /, '') });
  renderHome();
  // D-68 : on arrive sur les réglages, rien n'est calculé avant que le coureur le demande
  showView('set'); if (/^#cours/.test(location.hash)) setTab('race');
  $('#pos-go').hidden = !navigator.geolocation || !!window.claude;
  $('#run-go').hidden = !navigator.geolocation || !!window.claude;
  if (window.claude || NATIVE) $('#mlinks').hidden = true;
  if (NATIVE) { $('#run-wake').checked = false; $('#run-wake').closest('label').hidden = true; $('#run-buzz-l').hidden = false; } // application : le suivi marche écran verrouillé, plus besoin de garder l'écran allumé (D-86) // pas d'accueil dans l'artifact
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
    const a = G.ea[e], b = G.eb[e], v = G.deg[a + 1] - G.deg[a] >= G.deg[b + 1] - G.deg[b] ? a : b; const [la, lo] = E.toLL(G.NX[v], G.NY[v]); // sur un carrefour de la rue, pas au milieu d'un pâté de maisons
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
  if (MPHR && ((MCUR === 'dep' && which === 'start') || (MCUR === 'arr' && which === 'end'))) mClose(); if (MPHR) msync();
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
  const full = innerHeight - 56;
  // réglages en phrase (D-74) : la feuille s'arrête juste sous la phrase, la carte reste visible
  if (MPHR && S.view === 'set' && S.tab === 'gen' && $('#mset').offsetHeight) { sheetHeights.gen = Math.min(full, peek + $('#mset').offsetHeight + 30); return { peek, half: sheetHeights.gen, full }; }
  // Mythiques et Mes parcours s'ouvrent à la même hauteur que « Créer » : les onglets ne sautent pas
  return { peek, half: S.tab !== 'gen' && sheetHeights.gen ? sheetHeights.gen : Math.max(peek + 170, Math.round(innerHeight * 0.56)), full };
}
function setSheet(st, refit) {
  if (!MOB.matches) { document.documentElement.style.removeProperty('--sheet-h'); return; }
  sheet = st; document.documentElement.style.setProperty('--sheet-h', sheetHeights()[st] + 'px');
  document.documentElement.classList.toggle('sheet-full', st === 'full');
  if (refit) setTimeout(() => { if (S.route) (S.tab === 'race' && S.race ? fit(raceBounds()) : fitRoute()); }, 270);
}
(() => {
  let d = null; const panel = $('.panel');
  const start = e => { if (!MOB.matches || e.pointerType !== 'mouse' || e.target.closest('#theme-btn, a.logo')) return; /* au doigt : geste tactile plus bas (D-75) */ d = { y: e.clientY, h: panel.getBoundingClientRect().height, moved: false }; panel.classList.add('dragging'); e.currentTarget.setPointerCapture(e.pointerId); };
  const move = e => { if (!d) return; const dy = e.clientY - d.y; if (Math.abs(dy) > 4) d.moved = true; const hs = sheetHeights(); document.documentElement.style.setProperty('--sheet-h', Math.max(hs.peek, Math.min(hs.full, d.h - dy)) + 'px'); };
  const end = () => { if (!d) return; panel.classList.remove('dragging'); const h = panel.getBoundingClientRect().height, hs = sheetHeights();
    if (!d.moved) setSheet(sheet === 'peek' ? 'half' : sheet === 'half' ? 'full' : 'peek', true);
    else { const st = Object.entries(hs).sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h))[0][0]; setSheet(st, st !== 'full'); }
    d = null; };
  for (const el of [$('#grab'), $('.phead')]) { el.addEventListener('pointerdown', start); el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); }
  // ----- geste tactile sur la feuille (D-75) -----
  // On tire la feuille depuis la poignée, l'en-tête, les onglets, le résumé ou la phrase ; depuis le contenu,
  // un glissement vers le bas quand on est tout en haut la réduit, un glissement vers le haut l'agrandit tant qu'elle n'est pas pleine.
  // Un geste rapide passe à la position suivante ; sinon on va à la position la plus proche.
  const ORDER = ['peek', 'half', 'full'];
  let t = null, noClick = false;
  const H = () => panel.getBoundingClientRect().height;
  panel.addEventListener('touchstart', e => {
    if (!MOB.matches || e.touches.length !== 1) { t = null; return; }
    const tg = e.target; if (tg.closest('input, select, textarea, #theme-btn, a.logo, .themepop, .chips, #race-filter, #portion-chips')) { t = null; return; }
    const y = e.touches[0].clientY, x = e.touches[0].clientX;
    t = { y0: y, x0: x, h0: H(), body: tg.closest('.pbody'), handle: !!tg.closest('#grab, .phead, .tabs, .summary, #mset'), on: false, ys: [[y, performance.now()]] };
  }, { passive: true });
  panel.addEventListener('touchmove', e => {
    if (!t) return; const y = e.touches[0].clientY, x = e.touches[0].clientX, dy = y - t.y0;
    if (!t.on) {
      if (Math.abs(dy) < 8) return;
      if (Math.abs(x - t.x0) > Math.abs(dy)) { t = null; return; }
      const atTop = !t.body || t.body.scrollTop <= 0;
      if (t.handle || (dy > 0 && atTop) || (dy < 0 && sheet !== 'full')) { t.on = true; panel.classList.add('dragging'); }
      else { t = null; return; }
    }
    e.preventDefault();
    const hs = sheetHeights(); document.documentElement.style.setProperty('--sheet-h', Math.max(hs.peek, Math.min(hs.full, t.h0 - (y - t.y0))) + 'px');
    t.ys.push([y, performance.now()]); if (t.ys.length > 6) t.ys.shift();
  }, { passive: false });
  const tend = () => {
    if (!t) return; const was = t; t = null; if (!was.on) return;
    panel.classList.remove('dragging'); noClick = true; setTimeout(() => noClick = false, 350);
    const [a, b] = [was.ys[0], was.ys[was.ys.length - 1]], v = (b[0] - a[0]) / Math.max(1, b[1] - a[1]); // px/ms, > 0 = vers le bas
    const hs = sheetHeights(), h = H(); let st;
    if (Math.abs(v) > 0.45) st = v < 0 ? (ORDER.find(k => hs[k] > h + 10) || 'full') : ([...ORDER].reverse().find(k => hs[k] < h - 10) || 'peek'); // geste rapide : position suivante dans le sens du geste
    else st = Object.entries(hs).sort((p, q) => Math.abs(p[1] - h) - Math.abs(q[1] - h))[0][0];
    setSheet(st, st !== 'full');
  };
  panel.addEventListener('touchend', tend); panel.addEventListener('touchcancel', tend);
  panel.addEventListener('click', e => { if (noClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  $('#grab').addEventListener('click', () => { if (MOB.matches && !noClick) setSheet(sheet === 'peek' ? 'half' : sheet === 'half' ? 'full' : 'peek', true); });
  // feuilles des réglages : glisser vers le bas pour fermer
  const ms = $('#msheet'); let m = null;
  ms.addEventListener('touchstart', e => { if (e.touches.length !== 1 || e.target.closest('input, select, textarea, .chips')) { m = null; return; } const b = $('#msheet-b'); m = { y0: e.touches[0].clientY, top: !e.target.closest('#msheet-b') || b.scrollTop <= 0, on: false, ys: [] }; }, { passive: true });
  ms.addEventListener('touchmove', e => { if (!m) return; const dy = e.touches[0].clientY - m.y0;
    if (!m.on) { if (dy < 8) { if (dy < -8) m = null; return; } if (!m.top) { m = null; return; } m.on = true; m.y0 = e.touches[0].clientY; ms.style.transition = 'none'; }
    e.preventDefault(); const d2 = Math.max(0, e.touches[0].clientY - m.y0); ms.style.transform = `translateY(${d2}px)`; m.ys.push([d2, performance.now()]); if (m.ys.length > 6) m.ys.shift(); }, { passive: false });
  const mend = () => { if (!m) return; const w = m; m = null; if (!w.on) return; const a = w.ys[0] || [0, 0], b = w.ys[w.ys.length - 1] || [0, 1], v = (b[0] - a[0]) / Math.max(1, b[1] - a[1]);
    ms.style.transition = 'transform .2s ease'; if (b[0] > 110 || v > 0.45) { ms.style.transform = 'translateY(100%)'; setTimeout(() => { mClose(); ms.style.transform = ''; ms.style.transition = ''; }, 200); } else { ms.style.transform = ''; setTimeout(() => ms.style.transition = '', 220); } };
  ms.addEventListener('touchend', mend); ms.addEventListener('touchcancel', mend);
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
  if (R && S.alts && S.alts.length > 1 && !NAV.on) {
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
    navDrawDone(px);
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
  drawRouteNames();
  // pins
  // lieux (connus ou de passage) : losange magenta (D-69), pour ne pas se confondre avec les arbres
  const dia = (p, label, r) => { if (!p) return; const [x, y] = E.toXY(p.lat, p.lon); const sx = x * V.s + V.tx, sy = y * V.s + V.ty; ctx.beginPath(); ctx.moveTo(sx, sy - r); ctx.lineTo(sx + r, sy); ctx.lineTo(sx, sy + r); ctx.lineTo(sx - r, sy); ctx.closePath(); ctx.fillStyle = colors.poi; ctx.fill(); ctx.strokeStyle = colors.casing; ctx.lineWidth = 2; ctx.stroke(); if (label) { ctx.fillStyle = colors.accentInk === '#0B0B0C' ? '#0B0B0C' : '#FFFFFF'; ctx.font = `800 12px ${css('--f-body')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, sx, sy + 1); } };
  const pin = (p, label, col, txt) => { if (!p) return; const [x, y] = E.toXY(p.lat, p.lon); const sx = x * V.s + V.tx, sy = y * V.s + V.ty; ctx.beginPath(); ctx.arc(sx, sy, 11, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = colors.casing; ctx.lineWidth = 2.5; ctx.stroke(); ctx.fillStyle = txt || '#fff'; ctx.font = `700 13px ${css('--f-display')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, sx, sy + 1); };
  if (R && S.alts && !NAV.on) for (const a of S.alts) if (a !== R && a._label) {
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
    navDrawMe(); return;
  }
  S.vias.forEach((v, i) => dia(v, String(i + 1), 13));
  pin(S.start, S.mode === 'ab' ? 'A' : 'D', colors.route, colors.accentInk);
  if (S.mode === 'ab' && !S.endFree) pin(S.end, 'B', colors.pinB, colors.panel);
  if (S.mode === 'ab' && S.endFree && S.route) { const v = S.route.nodes[S.route.nodes.length - 1]; const [la, lo] = E.toLL(G.NX[v], G.NY[v]); pin({ lat: la, lon: lo }, 'B', colors.pinB, colors.panel); }
  navDrawMe();
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
  if (drag) { const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y; if (Math.hypot(dx, dy) > 4) drag.moved = true; if (drag.moved) { V.tx = drag.tx + dx; V.ty = drag.ty + dy; if (NAV.on && NAV.follow) { NAV.follow = false; $('#run-pos').setAttribute('aria-pressed', false); } draw(); } }
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
  S.tool = S.tool === t ? null : t; if (S.tool && MPHR) mClose();
  document.querySelectorAll('.tool').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === S.tool));
  cv.classList.toggle('pick', !!S.tool);
  const msg = { start: 'Clique sur la carte pour placer le départ.', end: "Clique sur la carte pour placer l'arrivée.", quart: 'Clique sur un quartier pour l’éviter ou le réautoriser.', place: 'Clique sur la carte pour éviter un lieu (150 m autour).', via: 'Clique sur la carte pour ajouter un lieu par où passer.' };
  if (S.tool) toast(msg[S.tool], 3500);
}
document.querySelectorAll('.tool').forEach(b => b.onclick = () => setTool(b.dataset.tool));
$('#pick-start').onclick = () => setTool('start');
$('#change-start').onclick = () => { const b = $('#start-box'); b.hidden = !b.hidden; $('#change-start').setAttribute('aria-expanded', !b.hidden); $('#change-start').textContent = b.hidden ? 'Changer' : 'Fermer'; if (!b.hidden) $('#start-q').focus(); };
// ---------- départ : ouvrir la recherche, « Autour de moi » (D-70) ----------
function openStart(focus) { if (MPHR) { if (focus) mOpen('dep', 'start'); return; } $('#start-box').hidden = false; $('#change-start').setAttribute('aria-expanded', true); $('#change-start').textContent = 'Fermer'; if (focus) $('#start-q').focus(); }
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
  if (APPF && Q.get('p')) { openFixed(Q.get('p'), Q.get('n') || '', true); track('recu', 'Parcours reçu ouvert'); return true; }
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
  if (dep === 'pos') { locate().then(ok => { if (ok && go) generate(); else if (ok && arr === 'place') { if (MPHR) mOpen('arr', 'end'); else $('#end-q').focus(); } }); return true; }
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
// ---------- calques regroupés (D-76) ----------
function lyCount() {} // pastille retirée (D-76)
function lyClose() { $('#ly-pop').hidden = true; $('#ly-btn').setAttribute('aria-expanded', false); }
$('#ly-btn').onclick = e => { e.stopPropagation(); const p = $('#ly-pop'); p.hidden = !p.hidden; $('#ly-btn').setAttribute('aria-expanded', !p.hidden); if (!p.hidden && $('#legend').open) $('#legend').open = false; };
$('#ly-pop').addEventListener('click', e => { e.stopPropagation(); setTimeout(lyCount, 0); });
document.addEventListener('click', e => { if (!$('#ly-pop').hidden && !e.target.closest('#layers')) lyClose(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#ly-pop').hidden) { lyClose(); $('#ly-btn').focus(); } });
$('#legend').addEventListener('toggle', () => { if ($('#legend').open) lyClose(); });
setTimeout(lyCount, 0);
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
  else { $('#stale').hidden = true; $('#view-set').scrollTop = 0; if (MOB.matches) setSheet(MPHR ? 'half' : 'full'); }
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
  const prev = S.tab;
  S.tab = t; $('#tab-gen').setAttribute('aria-selected', t === 'gen'); $('#tab-race').setAttribute('aria-selected', t === 'race'); $('#tab-mine').setAttribute('aria-selected', t === 'mine');
  const tools = document.querySelector('.tools'); tools.hidden = t !== 'gen';
  $('#view-mine').hidden = t !== 'mine';
  if (prev === 'gen' && t !== 'gen') S.saved = { route: S.route, alts: S.alts, lastTarget: S.lastTarget, lastD: S.lastD, baseNotes: S.baseNotes };
  if (t === 'mine') { // Mes parcours (D-81)
    $('#view-set').hidden = true; $('#foot-set').hidden = true; $('#view-res').hidden = true; $('#stale').hidden = true; $('#view-race').hidden = true; $('#foot-res').hidden = true;
    S.route = null; S.alts = []; renderMine(); draw(); if (MOB.matches) setSheet('half'); track('mes-parcours', 'Mes parcours ouvert');
    return;
  }
  if (t === 'race') {
    $('#view-set').hidden = true; $('#foot-set').hidden = true; $('#view-res').hidden = true; $('#stale').hidden = true;
    $('#view-race').hidden = false; $('#foot-res').hidden = !S.race; $('#again').hidden = true;
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
// point de départ, d'arrivée ou de passage : jamais au bout d'un petit passage sans nom (porche, cour) — on se place au carrefour (D-80)
function snapNode(x, y) {
  let v = E.nearest(x, y); if (v < 0) return v;
  for (let k = 0; k < 3 && G.deg[v + 1] - G.deg[v] === 1; k++) { const e = G.adjE[G.deg[v]]; if (G.en[e] || G.LEN[e] > 80) break; const u = G.ea[e] === v ? G.eb[e] : G.ea[e]; if (!G.nodeOk[u]) break; v = u; }
  return v;
}
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
  if ($('#done')) $('#done').setAttribute('aria-pressed', false);
  if (!G || busy) return; mClose();
  const notes = [], errs = [];
  if (!S.start) { showView('set'); openStart(true); toast('Choisis d’abord ton départ : un lieu, une rue ou un point sur la carte.'); return; }
  const k = readKm(); if (k.err) { fail([{ t: k.err, err: true }]); return; }
  if (k.info) notes.push(k.info);
  const km = k.km, target = km * 1000;
  if (!parsePace($('#pace').value)) notes.push('Allure non reconnue (exemple : 5:30) : le temps est estimé à 5:30 /km.');
  let dplus = null;
  if (S.dmode === 'target') { const d = readDplus(); if (d.err) { fail([{ t: d.err, err: true }]); return; } if (d.info) notes.push(d.info); dplus = d.dplus; }
  if (S.mode === 'ab' && !S.endFree && !S.end) { showView('set'); if (MPHR) mOpen('arr', 'end'); else $('#end-q').focus(); toast('Choisis d’abord ton arrivée, ou « N’importe où ».'); return; }
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
    const s = snapNode(sx, sy);
    if (s < 0) errs.push(`Aucune rue accessible autour de ${A} avec ces exclusions. Réautorise un quartier proche ou retire un lieu évité.`);
    else {
      const snapD = Math.hypot(G.NX[s] - sx, G.NY[s] - sy);
      if (snapD > 250) notes.push(`${ab ? 'A est' : 'Ton départ est'} dans une zone évitée : le parcours part de la rue autorisée la plus proche (${Math.round(snapD)} m).`);
      const prog = f => bar.style.width = (5 + f * 95) + '%';
      // places to pass by, or discovery of famous places
      let endN = null;
      if (ab && !S.endFree) {
        const [ex, ey] = E.toXY(S.end.lat, S.end.lon); endN = snapNode(ex, ey);
        if (endN < 0) errs.push('Aucune rue accessible autour de l’arrivée avec ces exclusions.');
        else if (endN === s || Math.hypot(ex - sx, ey - sy) < 30) errs.push('Le départ et l’arrivée sont au même endroit. Choisis « Retour au départ » ou « N’importe où ».');
      }
      const endArg = !ab ? s : S.endFree ? 'free' : endN;
      if (errs.length) { /* reported below */ }
      else if (S.vias.length) {
        const vn = [];
        for (const v of S.vias) { const [vx, vy] = E.toXY(v.lat, v.lon); const n = snapNode(vx, vy); if (n < 0 || Math.hypot(G.NX[n] - vx, G.NY[n] - vy) > 400) { errs.push(`« ${v.name} » est dans une zone évitée ou inaccessible : retire-le ou réautorise sa zone.`); } else vn.push(n); }
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
    busy = false; $('#gen').disabled = false; $('#again').disabled = false; $('#recalc').disabled = false; $('#gen').textContent = 'Générer 3 parcours'; $('#again').innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/></svg>Voir 3 autres parcours';
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
    if (NATIVE) { await nativeShareFile(fn + '.gpx', g); return; } // application : menu de partage (Strava, Garmin, Fichiers…)
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

// ---------- fin de parcours : « Je l'ai fait », photo, image à partager (D-77) ----------
// Tout se passe dans le téléphone : la photo n'est jamais envoyée.
const SH = { photo: null, bg: 'map', ly: 'big', secs: 0, data: null };
const fmtClock = sec => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s2 = sec % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(s2).padStart(2, '0')}` : `${m}:${String(s2).padStart(2, '0')}`; };
function parseClock(t) { t = String(t || '').trim().replace(/[hH]/, ':').replace(/\s/g, ''); if (!t) return 0; const p = t.split(/[:'’.,]/).map(Number); if (p.some(isNaN)) return 0; if (p.length === 1) return p[0] * 60; if (p.length === 2) return p[0] * 60 + p[1]; return p[0] * 3600 + p[1] * 60 + p[2]; }
const shortName = n => !n ? '' : /^Chez moi/.test(n) ? 'Chez moi' : n === 'Ma position' ? 'Ma position' : n.replace(/^Point sur la carte · /, '').split(' · ')[0];
function shareData() {
  const r = S.route; if (!r) return null; const pts = routePts(r); if (!pts || pts.length < 2) return null;
  const km = r.len / 1000, a = pts[0], b = pts[pts.length - 1], loop = Math.hypot(a[0] - b[0], a[1] - b[1]) < 150;
  let dep = '', arr = '';
  if (S.tab === 'race' && S.race) dep = S.race.name;
  else { dep = shortName(S.start && S.start.name); if (!dep || dep === 'Ma position' || /^Point sur la carte/.test(S.start && S.start.name || '')) { const ns = nearestStation(a[0], a[1]); dep = ns && ns.d < 800 ? ns.s.n : (dep || 'Départ'); } if (!loop) { if (S.mode === 'ab' && !S.endFree && S.end) arr = shortName(S.end.name); else { const ns = nearestStation(b[0], b[1]); arr = ns && ns.d < 600 ? ns.s.n : 'Arrivée'; } } }
  const d = new Date(); const date = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  return { pts, km, up: Math.round(r.up || 0), loop, dep, arr, race: S.tab === 'race' && !!S.race, date };
}
function shOpen(secs, doneM) {
  const meas = typeof secs === 'number';
  const d = shareData(); if (!d) return toast("Génère d'abord un parcours.");
  if (meas && typeof doneM === 'number' && doneM > 100) d.km = doneM / 1000;
  SH.data = d; SH.photo = null; SH.bg = 'map'; SH.ly = 'big'; $('#done').setAttribute('aria-pressed', true);
  $('#shx-time').value = fmtClock(meas ? secs : d.km * pace());
  $('#shx-bravo .shx-time small').textContent = meas ? 'Mesuré pendant ta course, pauses déduites' : 'Estimé avec ton allure, modifie-le si besoin';
  $('#shx-lede').textContent = `${fmt(d.km, 1)} km ${d.race ? 'sur « ' + d.dep + ' »' : d.loop ? 'autour de ' + d.dep : 'depuis ' + d.dep}${meas ? ', mesurés pendant ta course' : ''}${meas && SH.extra ? ', dont ' + fmt(SH.extra.km, 1) + ' km en plus' + (SH.extra.streets.length ? ' (' + SH.extra.streets.join(', ') + ')' : '') : ''}. Immortalise ta sortie et partage-la.`;
  $('#shx').hidden = false; $('#shx-bravo').hidden = false; $('#shx-out').hidden = true; sbSync();
  const entry = { id: Date.now(), d: new Date().toISOString(), km: Math.round(d.km * 10) / 10, up: d.up, dep: d.dep, arr: d.arr, loop: d.loop, race: d.race, t: mineTitle(d), g: routeCode(S.route), secs: Math.round(meas ? secs : d.km * pace()), meas, extra: meas && SH.extra ? SH.extra : undefined };
  const L = mineLoad(); if (SH.entryRoute === S.route && SH.entryId && L.some(x => x.id === SH.entryId)) { const i = L.findIndex(x => x.id === SH.entryId); entry.id = SH.entryId; L[i] = entry; } else L.unshift(entry);
  mineSave(L); SH.entryId = entry.id; SH.entryRoute = S.route;
  track('fait', d.race ? 'Fait parcours mythique ' + d.dep : 'Fait parcours ' + Math.round(d.km) + ' km');
}
function shClose() { $('#shx').hidden = true; SH.photo = null; sbSync(); }
function shOut() {
  SH.secs = parseClock($('#shx-time').value) || SH.data.km * pace();
  $('#shx-bravo').hidden = true; $('#shx-out').hidden = false;
  document.querySelector('#shx-out [data-bg="photo"]').disabled = !SH.photo;
  shSync(); shDraw();
}
function shSync() { document.querySelectorAll('#shx-out [data-bg]').forEach(b => b.setAttribute('aria-pressed', b.dataset.bg === SH.bg)); document.querySelectorAll('#shx-out [data-ly]').forEach(b => b.setAttribute('aria-pressed', b.dataset.ly === SH.ly)); }
function shPhoto(file) {
  if (!file) return; const img = new Image(); img.onload = () => { SH.photo = img; SH.bg = 'photo'; shOut(); }; img.onerror = () => toast('Impossible de lire cette photo.'); img.src = URL.createObjectURL(file);
}
// dessin de l'image 1080 × 1920
function shDraw() {
  const cvs = $('#shx-cv'), g = cvs.getContext('2d'), Wd = 1080, Hd = 1920, D = SH.data, ACC = '#1F4FE0', INK = '#0B0B0C';
  const onPhoto = SH.bg === 'photo', onMap = SH.bg === 'map', fg = onMap ? INK : '#fff';
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, Wd, Hd);
  const xs = D.pts.map(p => p[0]), ys = D.pts.map(p => p[1]), bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
  const fitT = (x, y, w, h) => { const sc = Math.min(w / Math.max(1, bx1 - bx0), h / Math.max(1, by1 - by0)); return { sc, ox: x + (w - (bx1 - bx0) * sc) / 2 - bx0 * sc, oy: y + (h - (by1 - by0) * sc) / 2 - by0 * sc }; };
  const boxes = { big: onMap ? [90, 170, 900, 960] : [560, 200, 440, 400], pills: [140, 560, 800, 760], trace: [70, 300, 940, 860] };
  const T = fitT(...boxes[SH.ly]);
  // fond
  if (onPhoto && SH.photo) { const iw = SH.photo.naturalWidth, ih = SH.photo.naturalHeight, sc = Math.max(Wd / iw, Hd / ih); g.drawImage(SH.photo, (Wd - iw * sc) / 2, (Hd - ih * sc) / 2, iw * sc, ih * sc); }
  else if (onMap) {
    g.fillStyle = '#F4F4F2'; g.fillRect(0, 0, Wd, Hd);
    g.save(); g.setTransform(T.sc, 0, 0, T.sc, T.ox, T.oy); const px = v => v / T.sc; g.lineCap = g.lineJoin = 'round';
    if (M.greenPath) { g.fillStyle = '#E1E7DC'; g.fill(M.greenPath, 'evenodd'); }
    if (M.waterPath) { g.fillStyle = '#D5DFE6'; g.fill(M.waterPath, 'evenodd'); }
    g.strokeStyle = '#DEDEDA'; g.lineWidth = px(3); g.stroke(paths.minor);
    g.strokeStyle = '#C2C2BD'; g.lineWidth = px(4); g.stroke(paths.c1); g.lineWidth = px(6); g.stroke(paths.c2); g.lineWidth = px(8); g.stroke(paths.c3);
    g.restore();
  } else { g.fillStyle = ACC; g.fillRect(0, 0, Wd, Hd); }
  // voiles pour la lisibilité du texte
  const grad = (y0, y1, c0, c1) => { const l = g.createLinearGradient(0, y0, 0, y1); l.addColorStop(0, c0); l.addColorStop(1, c1); g.fillStyle = l; g.fillRect(0, Math.min(y0, y1), Wd, Math.abs(y1 - y0)); };
  if (onPhoto) { if (SH.ly === 'pills') grad(0, 760, 'rgba(0,0,0,.5)', 'rgba(0,0,0,0)'); else if (SH.ly === 'trace') { g.fillStyle = 'rgba(10,14,40,.3)'; g.fillRect(0, 0, Wd, Hd); grad(Hd, Hd - 700, 'rgba(0,0,0,.55)', 'rgba(0,0,0,0)'); } else { grad(Hd, Hd - 980, 'rgba(0,0,0,.62)', 'rgba(0,0,0,0)'); grad(0, 300, 'rgba(0,0,0,.35)', 'rgba(0,0,0,0)'); } }
  if (onMap) { g.fillStyle = 'rgba(244,244,242,1)'; const l = g.createLinearGradient(0, Hd, 0, Hd - 1000); l.addColorStop(0, 'rgba(244,244,242,1)'); l.addColorStop(.55, 'rgba(244,244,242,1)'); l.addColorStop(1, 'rgba(244,244,242,0)'); g.fillStyle = l; g.fillRect(0, Hd - 1000, Wd, 1000); }
  // tracé
  g.save(); g.lineCap = g.lineJoin = 'round'; g.beginPath(); D.pts.forEach(([x, y], i) => { const X = x * T.sc + T.ox, Y = y * T.sc + T.oy; i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
  const lw = SH.ly === 'big' && !onMap ? 12 : 16;
  g.strokeStyle = onMap ? '#fff' : onPhoto ? 'rgba(0,0,0,.38)' : 'rgba(0,0,0,.18)'; g.lineWidth = lw + 12; g.stroke();
  g.strokeStyle = onMap ? ACC : '#fff'; g.lineWidth = lw; g.stroke(); g.restore();
  const P = ([x, y]) => [x * T.sc + T.ox, y * T.sc + T.oy];
  const dot = (pt, label, fill, txt) => { const [X, Y] = P(pt); g.beginPath(); g.arc(X, Y, label ? 30 : 18, 0, 7); g.fillStyle = fill; g.fill(); g.lineWidth = 7; g.strokeStyle = onMap ? '#fff' : 'rgba(0,0,0,.35)'; g.stroke(); if (label) { g.fillStyle = txt; g.font = '800 34px Archivo, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, X, Y + 2); } };
  if (onMap) { if (!D.loop) dot(D.pts[D.pts.length - 1], 'B', INK, '#fff'); dot(D.pts[0], D.loop ? 'D' : 'A', ACC, '#fff'); }
  else { if (!D.loop) { const [X, Y] = P(D.pts[D.pts.length - 1]); g.beginPath(); g.arc(X, Y, 24, 0, 7); g.lineWidth = 9; g.strokeStyle = '#fff'; g.stroke(); g.beginPath(); g.arc(X, Y, 10, 0, 7); g.fillStyle = '#fff'; g.fill(); } dot(D.pts[0], '', '#fff'); }
  // textes
  const NARF = (w, s) => { g.font = `${w} ${s}px Archivo, sans-serif`; try { g.fontStretch = 'condensed'; } catch (e) {} };
  const BODY = (w, s) => { g.font = `${w} ${s}px Archivo, sans-serif`; try { g.fontStretch = 'normal'; } catch (e) {} };
  g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillStyle = fg;
  if (onPhoto) { g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 8; }
  const logo = (x, y, s, align) => { NARF(800, s); const a = 'RUN', b = 'PARIS', wa = g.measureText(a).width, wb = g.measureText(b).width; let x0 = align === 'center' ? x - (wa + wb) / 2 : x; g.fillStyle = fg; g.fillText(a, x0, y); g.fillStyle = onMap ? ACC : SH.bg === 'uni' ? 'rgba(255,255,255,.72)' : '#7B96FF'; g.fillText(b, x0 + wa, y); g.fillStyle = fg; };
  const km = fmt(D.km, 1), time = fmtClock(SH.secs), pc = fmtClock(SH.secs / Math.max(.1, D.km)), url = 'runparis.netlify.app';
  const lieux = D.race ? [[D.dep, 'parcours mythique']] : D.loop ? [['Boucle · ' + D.dep, 'départ et arrivée']] : [[D.dep, 'départ'], [D.arr, 'arrivée']];
  const L = 66;
  if (SH.ly === 'big') {
    logo(L, 130, 66);
    let y = Hd - 700; BODY(700, 38); g.fillText(D.date, L, y);
    y += 250; let k = 1; { NARF(800, 270); const a = g.measureText(km).width; NARF(800, 84); const b = g.measureText('km').width; NARF(800, 132); const c = g.measureText(time).width; const tot = a + b + c + 62; if (tot > Wd - 2 * L) k = (Wd - 2 * L) / tot; }
    NARF(800, 270 * k); g.fillText(km, L, y); let x = L + g.measureText(km).width + 12 * k; NARF(800, 84 * k); g.fillText('km', x, y); x += g.measureText('km').width + 50 * k; NARF(800, 132 * k); g.fillText(time, x, y);
    y += 50; g.shadowBlur = 0; g.fillStyle = fg; g.fillRect(L, y, Wd - 2 * L, 6); if (onPhoto) g.shadowBlur = 8;
    y += 86; const cols = [[D.up + ' m', 'D+'], [pc, 'allure /km']]; x = L; cols.forEach(([a, b]) => { NARF(800, 78); g.fillText(a, x, y); BODY(700, 32); g.fillText(b, x, y + 42); NARF(800, 78); x += Math.max(g.measureText(a).width, 180) + 66; });
    y += 130; x = L; NARF(800, 58); const lw2 = lieux.reduce((t, [a]) => t + g.measureText(a).width + 66, -66), lk = Math.min(1, (Wd - 2 * L) / lw2);
    lieux.forEach(([a, b]) => { NARF(800, 58 * lk); const w = g.measureText(a).width; g.fillText(a, x, y); BODY(700, 32); g.fillText(b, x, y + 40); x += w + 66 * lk; });
    BODY(600, 32); g.globalAlpha = .8; g.fillText(url, L, Hd - 60); g.globalAlpha = 1;
  } else if (SH.ly === 'pills') {
    const rows = [['RunParis', D.date], ['Distance ' + km + ' km', 'Temps ' + time], ['D+ ' + D.up + ' m', 'Allure ' + pc + ' /km'], lieux.map(l => l[0]).length > 1 ? [lieux[0][0] + ' → ' + lieux[1][0]] : [lieux[0][0]]];
    let y = 110; BODY(700, 36); g.shadowBlur = 0;
    rows.forEach(r => { const ws = r.map(t => g.measureText(t).width + 60), tot = ws.reduce((a, b) => a + b, 0) + 18 * (r.length - 1); let x = (Wd - tot) / 2;
      r.forEach((t, i) => { g.lineWidth = 4; g.strokeStyle = onMap ? INK : 'rgba(255,255,255,.9)'; if (onMap) { g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.roundRect(x, y, ws[i], 76, 12); g.fill(); } g.beginPath(); g.roundRect(x, y, ws[i], 76, 12); g.stroke(); g.fillStyle = fg; g.textBaseline = 'middle'; g.fillText(t, x + 30, y + 40); x += ws[i] + 18; });
      y += 96; });
    g.textBaseline = 'alphabetic'; BODY(600, 34); g.textAlign = 'center'; g.fillText(url, Wd / 2, Hd - 70); g.textAlign = 'left';
  } else {
    logo(Wd / 2, 140, 78, 'center'); g.textAlign = 'center';
    NARF(800, 132); g.fillText(`${km} km · ${time}`, Wd / 2, Hd - 300);
    BODY(700, 44); g.fillText(`${D.up} m D+ · ${pc} /km`, Wd / 2, Hd - 210);
    BODY(700, 40); g.fillText(lieux.length > 1 ? `${lieux[0][0]} → ${lieux[1][0]}` : lieux[0][0], Wd / 2, Hd - 150);
    BODY(600, 32); g.globalAlpha = .8; g.fillText(url, Wd / 2, Hd - 80); g.globalAlpha = 1; g.textAlign = 'left';
  }
  g.shadowBlur = 0;
}
function shBlob() { return new Promise(res => $('#shx-cv').toBlob(b => res(b), 'image/jpeg', 0.92)); }
async function shShare() {
  const b = await shBlob(); if (!b) return; const f = new File([b], `runparis-${Math.round(SH.data.km * 10) / 10}km.jpg`, { type: 'image/jpeg' });
  track('partage', 'Image partagée ' + SH.bg + ' ' + SH.ly);
  if (NATIVE) { await nativeShareFile(f.name, b, 'Ma sortie avec RunParis · runparis.netlify.app'); return; }
  if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], text: 'Ma sortie avec RunParis · runparis.netlify.app' }); } catch (e) {} return; }
  shSave(b); toast('Partage direct indisponible ici : l’image est enregistrée.', 3500);
}
async function shSave(b) { b = b || await shBlob(); if (NATIVE) { await nativeShareFile(`runparis-${Math.round(SH.data.km * 10) / 10}km.jpg`, b); track('image', 'Image enregistrée'); return; } const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `runparis-${Math.round(SH.data.km * 10) / 10}km.jpg`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); track('image', 'Image enregistrée'); }
$('#done').onclick = shOpen;
$('#copy-m').onclick = () => $('#copy').click();
$('#shx-x1').onclick = shClose; $('#shx-x2').onclick = shClose; $('#shx-back').onclick = shClose;
$('#shx-cam').onchange = e => shPhoto(e.target.files[0]); $('#shx-gal').onchange = e => shPhoto(e.target.files[0]);
$('#shx-time').addEventListener('change', () => { const v = parseClock($('#shx-time').value); if (v && SH.entryId) minePatch(SH.entryId, { secs: Math.round(v) }); });
$('#shx-nophoto').onclick = () => { SH.photo = null; SH.bg = 'map'; shOut(); };
document.querySelectorAll('#shx-out [data-bg]').forEach(b => b.onclick = () => { if (b.disabled) return; SH.bg = b.dataset.bg; shSync(); shDraw(); });
document.querySelectorAll('#shx-out [data-ly]').forEach(b => b.onclick = () => { SH.ly = b.dataset.ly; shSync(); shDraw(); });
$('#shx-share').onclick = shShare; $('#shx-save').onclick = () => shSave();
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#shx').hidden) shClose(); });
$('#done').hidden = false; $('#copy-m').hidden = false;
if (document.fonts && document.fonts.load) { document.fonts.load('800 100px Archivo'); }

// ---------- mode course : suivre le tracé en direct, sans montre (mobile) ----------
// Le téléphone compare sa position au tracé : prochain virage, km faits / restants, hors tracé, arrivée.
// Tout reste dans le téléphone. Limite d'un site : rien ne se passe écran verrouillé, d'où l'écran gardé allumé.
const NAV = { on: false };
const RUN_IC = {
  right: '<path d="M7 21V12h10"/><path d="M13 8l4 4-4 4"/>', left: '<path d="M17 21V12H7"/><path d="M11 8l-4 4 4 4"/>',
  sright: '<path d="M8 21v-7l7-7"/><path d="M10 7h5v5"/>', sleft: '<path d="M16 21v-7L9 7"/><path d="M14 7H9v5"/>',
  uturn: '<path d="M8 21V9a4 4 0 0 1 8 0v4"/><path d="M12 10l4 4 4-4"/>', straight: '<path d="M12 21V4"/><path d="M7 9l5-5 5 5"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4h11l-2.5 4L17 12H6"/>', start: '<path d="M12 21s-6-5.6-6-10a6 6 0 0 1 12 0c0 4.4-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>'
};
const runIco = k => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${RUN_IC[k]}</svg>`;
function navBuild(r) {
  const pts = routePts(r).map(p => [p[0], p[1]]), cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1];
  const idx = d => { let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; } return lo; };
  const at = d => { d = Math.max(0, Math.min(L, d)); const i = Math.min(idx(d), pts.length - 2), t = (d - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i]); return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]; };
  const turn = (d, w) => { const a = at(d - w), b = at(d), c = at(d + w); let t = (Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0])) * 180 / Math.PI; while (t > 180) t -= 360; while (t < -180) t += 360; return t; };
  const nameNear = d => { const [x, y] = at(d), v = E.nearest(x, y); if (v < 0) return ''; for (let k = G.deg[v]; k < G.deg[v + 1]; k++) { const e = G.adjE[k]; if (G.en[e]) return M.names[G.en[e] - 1]; } return ''; };
  let man = []; const runs = [];
  const addRun = (d0, d1, nm) => { if (!nm) return; const l = runs[runs.length - 1]; if (l && l.name === nm && d0 - l.d1 < 30) l.d1 = d1; else runs.push({ d0, d1, name: nm }); };
  if (r.edges && r.edges.length) { // parcours généré : un virage possible à chaque carrefour
    const segs = []; let d = 0;
    for (const [e, fromA] of r.edges) { const p = E.edgePts(e); let len = 0; for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); segs.push([d, d + len, G.en[e] ? M.names[G.en[e] - 1] : '']); addRun(d, d + len, segs[segs.length - 1][2]); d += len; }
    for (let i = 0; i < segs.length - 1; i++) {
      const dd = segs[i][1]; if (dd < 15 || dd > L - 15) continue;
      const a = turn(dd, 18); if (Math.abs(a) < 35) continue;
      let nm = ''; for (let j = i + 1; j < segs.length && segs[j][0] < dd + 60; j++) if (segs[j][2]) { nm = segs[j][2]; break; }
      man.push({ d: dd, a, name: nm });
    }
  } else { // trace publiée : là où le cap change nettement
    for (let d = 0; d < L; d += 40) addRun(d, Math.min(L, d + 40), nameNear(d + 20));
    let best = null;
    for (let d = 30; d < L - 30; d += 10) { const a = turn(d, 25); if (Math.abs(a) >= 45) { if (!best || Math.abs(a) > Math.abs(best.a)) best = { d, a }; } else if (best) { man.push({ d: best.d, a: best.a, name: nameNear(best.d + 30) }); best = null; } }
  }
  man = man.filter((m, i) => !(i && m.d - man[i - 1].d < 12 && Math.abs(m.a) <= Math.abs(man[i - 1].a)));
  man.push({ d: L, a: 0, arrive: true, name: '' });
  return { pts, cum, L, idx, at, man, runs };
}
function navDir(m) {
  if (m.arrive) return ['flag', 'Arrivée'];
  const a = m.a, s = a > 0 ? 'droite' : 'gauche', k = a > 0 ? 'right' : 'left';
  if (Math.abs(a) >= 160) return ['uturn', 'Demi-tour'];
  if (Math.abs(a) < 60) return ['s' + k, 'Légèrement à ' + s];
  return [k, 'À ' + s];
}
const navDistTxt = d => d >= 1000 ? fmt(d / 1000, 1) + ' km' : (d >= 100 ? Math.round(d / 50) * 50 : Math.max(10, Math.round(d / 10) * 10)) + ' m';
const navSayDist = d => d >= 1000 ? fmt(d / 1000, 1) + ' kilomètre' + (d >= 2000 ? 's' : '') : (d >= 100 ? Math.round(d / 50) * 50 : Math.round(d / 10) * 10) + ' mètres';
function navSay(t) { if (!NAV.voice || !('speechSynthesis' in window)) return; try { const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; u.rate = 1.05; speechSynthesis.speak(u); } catch (e) {} }
function navElapsed() { if (!NAV.t0) return 0; return ((NAV.paused ? NAV.pauseAt : Date.now()) - NAV.t0 - NAV.pausedMs) / 1000; }
async function navWake() { if (NATIVE) { if (NAV.on && NAV.wake) try { await NP.awake.keepAwake(); } catch (e) {} return; } if (!NAV.on || !NAV.wake || !('wakeLock' in navigator) || document.hidden) return; try { NAV.lock = await navigator.wakeLock.request('screen'); } catch (e) {} }
function navMsg(kind, title, text, ms) {
  const n = $('#run-msg'); clearTimeout(NAV.msgT);
  if (!kind) { n.hidden = true; return; }
  n.className = 'note' + (kind === 'err' ? ' err' : kind === 'info' ? ' info' : ''); n.innerHTML = ''; const b = document.createElement('b'); b.textContent = title; n.append(b, text); n.hidden = false;
  $('#run-nav').hidden = kind === 'err';
  if (ms) NAV.msgT = setTimeout(() => { n.hidden = true; $('#run-nav').hidden = false; }, ms);
}
// position bloquée : on dit où l'autoriser (message bloquant du design system)
function navDenied(n) {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent), and = /Android/.test(navigator.userAgent);
  const how = NATIVE ? 'Réglages → RunParis → Position : choisis « Toujours » (pour le suivi écran verrouillé) et active « Position exacte ». Reviens ensuite dans l’app.'
    : ios ? 'Réglages → Confidentialité et sécurité → Service de localisation : active-le, puis « Sites web Safari » → « Lorsque l’app est active » et « Position exacte ». Recharge ensuite la page.'
    : and ? 'Touche le cadenas à gauche de l’adresse → Autorisations → Position : autoriser, et vérifie que la localisation du téléphone est activée. Recharge ensuite la page.'
    : 'Autorise la position pour ce site dans les réglages du navigateur, puis recharge la page.';
  n.className = 'note err'; n.innerHTML = ''; const b = document.createElement('b'); b.textContent = 'Ta position est bloquée'; n.append(b, how); n.hidden = false;
  NAV.denied = true; const g = $('#runp-go'); NAV.goHTML = NAV.goHTML || g.innerHTML; g.textContent = NATIVE ? 'Ouvrir les réglages' : 'Recharger la page';
}
function runPrep() {
  if (!S.route) return toast("Génère d'abord un parcours.");
  if (NATIVE && !runPrep.asked) { // application : on explique avant la question de l'iPhone (D-86)
    NP.geo.checkPermissions().then(r => { if (/prompt/.test(r.location)) $('#runperm').hidden = false; else { runPrep.asked = true; runPrep(); } }, () => { runPrep.asked = true; runPrep(); });
    return;
  }
  if (!navigator.geolocation) return toast('Ta position n’est pas disponible sur cet appareil.', 3500);
  NAV.n = navBuild(S.route);
  $('#runp-far').hidden = true; $('#runp-far').className = 'note info'; $('#runp').hidden = false;
  NAV.denied = false; if (NAV.goHTML) $('#runp-go').innerHTML = NAV.goHTML;
  navigator.geolocation.getCurrentPosition(p => { // prévenir si on n'est pas encore au départ
    const [x, y] = E.toXY(p.coords.latitude, p.coords.longitude), [sx, sy] = NAV.n.pts[0], d = Math.hypot(x - sx, y - sy);
    if (d > 60 && !$('#runp').hidden) { const f = $('#runp-far'); f.innerHTML = ''; const b = document.createElement('b'); b.textContent = `Tu es à ${navDistTxt(d)} du départ.`; f.append(b, ' Rejoins le point D : le chrono démarre quand tu y es.'); f.hidden = false; }
  }, e => { if (e.code === 1) navDenied($('#runp-far')); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
}
function runStart() {
  $('#runp').hidden = true;
  Object.assign(NAV, { free: false, extra: 0, track: [], streets: new Map(), curFree: '', on: true, voice: $('#run-voice').checked, wake: $('#run-wake').checked, buzz: NATIVE && $('#run-buzz').checked, t0: 0, wasPre: true, pausedMs: 0, paused: false, prog: 0, pos: null, off: 0, offOn: false, mi: 0, a1: -1, a2: -1, km: 1, follow: true, reacq: false, hiddenAt: 0 });
  $('#run-vol').setAttribute('aria-pressed', NAV.voice); $('#run-pos').setAttribute('aria-pressed', true);
  document.documentElement.classList.add('running'); $('#run').hidden = false; navMsg(null);
  if (NAV.voice && 'speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) {} } // iOS : la voix doit démarrer après un geste
  navSay('Suivi du parcours activé.');
  navWake(); resize();
  V.s = Math.max(V.s, 0.9); navUI();
  if (NATIVE) { // application : la position continue écran verrouillé
    NP.bg.addWatcher({ backgroundTitle: 'RunParis suit ton parcours', backgroundMessage: 'Le guidage continue écran verrouillé.', requestPermissions: false, stale: false, distanceFilter: 0 }, (l, err) => {
      if (err) { if (err.code === 'NOT_AUTHORIZED') { runStop(); runPrep(); navDenied($('#runp-far')); } return; }
      navFix({ coords: { latitude: l.latitude, longitude: l.longitude, accuracy: l.accuracy, altitude: l.altitude, heading: l.bearing, speed: l.speed }, timestamp: l.time || Date.now() });
    }).then(id => { if (NAV.on) NAV.bgId = id; else NP.bg.removeWatcher({ id }); });
  } else
  NAV.watch = navigator.geolocation.watchPosition(navFix, e => { if (e.code === 1) { runStop(); runPrep(); } }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  NAV.tick = setInterval(navUI, 1000);
  track('suivi', 'Suivi lancé ' + Math.round(NAV.n.L / 1000) + ' km');
}
function runStop() {
  if (NAV.watch != null) navigator.geolocation.clearWatch(NAV.watch); NAV.watch = null; clearInterval(NAV.tick);
  if (NATIVE) { if (NAV.bgId) NP.bg.removeWatcher({ id: NAV.bgId }).catch(() => {}); NAV.bgId = null; try { NP.awake.allowSleep(); } catch (e) {} }
  try { NAV.lock && NAV.lock.release(); } catch (e) {} NAV.lock = null;
  try { speechSynthesis.cancel(); } catch (e) {}
  NAV.on = false; $('#run').hidden = true; $('#runz').hidden = true; document.documentElement.classList.remove('running');
  setTimeout(() => { resize(); setSheet(sheet); fitRoute(); }, 30);
}
function runFinish(arrived) {
  const secs = navElapsed(), started = !!NAV.t0, free = !!NAV.free, extra = NAV.extra || 0, done = free ? NAV.n.L + extra : NAV.prog;
  const streets = free ? [...NAV.streets.entries()].sort((a, b) => b[1] - a[1]).map(q => q[0]).slice(0, 3) : [];
  runStop(); $('#runa').hidden = true;
  if (!started) return;
  track('suivi-fin', free ? 'Terminé après avoir continué' : arrived ? 'Arrivée détectée' : 'Terminé avant l’arrivée');
  SH.extra = free && extra > 50 ? { km: Math.round(extra / 100) / 10, streets } : null;
  shOpen(secs, arrived && !free ? null : done);
}
// arrivée : on ne coupe pas d'office, le coureur choisit de terminer ou de continuer (D-80)
function navArrive() {
  NAV.paused = true; NAV.pauseAt = Date.now(); NAV.prog = NAV.n.L; navUI();
  navSay('Parcours terminé. Tu peux terminer ou continuer.'); navBuzz('end');
  $('#ra-km').textContent = fmt(NAV.n.L / 1000, 1) + ' km'; $('#ra-time').textContent = fmtClock(navElapsed()); $('#runa').hidden = false;
}
function navContinue() {
  $('#runa').hidden = true; NAV.pausedMs += Date.now() - NAV.pauseAt; NAV.paused = false;
  Object.assign(NAV, { free: true, extra: 0, track: NAV.pos ? [NAV.pos.slice()] : [], streets: new Map(), offOn: false, errShown: false });
  navMsg(null); navSay('Course libre : tes kilomètres en plus sont comptés.'); navUI();
}
// rue la plus proche d'un point (course libre)
function streetAt(x, y) {
  const v = E.nearest(x, y); if (v < 0) return ''; let best = '', bd = 40;
  for (let k = G.deg[v]; k < G.deg[v + 1]; k++) { const e = G.adjE[k]; if (!G.en[e]) continue; const p = E.edgePts(e);
    for (let i = 1; i < p.length; i++) { const vx = p[i][0] - p[i - 1][0], vy = p[i][1] - p[i - 1][1], l = vx * vx + vy * vy || 1e-9, t = Math.max(0, Math.min(1, ((x - p[i - 1][0]) * vx + (y - p[i - 1][1]) * vy) / l)), d = Math.hypot(x - p[i - 1][0] - vx * t, y - p[i - 1][1] - vy * t); if (d < bd) { bd = d; best = M.names[G.en[e] - 1]; } } }
  return best;
}
function navProject(x, y, d0, d1) {
  const n = NAV.n, i0 = Math.max(0, n.idx(Math.max(0, d0))), i1 = Math.min(n.pts.length - 2, n.idx(Math.min(n.L, d1)) + 1); let best = null;
  for (let i = i0; i <= i1; i++) { const [ax, ay] = n.pts[i], [bx, by] = n.pts[i + 1], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2)), px = ax + vx * t, py = ay + vy * t, dd = Math.hypot(x - px, y - py);
    if (!best || dd < best.dd) best = { dd, d: n.cum[i] + t * Math.sqrt(l2), px, py }; }
  return best;
}
function navFix(p) {
  if (!NAV.on) return;
  const c = p.coords; if (c.accuracy > 60) return; // trop imprécis : on attend la suivante
  const [x, y] = E.toXY(c.latitude, c.longitude), n = NAV.n;
  const prevPos = NAV.pos; NAV.pos = [x, y];
  NAV.head = c.heading != null && !isNaN(c.heading) && (c.speed || 0) > 0.8 ? c.heading : null;
  if (NAV.free) { // course libre après l'arrivée : on compte les km et les rues en plus
    if (NAV.paused) return navUI();
    const last = NAV.track[NAV.track.length - 1], d = last ? Math.hypot(x - last[0], y - last[1]) : 0;
    if (!last || (d >= Math.max(4, c.accuracy * 0.5) && d < 150)) { if (last) { NAV.extra += d; const nm = streetAt(x, y); if (nm) NAV.streets.set(nm, (NAV.streets.get(nm) || 0) + d); NAV.curFree = nm; } NAV.track.push([x, y]); }
    const tot = n.L + NAV.extra; if (tot >= NAV.km * 1000) { const pc = navElapsed() / (tot / 1000); navBuzz('km'); navSay(`${NAV.km} kilomètres. Allure ${Math.floor(pc / 60)} minutes ${Math.round(pc % 60)}.`); NAV.km = Math.floor(tot / 1000) + 1; }
    return navUI();
  }
  // départ : le chrono démarre quand on arrive au point D (ou qu'on est déjà sur le début du tracé)
  if (!NAV.t0) {
    const b = navProject(x, y, 0, 150), toStart = Math.hypot(x - n.pts[0][0], y - n.pts[0][1]);
    if (toStart <= 40 || (b && b.dd <= 25)) { NAV.t0 = Date.now(); NAV.prog = b ? b.d : 0; NAV.proj = b; navSay('C’est parti.'); }
    else { NAV.toStart = toStart; NAV.proj = null; }
    navUI(); return;
  }
  if (NAV.paused) { navUI(); return; }
  const tol = Math.max(35, Math.min(60, c.accuracy * 1.2));
  let b = navProject(x, y, NAV.prog - 60, NAV.prog + (NAV.reacq ? 2500 : 400));
  if (b && b.dd > tol && NAV.off >= 2) { const w = navProject(x, y, NAV.prog - 200, NAV.prog + 3000); if (w && w.dd < b.dd) b = w; } // on a pu couper ou sauter un bout
  NAV.reacq = false;
  if (!b) return;
  if (b.dd > tol) {
    NAV.off++; NAV.proj = b;
    if (NAV.off >= 2 && !NAV.offOn) { NAV.offOn = true; navSay('Tu t’es écarté du parcours.'); navBuzz('off'); }
  } else {
    if (NAV.offOn) { navSay('Tu es de retour sur le parcours.'); }
    NAV.off = 0; NAV.offOn = false; NAV.proj = b;
    if (b.d > NAV.prog) NAV.prog = b.d;
  }
  // annonces : virages et kilomètres
  while (NAV.mi < n.man.length - 1 && n.man[NAV.mi].d < NAV.prog + 5) NAV.mi++;
  const m = n.man[NAV.mi], dm = m.d - NAV.prog;
  if (!m.arrive && !NAV.offOn) {
    const [k] = navDir(m), verb = k === 'uturn' ? 'fais demi-tour' : (k[0] === 's' ? 'tourne légèrement à ' : 'tourne à ') + (m.a > 0 ? 'droite' : 'gauche');
    if (dm <= 120 && dm > 40 && NAV.a1 !== NAV.mi) { NAV.a1 = NAV.mi; navSay(`Dans ${navSayDist(dm)}, ${verb}${m.name ? ', ' + m.name : ''}.`); }
    else if (dm <= 25 && NAV.a2 !== NAV.mi) { NAV.a2 = NAV.mi; navBuzz('turn'); navSay(verb[0].toUpperCase() + verb.slice(1) + '.'); }
  }
  if (NAV.prog >= NAV.km * 1000 && NAV.km * 1000 < n.L - 200) { const pc = navElapsed() / (NAV.prog / 1000); navBuzz('km'); navSay(`${NAV.km} kilomètre${NAV.km > 1 ? 's' : ''}. Allure ${Math.floor(pc / 60)} minutes ${Math.round(pc % 60)}.`); NAV.km = Math.floor(NAV.prog / 1000) + 1; }
  // arrivée
  if (NAV.prog >= n.L - 30 || (NAV.prog > n.L * 0.9 && Math.hypot(x - n.pts[n.pts.length - 1][0], y - n.pts[n.pts.length - 1][1]) < 25)) return navArrive();
  navUI();
}
function navUI() {
  if (!NAV.on) return;
  const n = NAV.n, secs = navElapsed(), km = (NAV.free ? n.L + NAV.extra : NAV.prog) / 1000;
  $('#rs-done').textContent = fmt(km, 1) + ' km'; $('#rs-rest').textContent = NAV.free ? '+' + fmt(NAV.extra / 1000, 1) + ' km' : fmt(Math.max(0, n.L - NAV.prog) / 1000, 1) + ' km'; $('#rs-rest-l').textContent = NAV.free ? 'en plus' : 'restants';
  $('#rs-time').textContent = fmtClock(secs); $('#rs-pace').textContent = km > 0.2 ? fmtClock(secs / km) : '–';
  $('#run-bar').style.width = (100 * NAV.prog / n.L).toFixed(1) + '%';
  { const pb = $('#run-pause'), pre = !NAV.t0 && !NAV.free; if (pb.dataset.pre !== String(pre)) { pb.dataset.pre = pre; // avant le départ : on peut arrêter le suivi (pas de pause sans chrono)
    pb.innerHTML = pre ? '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>Arrêter le suivi' : '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h3v16H7z"/><path d="M14 4h3v16h-3z"/></svg>Pause'; } }
  let ic, big, small;
  if (NAV.free) { ic = 'straight'; big = '+' + navDistTxt(NAV.extra); small = 'Course libre' + (NAV.curFree ? ' · ' + NAV.curFree : ''); }
  else if (!NAV.t0) { ic = 'start'; big = NAV.toStart ? navDistTxt(NAV.toStart) : '…'; small = NAV.toStart ? 'Rejoins le départ · point D' : 'Recherche de ta position…'; }
  else { const m = n.man[NAV.mi] || n.man[n.man.length - 1], [k, t] = navDir(m); ic = k; big = m.arrive && NAV.prog >= n.L - 1 ? 'Arrivée' : navDistTxt(Math.max(0, m.d - NAV.prog)); small = m.arrive ? (S.mode === 'loop' && S.tab !== 'race' ? 'Arrivée · retour au départ' : 'Arrivée') : t + (m.name ? ' · ' + m.name : ''); }
  if (NAV.icK !== ic) { $('#run-ic').innerHTML = runIco(ic); NAV.icK = ic; }
  $('#run-dist').textContent = big; $('#run-street').textContent = small;
  const cur = NAV.free ? '' : NAV.t0 ? (n.runs.find(q => q.d0 <= NAV.prog + 1 && q.d1 >= NAV.prog - 1) || {}).name : ''; $('#run-cur').textContent = cur ? 'Tu es sur ' + cur : ''; $('#run-cur').hidden = !cur;
  if (NAV.offOn) { const d = NAV.proj ? NAV.proj.dd : 0; navMsg('err', 'Tu t’es écarté du parcours', `Le tracé est à ${navDistTxt(d)} : suis le pointillé rouge pour le rejoindre.`); NAV.errShown = true; }
  else if (NAV.errShown) { NAV.errShown = false; navMsg(null); $('#run-nav').hidden = false; }
  if (NAV.follow && NAV.pos) navCenter(); else draw();
}
function navCenter() {
  const r = cv.getBoundingClientRect(), top = $('.run-top').getBoundingClientRect().bottom - r.top, bot = $('.run-panel').getBoundingClientRect().top - r.top;
  const [x, y] = NAV.pos;
  if (!NAV.t0) { // avant le départ : on cadre ta position et le point D
    const [sx, sy] = NAV.n.pts[0], w = Math.abs(sx - x) + 160, h = Math.abs(sy - y) + 160;
    V.s = Math.max(0.15, Math.min(1.2, (r.width - 32) / w, (bot - top - 32) / h)); V.tx = r.width / 2 - (x + sx) / 2 * V.s; V.ty = (top + bot) / 2 - (y + sy) / 2 * V.s; return draw();
  }
  if (NAV.wasPre) { NAV.wasPre = false; V.s = Math.max(V.s, 0.9); }
  V.tx = r.width / 2 - x * V.s; V.ty = (top + bot) / 2 + 20 - y * V.s; draw();
}
// dessin sur la carte (appelé depuis render) : partie déjà courue, position, écart au tracé
function navDrawDone(px) {
  if (NAV.on && NAV.free && NAV.track.length > 1) { const q = new Path2D(); NAV.track.forEach(([x, y], i) => i ? q.lineTo(x, y) : q.moveTo(x, y)); ctx.strokeStyle = colors.casing; ctx.lineWidth = px(8); ctx.stroke(q); ctx.strokeStyle = css('--route-done'); ctx.lineWidth = px(4.5); ctx.stroke(q); }
  if (!NAV.on || !NAV.t0 || NAV.prog <= 0) return;
  const n = NAV.n, k = n.idx(NAV.prog), p = new Path2D(); p.moveTo(n.pts[0][0], n.pts[0][1]);
  for (let i = 1; i <= k; i++) p.lineTo(n.pts[i][0], n.pts[i][1]); const e = n.at(NAV.prog); p.lineTo(e[0], e[1]);
  ctx.strokeStyle = colors.casing; ctx.lineWidth = px(8); ctx.stroke(p); ctx.strokeStyle = css('--route-done'); ctx.lineWidth = px(4.5); ctx.stroke(p);
}
// noms des rues du parcours, posés sur le tracé (D-80) : en course, et dès qu'on zoome sur un parcours
function drawRouteNames() {
  const R = S.route; if (!R || !(NAV.on || V.s >= 0.45)) return;
  const n = NAV.on ? NAV.n : (R._nav || (R._nav = navBuild(R)));
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = `700 12px ${css('--f-body')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const boxes = [];
  for (const run of n.runs) {
    if (NAV.on && NAV.t0 && run.d1 < NAV.prog) continue; // en course : seulement les rues à venir
    const tw = ctx.measureText(run.name).width; if ((run.d1 - run.d0) * V.s < Math.min(tw + 40, 70)) continue;
    const dm = (run.d0 + run.d1) / 2, a = n.at(dm - 12), b = n.at(dm + 12), [mx, my] = n.at(dm), cx = mx * V.s + V.tx, cy = my * V.s + V.ty;
    if (cx < 0 || cy < 0 || cx > W || cy > H) continue;
    let ang = Math.atan2(b[1] - a[1], b[0] - a[0]); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
    const hw = Math.abs(Math.cos(ang)) * (tw / 2 + 6) + Math.abs(Math.sin(ang)) * 10, hh = Math.abs(Math.sin(ang)) * (tw / 2 + 6) + Math.abs(Math.cos(ang)) * 10;
    if (boxes.some(q => Math.abs(q[0] - cx) < q[2] + hw && Math.abs(q[1] - cy) < q[3] + hh)) continue; boxes.push([cx, cy, hw, hh]);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-tw / 2 - 6, -10, tw + 12, 20, 4) : ctx.rect(-tw / 2 - 6, -10, tw + 12, 20); ctx.fillStyle = colors.panel; ctx.fill(); ctx.strokeStyle = colors.route; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = colors.ink; ctx.fillText(run.name, 0, 0.5); ctx.restore();
  }
  ctx.restore();
}
function navDrawMe() {
  if (!NAV.on || !NAV.pos) return;
  const [x, y] = NAV.pos, sx = x * V.s + V.tx, sy = y * V.s + V.ty;
  if (NAV.offOn && NAV.proj) { const qx = NAV.proj.px * V.s + V.tx, qy = NAV.proj.py * V.s + V.ty; ctx.save(); ctx.strokeStyle = css('--err'); ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(qx, qy); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(qx, qy, 5, 0, 7); ctx.fillStyle = colors.panel; ctx.fill(); ctx.stroke(); ctx.restore(); }
  let h = NAV.head; if (h == null && NAV.free) { const t = NAV.track, a = t[Math.max(0, t.length - 3)] || NAV.pos; h = a === NAV.pos ? 0 : Math.atan2(NAV.pos[0] - a[0], -(NAV.pos[1] - a[1])) * 180 / Math.PI; } if (h == null) { const n = NAV.n, a = NAV.t0 ? n.at(NAV.prog) : NAV.pos, b = NAV.t0 ? n.at(NAV.prog + 15) : n.pts[0]; h = Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180 / Math.PI; } // cap : 0 = nord, sens horaire
  ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, 22, 0, 7); ctx.fillStyle = colors.ink; ctx.globalAlpha = 0.1; ctx.fill(); ctx.globalAlpha = 1;
  ctx.translate(sx, sy); ctx.rotate(h * Math.PI / 180); ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(10, 11); ctx.lineTo(0, 5); ctx.lineTo(-10, 11); ctx.closePath();
  ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = colors.panel; ctx.stroke(); ctx.fillStyle = colors.ink; ctx.fill(); ctx.restore();
}
if (/[?&]navtest=1/.test(location.search)) window.RP_NAV = NAV; // recette automatique uniquement
$('#run-go').onclick = runPrep;
$('#runp-x').onclick = $('#runp-back').onclick = () => { $('#runp').hidden = true; };
$('#runp-go').onclick = () => { if (NAV.denied) { NAV.denied = false; if (NATIVE) { $('#runp').hidden = true; return NP.bg.openSettings().catch(() => {}); } return location.reload(); } runStart(); };
$('#runperm-go').onclick = () => { $('#runperm').hidden = true; runPrep.asked = true; NP.geo.requestPermissions({ permissions: ['location'] }).then(() => runPrep(), () => runPrep()); };
$('#runperm-later').onclick = $('#runperm-back').onclick = () => { $('#runperm').hidden = true; };
$('#run-vol').onclick = () => { NAV.voice = !NAV.voice; $('#run-vol').setAttribute('aria-pressed', NAV.voice); if (!NAV.voice) try { speechSynthesis.cancel(); } catch (e) {} };
$('#run-pos').onclick = () => { NAV.follow = true; $('#run-pos').setAttribute('aria-pressed', true); if (NAV.pos) navCenter(); };
$('#run-pause').onclick = () => { if (!NAV.t0) return runFinish(false); NAV.paused = true; NAV.pauseAt = Date.now(); $('#rz-done').textContent = fmt(NAV.prog / 1000, 1) + ' km'; $('#rz-of').textContent = 'faits sur ' + fmt(NAV.n.L / 1000, 1); $('#rz-time').textContent = fmtClock(navElapsed()); $('#runz').hidden = false; };
const runResume = () => { if (NAV.paused) { NAV.pausedMs += Date.now() - NAV.pauseAt; NAV.paused = false; NAV.reacq = true; } $('#runz').hidden = true; navUI(); };
$('#runz-go').onclick = runResume; $('#runz-x').onclick = runResume; $('#runz-back').onclick = runResume;
$('#runa-end').onclick = () => runFinish(true); $('#runa-go').onclick = navContinue;
$('#runz-end').onclick = () => { if (NAV.paused) { NAV.pausedMs += Date.now() - NAV.pauseAt; NAV.paused = false; NAV.pauseAt = 0; } runFinish(false); };
document.addEventListener('visibilitychange', () => {
  if (!NAV.on) return;
  if (document.hidden) { NAV.hiddenAt = Date.now(); return; }
  navWake(); const gap = NAV.hiddenAt ? (Date.now() - NAV.hiddenAt) / 1000 : 0; NAV.hiddenAt = 0;
  if (gap > 15 && NAV.t0 && !NAV.paused && !NATIVE) { NAV.reacq = true; navMsg('warn', `Suivi interrompu ${gap >= 90 ? Math.round(gap / 60) + ' min' : Math.round(gap) + ' s'}`, 'L’écran s’est verrouillé. Ta position a repris, la distance est recalculée.', 8000); }
});
addEventListener('beforeunload', e => { if (NAV.on && NAV.t0) { e.preventDefault(); e.returnValue = ''; } });
// ---------- Mes parcours et parcours envoyés (D-81) ----------
// Les sorties faites restent sur l'appareil (runparis-done) ; chaque sortie garde son tracé compact pour être refaite ou envoyée.
const MINE_K = 'runparis-done';
function mineLoad() { try { const L = JSON.parse(localStorage.getItem(MINE_K) || '[]'); return Array.isArray(L) ? L : []; } catch (e) { return []; } }
function mineSave(L) { try { localStorage.setItem(MINE_K, JSON.stringify(L.slice(0, 200))); } catch (e) {} }
function minePatch(id, patch) { const L = mineLoad(), e = L.find(x => x.id === id); if (e) { Object.assign(e, patch); mineSave(L); } }
// tracé compact : simplifié à ~4 m (Douglas-Peucker) puis encodé en « polyline » (5 décimales)
function simplifyPts(P, tol) {
  if (P.length < 3) return P.slice(); const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1; const st = [[0, P.length - 1]];
  while (st.length) { const [a, b] = st.pop(); const [ax, ay] = P[a], [bx, by] = P[b], vx = bx - ax, vy = by - ay, l = Math.hypot(vx, vy) || 1e-9; let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = l < 1 ? Math.hypot(P[i][0] - ax, P[i][1] - ay) : Math.abs((P[i][0] - ax) * vy - (P[i][1] - ay) * vx) / l; /* boucle : début = fin */ if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return P.filter((_, i) => keep[i]);
}
function encPoly(ll) { let s = '', pa = 0, po = 0; const enc = v => { v = v < 0 ? ~(v << 1) : v << 1; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } s += String.fromCharCode(v + 63); };
  for (const [la, lo] of ll) { const a = Math.round(la * 1e5), o = Math.round(lo * 1e5); enc(a - pa); enc(o - po); pa = a; po = o; } return s; }
function decPoly(s) { const out = []; let i = 0, la = 0, lo = 0; const dec = () => { let r = 0, sh = 0, b; do { if (i >= s.length) return null; b = s.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20); return r & 1 ? ~(r >> 1) : r >> 1; };
  while (i < s.length) { const a = dec(), o = dec(); if (a == null || o == null) break; la += a; lo += o; out.push([la / 1e5, lo / 1e5]); } return out; }
function routeCode(r) { const P = routePts(r); if (!P || P.length < 2) return ''; return encPoly(simplifyPts(P, 4).map(([x, y]) => E.toLL(x, y))); }
function routeFromCode(code) { const ll = decPoly(code || ''); if (ll.length < 2) return null; const st = geomRoute(ll.map(([la, lo]) => E.toXY(la, lo))); st.kind = 'shared'; return st; }
const mineTitle = d => d.race ? d.dep : d.loop ? 'Boucle · ' + d.dep : d.dep + ' → ' + (d.arr || 'arrivée');
function sendLink(code, title, km) {
  if (!code) return toast('Ce parcours ne peut pas être envoyé.');
  const url = (NATIVE ? WEB_APP : location.origin + location.pathname) + '?p=' + code + '&n=' + encodeURIComponent(title || '');
  track('envoi', 'Parcours envoyé');
  if (NATIVE) { NP.share.share({ title: 'Un parcours RunParis', text: `${title} · ${fmt(km, 1)} km`, url }).catch(() => {}); return; }
  if (navigator.share && MOB.matches) { navigator.share({ title: 'Un parcours RunParis', text: `${title} · ${fmt(km, 1)} km`, url }).catch(() => {}); return; }
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Lien du parcours copié : colle-le dans un message.', 3500), () => { prompt('Copie ce lien :', url); });
}
// ouvrir un parcours précis (lien reçu ou « Refaire ce parcours ») : affiché tel quel, prêt à suivre, exporter ou faire
function openFixed(code, title, received) {
  const st = routeFromCode(code); if (!st) { toast('Ce lien de parcours est incomplet.', 3500); return false; }
  if (S.tab !== 'gen') setTab('gen');
  const P = st.geom, a = P[0], b = P[P.length - 1], loop = Math.hypot(a[0] - b[0], a[1] - b[1]) < 150, ll = p => { const [la, lo] = E.toLL(p[0], p[1]); return { lat: la, lon: lo }; };
  const near = p => { const ns = nearestStation(p[0], p[1]); return ns && ns.d < 300 ? ns.s.n : 'Point sur la carte'; };
  setPoint('start', Object.assign(ll(a), { name: near(a) }));
  setArrival(loop ? 'back' : 'place'); if (!loop) setPoint('end', Object.assign(ll(b), { name: near(b) }));
  setUnit('km'); $('#km').value = clampKm(Math.round(st.len / 100) / 10); updateConv();
  S.route = st; S.alts = [st]; S.lastTarget = st.len; S.lastD = null;
  const t = title || mineTitle({ loop, dep: 'ce départ', arr: '' });
  S.baseNotes = [{ info: true, t: received ? `Parcours reçu : ${t}, ${fmt(st.len / 1000)} km. Suis-le, exporte-le ou touche « Modifier » pour créer le tien.` : `${t} : le même tracé que ta sortie, ${fmt(st.len / 1000)} km.` }];
  renderAlts(); renderSummary(); showRoute(st, S.baseNotes.concat(routeNotes(st))); showView('res'); fitRoute();
  if ($('#done')) $('#done').setAttribute('aria-pressed', false);
  return true;
}
function mineThumb(code) {
  const ll = decPoly(code || ''); if (ll.length < 2) return `<span class="mine-th old" aria-hidden="true"><svg class="ico" viewBox="0 0 24 24"><path d="M6 21V4"/><path d="M6 4h11l-2.5 4L17 12H6"/></svg></span>`;
  const xy = ll.map(([la, lo]) => E.toXY(la, lo)); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of xy) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const s = 40 / Math.max(x1 - x0, y1 - y0, 1), ox = 28 - (x0 + x1) / 2 * s, oy = 28 - (y0 + y1) / 2 * s, d = 'M' + xy.map(([x, y]) => (x * s + ox).toFixed(1) + ' ' + (y * s + oy).toFixed(1)).join(' L');
  return `<span class="mine-th" aria-hidden="true"><svg viewBox="0 0 56 56" width="56" height="56"><path d="${d}" fill="none" stroke="var(--route-casing)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/><path d="${d}" fill="none" stroke="var(--route)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/></svg></span>`;
}
const mineDate = (iso, o) => new Date(iso).toLocaleDateString('fr-FR', o || { weekday: 'long', day: 'numeric', month: 'short' }).replace(/^./, c => c.toUpperCase());
function renderMine() {
  const L = mineLoad(), items = $('#mine-items'); items.innerHTML = '';
  $('#mine-detail').hidden = true; $('#mine-list').hidden = false;
  $('#mine-empty').hidden = !!L.length; $('#mine-tot').hidden = !L.length;
  const km = L.reduce((t, e) => t + (e.km || 0), 0), secs = L.reduce((t, e) => t + (e.secs || 0), 0);
  const h = Math.floor(secs / 3600), mn = Math.round(secs % 3600 / 60);
  $('#mine-tot').innerHTML = `<div><b>${L.length}</b><span>sortie${L.length > 1 ? 's' : ''}</span></div><div><b>${fmt(km, 1)} km</b><span>au total</span></div>` + (secs ? `<div><b>${h ? h + ' h ' + String(mn).padStart(2, '0') : mn + ' min'}</b><span>de course</span></div>` : '');
  let month = '';
  L.forEach((e, i) => {
    const m = mineDate(e.d, { month: 'long', year: 'numeric' }); if (m !== month) { month = m; const hh = document.createElement('div'); hh.className = 'lbl mine-m'; hh.textContent = m; items.appendChild(hh); }
    const b = document.createElement('button'); b.type = 'button'; b.className = 'race mine-card';
    b.innerHTML = mineThumb(e.g) + '<span class="mine-tx"><span class="k"></span><span class="t"></span><span class="s"></span></span><span class="n"></span>';
    b.querySelector('.k').textContent = mineDate(e.d, { weekday: 'long', day: 'numeric', month: 'short' }) + (e.secs ? (e.meas ? ' · mesuré' : ' · estimé') : '');
    b.querySelector('.t').textContent = e.t || mineTitle(e);
    b.querySelector('.s').textContent = [e.secs ? fmtClock(e.secs) : '', e.secs && e.km ? fmtClock(e.secs / e.km) + ' /km' : '', e.up != null ? e.up + ' m D+' : ''].filter(Boolean).join(' · ');
    b.querySelector('.n').innerHTML = `${fmt(e.km || 0, 1)}<small> km</small>`;
    b.onclick = () => mineOpen(i);
    items.appendChild(b);
  });
}
function mineOpen(i) {
  const e = mineLoad()[i]; if (!e) return renderMine();
  S.mineCur = e.id || e.d;
  $('#mine-list').hidden = true; $('#mine-detail').hidden = false; $('#view-mine').scrollTop = 0;
  $('#md-t').textContent = e.t || mineTitle(e);
  $('#md-sub').textContent = mineDate(e.d, { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + new Date(e.d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + (e.secs ? (e.meas ? ' · mesuré pendant ta course' : ' · temps estimé ou saisi') : '');
  $('#md-km').innerHTML = `${fmt(e.km || 0, 1)}<small>km</small>`;
  $('#md-stats').innerHTML = (e.secs ? `<div><b>${fmtClock(e.secs)}</b><span>temps</span></div><div><b>${fmtClock(e.secs / (e.km || 1))}</b><span>allure /km</span></div>` : '') + (e.up != null ? `<div><b>${e.up} m</b><span>D+</span></div>` : '');
  const x = e.extra; $('#md-extra').hidden = !(x && x.km); if (x && x.km) $('#md-extra').textContent = `Dont ${fmt(x.km, 1)} km en plus après l’arrivée${x.streets && x.streets.length ? ' (' + x.streets.join(', ') + ')' : ''}.`;
  const has = !!(e.g && decPoly(e.g).length > 1);
  $('#md-old').hidden = has; $('#md-redo').hidden = !has; $('#md-row').hidden = !has;
  // la carte montre la sortie
  if (has) { const st = routeFromCode(e.g); S.route = st; S.alts = [st]; fitRoute(); } else { S.route = null; S.alts = []; }
  draw();
}
function mineCurrent() { return mineLoad().find(x => (x.id || x.d) === S.mineCur); }
$('#tab-mine').onclick = () => setTab('mine');
$('#mine-new').onclick = () => setTab('gen');
$('#mine-back').onclick = () => { renderMine(); S.route = null; S.alts = []; draw(); };
$('#md-redo').onclick = () => { const e = mineCurrent(); if (e && openFixed(e.g, e.t || mineTitle(e), false)) track('refaire', 'Parcours refait'); };
$('#md-send').onclick = () => { const e = mineCurrent(); if (e) sendLink(e.g, e.t || mineTitle(e), e.km); };
$('#md-img').onclick = () => { const e = mineCurrent(); if (!e || !e.g) return; const st = routeFromCode(e.g); if (!st) return;
  const P = st.geom; SH.data = { pts: P, km: e.km, up: e.up || Math.round(st.up), loop: !!e.loop, dep: e.dep || '', arr: e.arr || '', race: !!e.race, date: new Date(e.d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) };
  SH.photo = null; SH.bg = 'map'; SH.ly = 'big'; SH.extra = null; $('#shx-time').value = fmtClock(e.secs || e.km * pace()); $('#shx').hidden = false; shOut(); };
$('#md-del').onclick = () => {
  const L = mineLoad(), i = L.findIndex(x => (x.id || x.d) === S.mineCur); if (i < 0) return; const [gone] = L.splice(i, 1); mineSave(L);
  renderMine(); S.route = null; S.alts = []; draw();
  const t = $('#toast'); t.innerHTML = ''; t.append('Sortie retirée'); const u = document.createElement('button'); u.type = 'button'; u.className = 'undo'; u.textContent = 'Annuler';
  u.onclick = () => { const M2 = mineLoad(); M2.splice(Math.min(i, M2.length), 0, gone); mineSave(M2); if (S.tab === 'mine') renderMine(); t.hidden = true; };
  t.appendChild(u); t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 5000);
};
$('#send').onclick = () => { if (!S.route) return; const d = shareData(); sendLink(routeCode(S.route), d ? mineTitle(d) : '', S.route.len / 1000); };
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
  try { const r = await fetch(NATIVE ? 'https://runparis.netlify.app/' : '/', { method: 'POST', mode: NATIVE ? 'no-cors' : 'cors', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() }); if (!NATIVE && !r.ok) throw new Error(r.status);
    $('#fb').close(); $('#fb-msg').value = ''; toast('Merci ! Ton message a bien été envoyé.'); track('signalement', $('#fb-type').value);
  } catch (e) { $('#fb-err').textContent = 'Envoi impossible pour le moment (connexion ?). Réessaie dans un instant.'; $('#fb-err').hidden = false; }
  finally { $('#fb-send').disabled = false; }
};
$('#attrib-more').onclick = () => toast('Rues, arbres, métro, parcs : © contributeurs OpenStreetMap (ODbL). Altitudes : IGN RGE ALTI. Quartiers : Paris Open Data. Parcours mythiques : tracés issus de fichiers GPX publics.', 7000);
// public site: the logo leads back to the welcome page
if (!window.claude && /app\.html$/.test(location.pathname)) { const l = $('.logo'); const a = document.createElement('a'); a.href = './'; a.className = 'logo'; a.setAttribute('aria-label', 'RunParis, accueil'); a.innerHTML = l.innerHTML; l.replaceWith(a); }
// ---------- mobile : réglages en phrase + feuilles (D-74) ----------
// Sur téléphone, les contrôles existants sont déplacés dans des feuilles ; sur ordinateur, rien ne change.
var MPHR = false, MCUR = null, MHOLD = {};
const MSH = {
  dist: { t: 'Distance', ok: () => 'Valider ' + $('#mf-dist').textContent, nodes: () => [$('#u-km').parentElement, document.querySelector('.stepper'), $('#chips-km'), $('#chips-min'), $('#conv').parentElement] },
  dep: { t: 'Départ', ok: null, nodes: () => [$('#start-box'), $('#home-row')] },
  arr: { t: 'Arrivée', ok: () => 'Valider', nodes: () => [$('#a-back').parentElement, $('#end-fixed'), $('#end-free-hint'), $('#end-metro-row'), $('#via-list'), $('#via-box')] },
  prefs: { t: 'Préférences', ok: () => 'Appliquer', nodes: () => ['Type de parcours', $('#k-classic').parentElement, $('#k-hint'), 'Dénivelé', $('#d-flat').parentElement, $('#dplus-row'), document.querySelector('.depline'), $('#dep-hint'), $('#sig-on').closest('label'), $('#sig-level'), $('#prefer-paths').closest('label'), $('#water-on').closest('label'), $('#allow-repeat').closest('label'), $('#avoid-cem').closest('label')] },
  avoid: { t: 'À éviter', ok: () => 'Valider', nodes: () => [$('#avoid-list'), $('#addbox'), $('#always')] }
};
function mMount() {
  if (MPHR) return; MPHR = true;
  for (const [k, d] of Object.entries(MSH)) {
    const h = document.createElement('div'); h.className = 'mhold'; h.hidden = true; h.dataset.sh = k; h._moved = [];
    for (const n of d.nodes()) {
      if (typeof n === 'string') { const l = document.createElement('span'); l.className = 'lbl'; l.textContent = n; h.appendChild(l); continue; }
      if (!n) continue; const ph = document.createComment('m'); n.parentNode.insertBefore(ph, n); h._moved.push([n, ph]); h.appendChild(n);
    }
    MHOLD[k] = h; $('#msheet-b').appendChild(h);
  }
  $('#view-set').classList.add('m-on'); $('#mset').hidden = false; msync();
}
function mUnmount() {
  if (!MPHR) return; mClose(); MPHR = false;
  for (const [k, h] of Object.entries(MHOLD)) { for (const [n, ph] of h._moved) { ph.parentNode.insertBefore(n, ph); ph.remove(); } h.remove(); delete MHOLD[k]; }
  $('#view-set').classList.remove('m-on'); $('#mset').hidden = true;
}
function mOpen(k, focus) {
  if (!MPHR) return; MCUR = k;
  for (const [j, h] of Object.entries(MHOLD)) h.hidden = j !== k;
  $('#msheet-t').textContent = MSH[k].t;
  const ok = MSH[k].ok; $('#msheet-f').hidden = !ok; if (ok) $('#msheet-ok').textContent = ok();
  if (k === 'dep') $('#start-box').hidden = false;
  if (k === 'avoid' && $('#addbox').hidden && !document.querySelector('#avoid-list .xchip')) $('#addbox').hidden = false;
  $('#mback').hidden = false; $('#msheet').hidden = false; $('#msheet-b').scrollTop = 0;
  if (focus === 'start') $('#start-q').focus(); else if (focus === 'end') $('#end-q').focus();
}
function mClose() { if (!MCUR) return; MCUR = null; $('#msheet').hidden = true; $('#mback').hidden = true; msync(); }
const mShort = n => { if (!n) return ''; if (/^Chez moi/.test(n)) return 'chez moi'; if (n === 'Ma position') return 'ma position'; n = n.replace(/^Point sur la carte · /, ''); return n.length > 24 ? n.slice(0, 23) + '…' : n; };
function msync() {
  if (!MPHR) return;
  const km = parseFloat(String($('#km').value).replace(',', '.')), mn = parseFloat($('#dur').value);
  $('#mf-dist').textContent = S.unit === 'min' ? (mn >= 60 ? `${Math.floor(mn / 60)} h${mn % 60 ? ' ' + String(Math.round(mn % 60)).padStart(2, '0') : ''}` : `${Math.round(mn || 0)} min`) : `${fmt(km || 0, km % 1 ? 1 : 0)} km`;
  $('#mf-arr').textContent = S.mode === 'loop' ? 'en boucle' : S.endFree ? 'droit devant' : S.end ? 'jusqu’à ' + mShort(S.end.name) : 'jusqu’à un lieu';
  $('#mf-dep').textContent = S.start ? mShort(S.start.name) : 'choisis ton départ';
  const kind = { classic: 'Classique', green: 'Vert', discover: 'Découverte' }[S.kind] || 'Classique';
  const dn = { flat: 'Plat', any: 'Normal', target: 'Vallonné' }[S.dmode] || 'Normal';
  const p = [kind, dn, $('#sig-on').checked ? 'feux évités' : 'feux ignorés'];
  if ($('#prefer-paths').checked) p.push('parcs'); if ($('#water-on').checked) p.push('eau tous les 3 km');
  if (S.depNow === false && $('#dep-time').value) p.push('départ ' + $('#dep-time').value.replace(':', ' h '));
  $('#mf-prefs').textContent = p.join(' · ');
  const xs = [...document.querySelectorAll('#avoid-list .xchip .name')].map(e => e.textContent);
  $('#mf-avoid').textContent = xs.length ? `À éviter : ${xs.slice(0, 2).join(', ')}${xs.length > 2 ? ' +' + (xs.length - 2) : ''}` : 'Éviter un quartier ou un lieu';
  if (MCUR && MSH[MCUR].ok) $('#msheet-ok').textContent = MSH[MCUR].ok();
  if (MOB.matches && S.view === 'set' && sheet === 'half') setSheet('half');
}
document.querySelectorAll('#mset [data-sh]').forEach(b => b.onclick = () => mOpen(b.dataset.sh, b.dataset.sh === 'dep' && !S.start ? 'start' : null));
$('#mback').onclick = mClose; $('#msheet-x').onclick = mClose; $('#msheet-ok').onclick = mClose;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && MCUR) mClose(); });
['click', 'change', 'input'].forEach(ev => document.addEventListener(ev, () => setTimeout(msync, 0)));
const mApply = () => { if (MOB.matches) mMount(); else mUnmount(); const sec = APPF && MOB.matches; /* « Suivre le parcours » est le principal seulement dans l'application */ $('#gpx').classList.toggle('primary', !sec); $('#gpx').classList.toggle('ghost', sec); };
MOB.addEventListener('change', mApply);

boot();
})();
</script>
