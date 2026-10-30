// ---- passages superposés : rééchantillonner le tracé, trouver où il repasse sur lui-même et donner une voie à chaque passage
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
    if (js.length) { // un passage antérieur = une suite d'échantillons consécutifs ; on compte les passages dans le même sens
      js.sort((a, b) => a - b); let same = 0, tot = 0, prev = -99;
      for (const j of js) { if (j - prev > 6) { tot++; if (tx[i] * tx[j] + ty[i] * ty[j] > 0) same++; } prev = j; }
      lane[i] = 1 + 2 * Math.min(same, 3); pass[i] = Math.min(tot, 3); any = true;
    }
    const k = key(x, y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
  }
  // le premier passage prend lui aussi sa voie là où un passage suivant revient sur lui
  if (any) for (let i = 0; i < n; i++) if (lane[i]) {
    const [x, y] = pts[i]; const cx = Math.floor(x / C), cy = Math.floor(y / C);
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) for (const j of grid.get(gx + ',' + gy) || []) if (j < i - 10 && !lane[j] && Math.hypot(pts[j][0] - x, pts[j][1] - y) <= 12) lane[j] = 1;
  }
  // changements de voie lissés sur ~40 m : la ligne glisse d'une voie à l'autre
  const sm = new Float32Array(n); for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = -5; k <= 5; k++) { const j = i + k; if (j >= 0 && j < n) { s += lane[j]; c++; } } sm[i] = s / c; }
  // un passage de moins de ~50 m est du bruit (traversée, coin) : il garde la couleur de ce qui l'entoure
  for (let i = 0; i < n;) { let j = i; while (j < n && pass[j] === pass[i]) j++; if (j - i < 6 && i > 0) for (let k = i; k < j; k++) pass[k] = pass[i - 1]; i = j; }
  return (R._lanes = { pts, tx, ty, lane: sm, pass, any });
}
// ligne d'un parcours en mètres de carte : depuis les tronçons de rue, ou depuis un tracé GPX (parcours mythiques)
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
// parcours à partir d'une ligne (x, y en mètres) : longueur, D+ lissé, feux traversés, rues et quartiers
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
  let gl = 0; // part de vert d'après le tronçon de rue le plus proche
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
  if (!RACES.length) { $('#race-filter').innerHTML = ''; box.innerHTML = CITY === 'paris' ? '<p class="hint">Tracés indisponibles (données non chargées).</p>' : ''; return; }
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
    if (S.race === race) box.appendChild(det); // le détail s'ouvre juste sous le parcours choisi
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
  // les 3 km les plus pentus
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

// résumé des réglages utilisés pour les résultats affichés
function renderSummary() {
  const kf = v => fmt(v, v % 1 ? 1 : 0); const kmTxt = S.unit === 'min' ? `${$('#dur').value} min (${fmt(S.lastKm || 0)} km)` : `${kf(S.lastKm || parseFloat($('#km').value) || 0)} km`;
  const where = !S.start ? '—' : /^Chez moi/.test(S.start.name) ? 'Chez moi' : S.start.name.replace(/^Point sur la carte · /, '');
  const mode = (S.kind === 'green' ? 'Vert · ' : S.kind === 'discover' ? 'Découverte · ' : '') + (S.mode === 'loop' ? 'Boucle' : S.endFree ? 'Aller simple' : `Jusqu'à ${S.end ? S.end.name : 'l’arrivée'}`);
  $('#sum-t').textContent = `${mode} · ${kmTxt} · ${where}`;
  const d = S.dmode === 'flat' ? 'Plat' : S.dmode === 'target' ? `Vallonné (D+ ${$('#dplus').value} m)` : 'Dénivelé normal';
  const f = PRIO[S.prio || 'eq'].txt;
  const n = S.exclQ.size ? `${S.exclQ.size} quartier${S.exclQ.size > 1 ? 's' : ''} évité${S.exclQ.size > 1 ? 's' : ''}` : '';
  const pl = S.places.length ? `${S.places.length} lieu${S.places.length > 1 ? 'x' : ''} évité${S.places.length > 1 ? 's' : ''}` : '';
  $('#sum-s').textContent = [d, f, $('#prefer-paths').checked ? 'parcs et quais' : '', n, pl, $('#allow-repeat').checked ? 'allers-retours permis' : '', S.vias.length ? 'par ' + S.vias.map(v => v.name.replace(/^Point · /, '')).join(', ') : '', S.mode === 'ab' && S.endFree && $('#end-metro').checked && !S.vias.length && S.kind !== 'discover' ? 'arrivée à un métro' : '', $('#water-on').checked ? 'points d’eau' : '', S.depNow === false && S.lastDep ? 'départ ' + hhmm(S.lastDep.dep) : ''].filter(Boolean).join(' · ');
}
new ResizeObserver(resize).observe(cv);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });



// ---------- générer ----------
let busy = false;
// ---------- vérification des réglages ----------
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

// ---------- générer ----------
function fail(msgs) { S.route = null; S.alts = []; renderAlts(); renderSummary(); showRoute(null, msgs); showView('res'); draw(); }
async function generate(isAgain) {
  if ($('#done')) $('#done').setAttribute('aria-pressed', false);
  if (!G || busy) return; mClose();
  const notes = [], errs = [];
  if (!S.start) { showView('set'); openStart(true); toast('Choisis d’abord ton départ : un lieu, une rue ou un point sur la carte.'); return; }
  if (S.tab !== 'race') lastSave();
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
    E.setConstraints(S.exclQ, S.places, { avoidCemeteries: true, closedEdges: closed.flatMap(p => p.e) });
    const tpk = dplus != null ? dplus / km : 0, nat = 5; // ~5 m de D+ par km sur une boucle moyenne à Paris (D+ lissé)
    const climb = S.dmode === 'flat' ? 30 : dplus == null ? 0 : tpk > nat ? -Math.min(30, 4 + (tpk - nat) * 3) : (nat - tpk) * 2;
    const allowRepeat = $('#allow-repeat').checked;
    const green = S.kind === 'green';
    E.setWeights({ climb, ...PRIO[S.prio || 'eq'].w, path: $('#prefer-paths').checked || green ? -0.3 : 0, reuse: allowRepeat ? 1 : 4, green: green ? 0.7 : 0, road: green ? [0, 0.3, 0.6, 0.9] : S.prio === 'turn' ? PRIO.turn.w.road : [0, 0.15, 0.35, 0.6] , dark: S.lastDep.night ? 2.5 : 0, crowd: $('#avoid-crowd').checked ? crowdAt(dep) : 0 });
    const opt = { seed: S.seed * 7919 + 13, sigScore: PRIO[S.prio || 'eq'].score, dplus, flat: S.dmode === 'flat', hill: dplus != null && tpk > nat, allowRepeat, green, simple: S.prio === 'turn' };
    opt.night = S.lastDep.night; S.lastOpt = opt;
    if ($('#water-on').checked && FONT.length) { // carrefours tout près d'une fontaine (zones autorisées seulement)
      const set = new Set(), pts = []; for (const f of FONT) { const n = E.nearest(f.x, f.y); if (n >= 0 && Math.hypot(G.NX[n] - f.x, G.NY[n] - f.y) <= 30 && !set.has(n)) { set.add(n); pts.push({ n, x: G.NX[n], y: G.NY[n] }); } }
      opt.water = { set, pts, every: 3000 };
    }
    const ab = S.mode === 'ab', A = 'le départ';
    const [sx, sy] = E.toXY(S.start.lat, S.start.lon);
    const s = snapNode(sx, sy);
    if (s < 0) errs.push(`Aucune rue accessible autour de ${A} avec ces exclusions. Réautorise un quartier proche ou retire un lieu évité.`);
    else {
      const snapD = Math.hypot(G.NX[s] - sx, G.NY[s] - sy);
      if (snapD > 250) notes.push(`${ab ? 'A est' : 'Ton départ est'} dans une zone évitée : le parcours part de la rue autorisée la plus proche (${Math.round(snapD)} m).`);
      const prog = f => bar.style.width = (5 + f * 95) + '%';
      // lieux par où passer, ou découverte de lieux connus
      let endN = null;
      if (ab && !S.endFree) {
        const [ex, ey] = E.toXY(S.end.lat, S.end.lon); endN = snapNode(ex, ey);
        if (endN < 0) errs.push('Aucune rue accessible autour de l’arrivée avec ces exclusions.');
        else if (endN === s || Math.hypot(ex - sx, ey - sy) < 30) errs.push('Le départ et l’arrivée sont au même endroit. Choisis « En boucle » ou « N’importe où ».');
      }
      const endArg = !ab ? s : S.endFree ? 'free' : endN;
      if (errs.length) { /* signalé plus bas */ }
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
        if ($('#end-metro').checked && METRO.st.length) { // finir à une station : le carrefour autorisé le plus proche de chacune
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
      // la 3e proposition montre l'autre côté du compromis : « Le plus simple » ou « Le moins de feux » (D-95)
      if (r && r.alts && !r.shortest && !S.vias.length && S.kind !== 'discover') {
        const side = S.prio === 'turn' ? 'few' : 'simple', other = side === 'few' ? PRIO.few : PRIO.turn;
        const per = a => side === 'few' ? a.feux / (a.len / 1000) : E.turnStats(a.edges).turns / (a.len / 1000), fk = a => a.feux / (a.len / 1000);
        E.setWeights(other.w); const o2 = Object.assign({}, opt, { sigScore: other.score, seed: opt.seed + 977, simple: !!other.simple }); let r2 = null;
        try { r2 = !ab ? await E.loop(s, target, o2, () => {}) : S.endFree ? await E.oneWay(s, target, o2, () => {}) : await E.aToB(s, endN, target, o2, () => {}); } catch (e) { r2 = null; }
        E.setWeights(Object.assign({ road: S.prio === 'turn' ? PRIO.turn.w.road : [0, 0.15, 0.35, 0.6] }, PRIO[S.prio || 'eq'].w));
        if (r2) { const best = Math.min(...r.alts.map(per)), fmin = Math.min(...r.alts.map(fk)), c = (r2.alts || [r2]).filter(a => Math.abs(a.len - target) / target <= 0.05 && r.alts.every(b => E.similarity(a, b) < 0.5) && (side === 'few' || fk(a) <= fmin * 1.8 + 0.5)).sort((a, b) => per(a) - per(b))[0]; // « Le plus simple » : pas plus de ~1,8 fois les feux
          if (c && per(c) <= best * 0.75) { c._side = side; if (r.alts.length >= 3) r.alts[2] = c; else r.alts.push(c); } }
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
  const hills = CITY === 'lyon' ? [['la Croix-Rousse', 4], ['Fourvière', 5], ['la montée de la Grande Côte', 1], ['Saint-Just', 5]] : [['Montmartre', 18], ['Belleville', 20], ['les Buttes-Chaumont', 19], ['Ménilmontant', 20], ['la Butte-aux-Cailles', 13]];
  const ok = hills.filter(([, a]) => M.quartiers.filter(q => q.ar === a).some(q => !S.exclQ.has(q.id)));
  if (!ok.length) return CITY === 'lyon' ? 'Les collines de Lyon sont dans tes zones évitées : réautorise le 1er, 4e ou 5e pour grimper plus.' : 'Les buttes de Paris sont dans tes zones évitées : réautorise le 18e, 19e ou 20e pour grimper plus.';
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
  if (ld && ld.closed.length && S.tab !== 'race') { // parcs fermés que le parcours contourne
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
  const L = alts.map(a => a._side === 'simple' ? 'Le plus simple' : a._side === 'few' ? 'Le moins de feux' : null);
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
    if (a.turns == null) a.turns = a.edges && a.edges.length ? E.turnStats(a.edges).turns : null;
    b.querySelector('.s').innerHTML = [`${fmt(a.len / 1000)} km`, `${Math.round(a.up)} m D+`, `${a.feux} feux`, ...(a.turns != null ? [`${a.turns} virages`] : []), fmtDur(a.len / 1000 * pace()), ...(S.kind === 'green' ? [`${Math.round(a.green * 100)} % vert`] : [])].map(t => `<span class="i">${t}</span>`).join(' · '); // retour à la ligne seulement entre deux infos
    const vv = b.querySelector('.v'); vv.textContent = a.sightsN ? 'Passe par ' + a.sights.slice(0, 4).join(', ') + (a.sightsN > 4 ? '…' : '') : a._side === 'simple' && a.turns ? `Longues lignes droites : un virage tous les ${Math.round(a.len / a.turns / 10) * 10} m` : ''; vv.hidden = !vv.textContent;
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
  S.lastNotes = notes; const n = $('#notes'); n.innerHTML = ''; for (const x of notes) { const d = document.createElement('div'); d.className = 'note' + (x && x.err ? ' err' : x && x.info ? ' info' : ''); d.setAttribute('role', x && x.err ? 'alert' : 'status'); if (x && x.b) { const b = document.createElement('b'); b.className = 'nt'; b.textContent = x.b; d.appendChild(b); d.appendChild(document.createTextNode(x.t)); } else d.textContent = typeof x === 'string' ? x : x.t; n.appendChild(d); }
  $('#detail').hidden = !r; const rcv = !!r && r === S.recv; $('#view-res').classList.toggle('recv', rcv); /* parcours reçu : une seule proposition, pas de liste */ if (r) linkErr(false);
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
  sp.innerHTML = `Par <strong></strong> · ${arrs.map(a => a >= 50 ? M.quartiers.find(q => q.ar === a).name : a === 1 ? '1er' : a + 'e').join(', ')}`; sp.querySelector('strong').textContent = top.join(', ');
  if (r.green != null && G.GR) sp.appendChild(document.createTextNode(` · ${Math.round(r.green * 100)} % du parcours au vert (parcs, rues arborées)`));
  if (r.sightsN) sp.appendChild(document.createTextNode(` · Lieux : ${r.sights.join(', ')}`));
  if (r.lit != null && S.lastDep && S.lastDep.night && S.tab !== 'race') sp.appendChild(document.createTextNode(` · ${Math.round(r.lit * 100)} % éclairé`));
  const rt = routeTrees(r); if (rt) sp.appendChild(document.createTextNode(` · ${rt.length.toLocaleString('fr-FR')} arbres le long du parcours`));
  $('#via').appendChild(sp);
  // points d'eau sur le parcours
  const rf = routeFountains(r);
  if (rf) { const box = document.createElement('div'); box.className = 'water-box';
    const l = document.createElement('span'); l.className = 'lbl'; l.textContent = 'Points d’eau'; box.appendChild(l);
    const t = document.createElement('span');
    if (!rf.list.length) t.textContent = 'Aucune fontaine à moins de 30 m du parcours : pense à emporter de l’eau.';
    else { t.innerHTML = `<strong></strong> · km ${rf.stops.slice(0, 10).map(a => fmt(a / 1000)).join(' · ')}${rf.stops.length > 10 ? '…' : ''}`; t.querySelector('strong').textContent = `${rf.list.length} fontaine${rf.list.length > 1 ? 's' : ''}, ${rf.stops.length} point${rf.stops.length > 1 ? 's' : ''} d’eau`;
      if (r.len > 4000) { const g = document.createElement('small'); g.textContent = `Plus long passage sans eau : ${fmt(rf.gap / 1000)} km. Certaines fontaines sont coupées en hiver.`; t.appendChild(g); } }
    box.appendChild(t); $('#via').appendChild(box); }
  // parcours qui ne reviennent pas au départ : métro ou RER le plus proche de l'arrivée, pour rentrer
  const P = routePts(r), a = P[0], b = P[P.length - 1]; r._metroEnd = null;
  if (METRO.st.length && Math.hypot(b[0] - a[0], b[1] - a[1]) > 300) {
    const ns = nearestStation(b[0], b[1]); r._metroEnd = ns;
    const box = document.createElement('div'); box.className = 'metro-end';
    const l = document.createElement('span'); l.className = 'lbl'; l.textContent = 'Pour rentrer'; box.appendChild(l);
    const t = document.createElement('span'); const d = Math.round(ns.d * 1.25 / 10) * 10; // à pied ≈ 1,25 × la distance à vol d'oiseau
    t.innerHTML = `<strong></strong> à ${d < 30 ? 'l’arrivée' : '~' + d + ' m à pied'}`; t.querySelector('strong').textContent = (ns.d > 1500 ? 'Pas de station proche · la plus proche : ' : ns.s.ls.every(x => x.startsWith('RER')) ? 'RER ' : ns.s.tram ? 'Tram ' : 'Métro ') + ns.s.n;
    box.appendChild(t); for (const ln of ns.s.ls) box.appendChild(lineBadge(ln));
    $('#via').appendChild(box);
  }
  drawProfile(r);
}

// ---------- profil ----------
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
  // point le plus haut
  let im = 0; P.forEach((p, i) => { if (p[1] > P[im][1]) im = i; });
  x.beginPath(); x.arc(X(P[im][0]), Y(P[im][1]), 3.5, 0, 7); x.fillStyle = col; x.fill();
}
window.addEventListener('resize', () => S.route && drawProfile(S.route));

// ---------- GPX ----------
function gpx() {
  const r = S.route; if (!r) return null;
  const pts = routePts(r);
  const esc = s => s.replace(/[<&>]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c]));
  const name = S.tab === 'race' && S.race ? `${S.race.name} – PerfectRun, km ${fmt(S.raceFrom)} à ${fmt(S.raceTo)}` : `PerfectRun ${fmt(r.len / 1000)} km – départ ${S.start.name}`;
  const body = pts.map(([x, y]) => { const [la, lo] = E.toLL(x, y); return `<trkpt lat="${la.toFixed(6)}" lon="${lo.toFixed(6)}"></trkpt>`; }).join('\n      ');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="PerfectRun" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${esc(name)}</name></metadata>\n  <trk><name>${esc(name)}</name><type>running</type><trkseg>\n      ${body}\n  </trkseg></trk>\n</gpx>\n`;
}
$('#gpx').onclick = async () => {
  const g = gpx(); if (!g) return toast("Génère d'abord un parcours.");
  try {
    const fn = `runparis-${Math.round(S.route.len / 100) / 10}km`; track('gpx', S.tab === 'race' && S.race ? 'GPX parcours mythique ' + S.race.name : 'GPX parcours');
    if (NATIVE) { await nativeShareFile(fn + '.gpx', g); return; } // application : menu de partage (Strava, Garmin, Fichiers…)
    if (!window.claude) { // site : un vrai fichier .gpx
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

