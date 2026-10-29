// ---------- dessin de la carte ----------
const cv = $('#map'), ctx = cv.getContext('2d');
let V = { s: 0.05, tx: 0, ty: 0 }, W = 0, H = 0, dpr = 1;
let MAPROT = 0, MAPROT_ON = false; // course : rotation de la carte (degrés), canvas agrandi pour tourner
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
  dpr = Math.min(window.devicePixelRatio || 1, MAPROT_ON ? 2 : 4); W = cv.offsetWidth; H = cv.offsetHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); draw();
}
// ---------- feuille mobile ----------
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
  const start = e => { if (!MOB.matches || e.pointerType !== 'mouse' || e.target.closest('#theme-btn, #city-btn, a.logo')) return; /* au doigt : geste tactile plus bas (D-75) */ d = { y: e.clientY, h: panel.getBoundingClientRect().height, moved: false }; panel.classList.add('dragging'); e.currentTarget.setPointerCapture(e.pointerId); };
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
    const tg = e.target; if (tg.closest('input, select, textarea, #theme-btn, #city-btn, #citysheet, a.logo, .themepop, .chips, #race-filter, #portion-chips')) { t = null; return; }
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
  const Hv = Math.max(160, H - sheetPx()), top = MOB.matches ? 50 : 40; // sur téléphone, cadrer dans la partie de la carte visible au-dessus de la feuille
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
      const hi = st === endSt; if (hiOnly ? !hi : !S.showMetro || (V.s < 0.04 && !hi) || (st.tram && !big && !hi && !METRO.onlyTram)) continue; const r = hi ? 9 : big ? 6.5 : 3;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fillStyle = colors.metroBg; ctx.fill(); ctx.lineWidth = hi ? 2.5 : big ? 1.6 : 1.2; ctx.strokeStyle = hi ? colors.route : colors.metroInk; ctx.stroke();
      if (big || hi) { ctx.fillStyle = colors.metroInk; ctx.font = `800 ${hi ? 11 : 8.5}px ${css('--f-cond')}`; ctx.fillText(st.tram ? 'T' : 'M', sx, sy + 0.5); }
      if (badges || hi) { // pastilles de lignes + nom
        let bx = sx + r + 4; ctx.textAlign = 'left';
        for (const l of st.ls) { const lab = l.replace(/^M/, '').replace('RER ', '').replace(/^T([A-Z])$/, '$1'), w = Math.max(14, ctx.measureText(lab).width + 6); const c = METRO.lines[l] || '#888';
          ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, sy - 7, w, 14, 7) : ctx.rect(bx, sy - 7, w, 14); ctx.fill(); // pastille ronde (LineBadge)
          const h = c.replace('#', ''), lum = (parseInt(h.substr(0, 2), 16) * 299 + parseInt(h.substr(2, 2), 16) * 587 + parseInt(h.substr(4, 2), 16) * 114) / 1000;
          ctx.fillStyle = lum > 150 ? '#111' : '#fff'; ctx.font = `800 10px ${css('--f-cond')}`; ctx.textAlign = 'center'; ctx.fillText(lab, bx + w / 2, sy + 0.5); ctx.textAlign = 'left'; bx += w + 2; }
        if (V.s >= 0.32 || hi) { ctx.font = `700 11.5px ${css('--f-body')}`; ctx.lineWidth = 3.5; ctx.strokeStyle = colors.bg; ctx.strokeText(st.n, bx + 3, sy + 0.5); ctx.fillStyle = colors.ink; ctx.fillText(st.n, bx + 3, sy + 0.5); }
        ctx.textAlign = 'center';
      }
    }
  }
}
// épingles dessinées (position à l'écran) et épingle survolée à la souris (D-105)
const PINS = []; let PIN_HOVER = '';
let raf = 0; function draw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
function render() {
  if (!G || !paths.minor) return;
  colors = { street: css('--street'), major: css('--street-major'), path: css('--street-path'), quart: css('--quart'), route: css('--route'), route2: css('--route-2'), font: css('--font'), track: css('--track'), tree: css('--tree'), metroBg: css('--metro-bg'), metroInk: css('--metro-ink'), casing: css('--route-casing'), avoid: css('--avoid'), avoidFill: css('--avoid-fill'), sig: css('--sig'), bg: css('--map-bg'), ink: css('--ink'), muted: css('--muted'), good: css('--good'), poi: css('--poi'), panel: css('--panel'), station: css('--station'), stationFill: css('--station-fill'), label: css('--label'), water: css('--water'), green: css('--green'), cem: css('--cem'), pinB: css('--pin-b'), accentInk: css('--accent-ink') };
  if (!colors.hatch || colors.hatchKey !== colors.avoid) { const pc = document.createElement('canvas'); pc.width = pc.height = 8; const g = pc.getContext('2d'); g.strokeStyle = colors.avoid; g.globalAlpha = 0.55; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-2, 10); g.lineTo(10, -2); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(6, 10); g.lineTo(10, 6); g.stroke(); colors.hatch = ctx.createPattern(pc, 'repeat'); colors.hatchKey = colors.avoid; }
  if (colors.hatch && colors.hatch.setTransform) colors.hatch.setTransform(new DOMMatrix().scale(1 / (V.s || 1)));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(V.s * dpr, 0, 0, V.s * dpr, V.tx * dpr, V.ty * dpr);
  const px = v => v / V.s;
  // fond : espaces verts, eau, cimetières
  if (M.greenPath) { ctx.fillStyle = colors.green; ctx.fill(M.greenPath, 'evenodd'); }
  if (M.cemPath) { ctx.fillStyle = colors.cem; ctx.fill(M.cemPath, 'evenodd'); }
  if (M.waterPath) { ctx.fillStyle = colors.water; ctx.fill(M.waterPath, 'evenodd'); }
  // quartiers évités
  if (S.tab !== 'race') for (const q of M.quartiers) if (S.exclQ.has(q.id)) { ctx.fillStyle = colors.avoidFill; ctx.fill(q.path); if (colors.hatch) { ctx.fillStyle = colors.hatch; ctx.fill(q.path); } }
  if (M.stationPath) { ctx.fillStyle = colors.stationFill; ctx.fill(M.stationPath, 'nonzero'); }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const z = V.s; // px par mètre
  ctx.strokeStyle = colors.street; ctx.lineWidth = px(z > 0.25 ? 1.6 : z > 0.1 ? 0.9 : 0.5); ctx.stroke(paths.minor);
  ctx.strokeStyle = colors.path; ctx.setLineDash([px(3), px(2)]); ctx.lineWidth = px(z > 0.25 ? 1.4 : 0.7); ctx.stroke(paths.path); ctx.setLineDash([]);
  ctx.strokeStyle = colors.major; ctx.lineWidth = px(z > 0.25 ? 2 : 1); ctx.stroke(paths.c1);
  ctx.lineWidth = px(z > 0.25 ? 3 : 1.5); ctx.stroke(paths.c2);
  ctx.lineWidth = px(z > 0.25 ? 4 : 2); ctx.stroke(paths.c3);
  // limites des quartiers et des arrondissements
  ctx.strokeStyle = colors.quart; ctx.lineWidth = px(1); ctx.setLineDash([px(5), px(4)]);
  for (const q of M.quartiers) ctx.stroke(q.path);
  ctx.setLineDash([]);
  if (S.tab !== 'race') for (const q of M.quartiers) if (S.exclQ.has(q.id)) { ctx.strokeStyle = colors.avoid; ctx.lineWidth = px(2.4); ctx.stroke(q.path); }
  // lieux évités
  if (S.tab !== 'race') for (const p of S.places) { const [x, y] = E.toXY(p.lat, p.lon); ctx.beginPath(); ctx.arc(x, y, p.r, 0, 7); ctx.fillStyle = colors.avoidFill; ctx.fill(); if (colors.hatch) { ctx.fillStyle = colors.hatch; ctx.fill(); } ctx.strokeStyle = colors.avoid; ctx.lineWidth = px(2.4); ctx.stroke(); }
  // feux
  if (S.showSig) { ctx.fillStyle = colors.sig; const h = px(z > 0.2 ? 3 : 1.8); ctx.beginPath(); for (const s of G.SIG) ctx.rect(s.x - h, s.y - h, 2 * h, 2 * h); ctx.fill(); }
  // tous les arbres, en petits points (une carte de densité quand on dézoome)
  if (S.showTrees && TREES) {
    const x0 = -V.tx / V.s, y0 = -V.ty / V.s, x1 = (W - V.tx) / V.s, y1 = (H - V.ty) / V.s, r = px(z > 0.4 ? 2.4 : z > 0.15 ? 1.6 : 1);
    ctx.save(); ctx.globalAlpha = z > 0.15 ? 0.75 : 0.45; ctx.fillStyle = colors.tree; ctx.beginPath();
    for (let i = 0; i < TREES.length; i += 2) { const x = TREES[i], y = TREES[i + 1]; if (x < x0 || x > x1 || y < y0 || y > y1) continue; ctx.rect(x - r, y - r, 2 * r, 2 * r); }
    ctx.fill(); ctx.restore();
  }
  if (S.showTrack && TRACKS.length) { // pistes d'athlé : l'anneau de près, un repère de loin
    const x0 = -V.tx / V.s - 300, y0 = -V.ty / V.s - 300, x1 = (W - V.tx) / V.s + 300, y1 = (H - V.ty) / V.s + 300;
    ctx.save();
    for (const t of TRACKS) { if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
      if (V.s >= 0.25) { ctx.beginPath(); t.ring.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.globalAlpha = 0.22; ctx.fillStyle = colors.track; ctx.fill(); ctx.globalAlpha = 0.95; ctx.lineWidth = px(2.5); ctx.strokeStyle = colors.track; ctx.stroke(); ctx.globalAlpha = 1; } }
    ctx.restore();
  }
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawLabels(); ctx.restore();
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawMetro(false);
  if (S.showFont && V.s >= 0.03) { const r = V.s > 0.2 ? 6.5 : V.s > 0.08 ? 4.5 : 2.5; for (const f of FONT) { const sx = f.x * V.s + V.tx, sy = f.y * V.s + V.ty; if (sx < -10 || sy < -10 || sx > W + 10 || sy > H + 10) continue;
    if (r < 3) { ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fillStyle = colors.font; ctx.fill(); } else drawDrop(sx, sy, r, false); } }
  if (S.showTrack && V.s < 0.25) for (const t of TRACKS) { const sx = t.x * V.s + V.tx, sy = t.y * V.s + V.ty; if (sx < -10 || sy < -10 || sx > W + 10 || sy > H + 10) continue;
    const rw = V.s > 0.08 ? 8 : 5.5; ctx.beginPath(); ctx.ellipse(sx, sy, rw, rw * 0.6, 0, 0, 7); ctx.lineWidth = V.s > 0.08 ? 3 : 2.2; ctx.strokeStyle = colors.track; ctx.stroke(); }
  ctx.restore();
  // tracé
  const R = NAV.on && NAV.r ? NAV.r : S.route;
  if (R && S.alts && S.alts.length > 1 && !NAV.on) {
    ctx.save(); ctx.globalAlpha = 0.45; ctx.strokeStyle = colors.route; ctx.lineWidth = px(2.5); ctx.setLineDash([px(6), px(5)]);
    for (const a of S.alts) { if (a === R) continue; const p = new Path2D(); let f = true;
      for (const [e, fromA] of a.edges) { const pts = E.edgePts(e); if (!fromA) pts.reverse(); pts.forEach(([x, y], i) => { if (f) { p.moveTo(x, y); f = false; } else if (i) p.lineTo(x, y); }); }
      ctx.stroke(p); }
    ctx.restore();
    // numéro de chaque proposition, au milieu de son tracé
    S.alts.forEach((a, i) => { if (a === R) return; const v = a.nodes[Math.floor(a.nodes.length * 0.55)]; a._label = [G.NX[v], G.NY[v], i + 1]; });
  }
  if (R) {
    // chaque passage dans une même rue a sa voie (à droite de son sens de marche)
    const LI = laneInfo(R), U = 3 / V.s;
    const OP = LI.any ? LI.pts.map(([x, y], i) => [x - LI.ty[i] * LI.lane[i] * U, y + LI.tx[i] * LI.lane[i] * U]) : LI.pts;
    const stroke = (a, b, col) => { const p = new Path2D(); for (let i = a; i <= b; i++) i === a ? p.moveTo(OP[i][0], OP[i][1]) : p.lineTo(OP[i][0], OP[i][1]);
      ctx.strokeStyle = colors.casing; ctx.lineWidth = px(LI.any ? 7 : 8); ctx.stroke(p); ctx.strokeStyle = col; ctx.lineWidth = px(LI.any ? 4 : 4.5); if (col === colors.route2) { ctx.lineCap = 'butt'; ctx.setLineDash([px(7), px(5)]); } ctx.stroke(p); ctx.setLineDash([]); ctx.lineCap = 'round'; };
    // arbres le long du tracé, comme les feux : petits points dessinés SOUS la ligne, au zoom rue seulement,
    // au plus un point tous les ~8 px : une avenue arborée se lit comme une frange verte, pas comme du bruit
    const rt = z > 0.22 && !S.showTrees ? routeTrees(R) : null;
    if (rt && rt.length) { const seen = new Set(), rr = px(2.2); ctx.fillStyle = colors.tree; ctx.beginPath();
      for (const i of rt) { const k = Math.floor(TREES[i] * z / 8) + ',' + Math.floor(TREES[i + 1] * z / 8); if (seen.has(k)) continue; seen.add(k); ctx.moveTo(TREES[i] + rr, TREES[i + 1]); ctx.arc(TREES[i], TREES[i + 1], rr, 0, 7); }
      ctx.fill(); }
    if (!LI.any) stroke(0, OP.length - 1, colors.route);
    else for (let a = 0; a < OP.length - 1;) { // petits morceaux pour que les passages suivants recouvrent les précédents ; 2e passage dans sa couleur
      let b = a + 1; while (b < OP.length - 1 && b - a < 24 && LI.pass[b] === LI.pass[a]) b++;
      stroke(a, b, LI.pass[a] % 2 ? colors.route2 : colors.route); a = b; }
    navDrawDone(px);
    // feux sur le tracé
    const ids = new Set(S.tab === 'race' ? [] : R.clusterIds); ctx.fillStyle = colors.sig; ctx.strokeStyle = colors.casing; ctx.lineWidth = px(1.5);
    for (const s of G.SIG) if (ids.has(s.id)) { const h = px(4.5); ctx.beginPath(); ctx.rect(s.x - h, s.y - h, 2 * h, 2 * h); ctx.fill(); ctx.stroke(); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // chevrons de sens tous les ~70 px le long du tracé
    if (V.s >= 0.09) { const P = LI.pts; let run = 35; ctx.strokeStyle = colors.panel; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 1; i < P.length; i++) { run += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]) * V.s;
        if (run < 70 || i < 2 || i > P.length - 3) continue; run = 0;
        const sx = OP[i][0] * V.s + V.tx, sy = OP[i][1] * V.s + V.ty; if (sx < -10 || sy < -10 || sx > W + 10 || sy > H + 10) continue;
        const dx = LI.tx[i], dy = LI.ty[i], k = 2.6;
        ctx.beginPath(); ctx.moveTo(sx - dx * k - dy * k, sy - dy * k + dx * k); ctx.lineTo(sx + dx * k, sy + dy * k); ctx.lineTo(sx - dx * k + dy * k, sy - dy * k - dx * k); ctx.stroke(); } }
    // bornes km, posées sur la voie du passage auquel elles appartiennent
    const kmOff = NAV.on && NAV.r && NAV.r !== S.route ? NAV.base : 0; let acc = 0, next = 1000 - kmOff % 1000;
    ctx.font = `800 11px ${css('--f-body')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    {
      const pts = LI.pts;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        while (acc + d >= next && next < R.len - 150) {
          const t = (next - acc) / d, x = OP[i - 1][0] + t * (OP[i][0] - OP[i - 1][0]), y = OP[i - 1][1] + t * (OP[i][1] - OP[i - 1][1]);
          const sx = x * V.s + V.tx, sy = y * V.s + V.ty, km = Math.round((next + kmOff) / 1000);
          if (V.s > 0.06 || km % 2 === 0 || R.len + kmOff < 12000) {
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
  // numéros des arrondissements quand on dézoome
  if (V.s < 0.12 && M.arrC) {
    ctx.font = `800 ${V.s < 0.07 ? 14 : 17}px ${css('--f-display')}`; if ('fontStretch' in ctx) ctx.fontStretch = 'condensed'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = colors.muted; ctx.globalAlpha = .75;
    for (const a in M.arrC) { const c = M.arrC[a]; const x = c[0] / c[2] * V.s + V.tx, y = c[1] / c[2] * V.s + V.ty; if (+a >= 50) { if (V.s < 0.045) continue; ctx.save(); ctx.font = `500 ${V.s < 0.07 ? 11 : 12}px ${css('--f-display')}`; ctx.fillText(M.quartiers.find(q => q.ar === +a)?.name || '', x, y); ctx.restore(); } else ctx.fillText(a === '1' ? '1er' : a + 'e', x, y); }
    ctx.globalAlpha = 1; if ('fontStretch' in ctx) ctx.fontStretch = 'normal';
  }
  drawMetro(true);
  if (S.route && V.s >= 0.05) { const rf = routeFountains(S.route); if (rf) for (const { f } of rf.list) drawDrop(f.x * V.s + V.tx, f.y * V.s + V.ty, V.s > 0.15 ? 8 : 6.5, true); }
  drawRouteNames();
  // épingles
  // lieux (connus ou de passage) : losange magenta (D-69), pour ne pas se confondre avec les arbres
  const dia = (p, label, r) => { if (!p) return; const [x, y] = E.toXY(p.lat, p.lon); const sx = x * V.s + V.tx, sy = y * V.s + V.ty; ctx.beginPath(); ctx.moveTo(sx, sy - r); ctx.lineTo(sx + r, sy); ctx.lineTo(sx, sy + r); ctx.lineTo(sx - r, sy); ctx.closePath(); ctx.fillStyle = colors.poi; ctx.fill(); ctx.strokeStyle = colors.casing; ctx.lineWidth = 2; ctx.stroke(); if (label) { ctx.fillStyle = colors.accentInk === '#0B0B0C' ? '#0B0B0C' : '#FFFFFF'; ctx.font = `800 12px ${css('--f-body')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, sx, sy + 1); } };
  // départ et arrivée (D-105) : épingle qui pointe le point exact, avec une ombre ; D plein (ink), A en creux (panel cerclé d'ink).
  // Sur ordinateur (souris), l'épingle survolée se déroule en « Départ » / « Arrivée ».
  const pin = (p, k) => { if (!p) return; const [x, y] = E.toXY(p.lat, p.lon); const sx = x * V.s + V.tx, sy = y * V.s + V.ty, isD = k === 'D';
    const full = PIN_HOVER === k ? (isD ? (S.mode === 'loop' && S.tab !== 'race' ? 'Départ et arrivée' : 'Départ') : 'Arrivée') : '';
    const h = 34, r = 14, cy = sy - h + r; ctx.font = full ? `600 15px ${css('--f-body')}` : `800 15px ${css('--f-display')}`; // survol : style control (15 px 600) ; lettre : comme les bornes km
    const hw = full ? ctx.measureText(full).width / 2 + 12 : 0;
    const dk = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    ctx.save(); ctx.shadowColor = dk ? 'rgba(0,0,0,.55)' : 'rgba(0,0,0,.18)'; ctx.shadowBlur = dk ? 6 : 4; ctx.shadowOffsetY = 1; ctx.beginPath(); ctx.moveTo(sx, sy); // shadow-float, comme les outils posés sur la carte
    if (full) { ctx.lineTo(sx - 6, cy + r); ctx.lineTo(sx - hw, cy + r); ctx.arc(sx - hw, cy, r, Math.PI / 2, Math.PI * 1.5); ctx.lineTo(sx + hw, cy - r); ctx.arc(sx + hw, cy, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(sx + 6, cy + r); }
    else { ctx.bezierCurveTo(sx - 4, sy - 8, sx - r, cy + r * .6, sx - r, cy); ctx.arc(sx, cy, r, Math.PI, 0); ctx.bezierCurveTo(sx + r, cy + r * .6, sx + 4, sy - 8, sx, sy); }
    ctx.closePath(); ctx.fillStyle = isD ? colors.ink : colors.panel; ctx.fill(); ctx.restore(); ctx.lineWidth = 2.5; ctx.strokeStyle = isD ? colors.casing : colors.ink; ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, 3, 0, 7); ctx.fillStyle = isD ? colors.panel : colors.ink; ctx.fill(); ctx.strokeStyle = isD ? colors.ink : colors.panel; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = isD ? colors.panel : colors.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(full || k, sx, cy + 1);
    PINS.push({ k, x: sx, y: cy, w: Math.max(r, hw + r) }); };
  PINS.length = 0;
  if (R && S.alts && !NAV.on) for (const a of S.alts) if (a !== R && a._label) {
    const [x, y, n] = a._label, sx = x * V.s + V.tx, sy = y * V.s + V.ty;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(sx - 11, sy - 10, 22, 20, 6) : ctx.rect(sx - 11, sy - 10, 22, 20); ctx.fillStyle = colors.panel; ctx.fill(); ctx.strokeStyle = colors.route; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = colors.route; ctx.font = `700 12px ${css('--f-display')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), sx, sy + 1);
  }
  // lieux connus croisés par le parcours choisi
  if (R && R.sightsN) {
    ctx.font = `700 12px ${css('--f-body')}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const nm of R.sights) { const sg = SIGHTS.find(x => x.name === nm); if (!sg) continue; const sx = sg.x * V.s + V.tx, sy = sg.y * V.s + V.ty;
      dia(sg, '', 8); ctx.font = `700 12px ${css('--f-body')}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = 3.5; ctx.strokeStyle = colors.bg; ctx.strokeText(nm, sx + 10, sy); ctx.fillStyle = colors.ink; ctx.fillText(nm, sx + 10, sy); }
  }
  if (S.tab === 'race') {
    if (R) { const a = R.nodes[0], b = R.nodes[R.nodes.length - 1]; const ll = v => { const [la, lo] = E.toLL(G.NX[v], G.NY[v]); return { lat: la, lon: lo }; }; pin(ll(b), 'A'); pin(ll(a), 'D'); }
    navDrawMe(); return;
  }
  S.vias.forEach((v, i) => dia(v, String(i + 1), 13));
  if (S.mode === 'ab' && !S.endFree) pin(S.end, 'A');
  if (S.mode === 'ab' && S.endFree && S.route) { const v = S.route.nodes[S.route.nodes.length - 1]; const [la, lo] = E.toLL(G.NX[v], G.NY[v]); pin({ lat: la, lon: lo }, 'A'); }
  pin(S.start, 'D');
  navDrawMe();
}

// ---------- noms des rues ----------
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
    let ang = uprightAng(Math.atan2(p1[1] - p0[1], p1[0] - p0[0]));
    const prev = placed.get(name); if (prev && prev.some(([px, py]) => Math.hypot(px - cx, py - cy) < 260)) continue;
    const hw = Math.abs(Math.cos(ang)) * tw / 2 + Math.abs(Math.sin(ang)) * fs / 2 + 3, hh = Math.abs(Math.sin(ang)) * tw / 2 + Math.abs(Math.cos(ang)) * fs / 2 + 3;
    if (boxes.some(b => Math.abs(b[0] - cx) < b[2] + hw && Math.abs(b[1] - cy) < b[3] + hh)) continue;
    boxes.push([cx, cy, hw, hh]); if (!prev) placed.set(name, [[cx, cy]]); else prev.push([cx, cy]);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.strokeText(name, 0, 0); ctx.fillText(name, 0, 0); ctx.restore();
    if (++n > 180) break;
  }
}

// ---------- thème ----------
function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  ['auto', 'light', 'dark'].forEach(k => $('#t-' + k).setAttribute('aria-pressed', k === t));
  try { localStorage.setItem('runparis-theme', t); } catch (e) {}
  draw(); if (S.route) drawProfile(S.route);
}
['auto', 'light', 'dark'].forEach(k => $('#t-' + k).onclick = () => { applyTheme(k); $('#themepop').hidden = true; $('#theme-btn').setAttribute('aria-expanded', false); });
$('#theme-btn').onclick = e => { e.stopPropagation(); const p = $('#themepop'); p.hidden = !p.hidden; $('#theme-btn').setAttribute('aria-expanded', !p.hidden); if (!p.hidden) { p.style.maxHeight = ''; const r = p.getBoundingClientRect(); p.style.maxHeight = Math.max(200, innerHeight - r.top - 12) + 'px'; } };
document.addEventListener('click', e => { const p = $('#themepop'); if (!p.hidden && !p.contains(e.target)) { p.hidden = true; $('#theme-btn').setAttribute('aria-expanded', false); } });
try { const t = localStorage.getItem('runparis-theme'); if (t && t !== 'auto') applyTheme(t); } catch (e) {}

// ---------- gestes sur la carte ----------
const ptrs = new Map(); let drag = null, pinch = null, pinchRot = null;
const ptrC = new Map();
cv.addEventListener('pointerdown', e => { try { cv.setPointerCapture(e.pointerId); } catch (er) {} ptrs.set(e.pointerId, [e.offsetX, e.offsetY]); ptrC.set(e.pointerId, [e.clientX, e.clientY]); if (ptrC.size === 2) { const [a, b] = [...ptrC.values()]; pinchRot = { a0: Math.atan2(b[1] - a[1], b[0] - a[0]), r0: MAPROT, on: false }; } if (ptrs.size === 1) drag = { x: e.offsetX, y: e.offsetY, tx: V.tx, ty: V.ty, moved: false }; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: V.s, tx: V.tx, ty: V.ty, cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 }; drag = null; } });
cv.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse' && !NATIVE && !ptrs.size) { const h = PINS.slice().reverse().find(p => Math.abs(e.offsetX - p.x) <= p.w && Math.abs(e.offsetY - p.y) <= 16); const k = h ? h.k : ''; if (k !== PIN_HOVER) { PIN_HOVER = k; cv.style.cursor = k ? 'default' : ''; draw(); } }
  if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.offsetX, e.offsetY]); ptrC.set(e.pointerId, [e.clientX, e.clientY]);
  if (NAV.on && pinchRot && ptrC.size === 2) { const [a, b] = [...ptrC.values()]; let d = (Math.atan2(b[1] - a[1], b[0] - a[0]) - pinchRot.a0) * 180 / Math.PI; while (d > 180) d -= 360; while (d < -180) d += 360;
    if (!pinchRot.on && Math.abs(d) > 12) { pinchRot.on = true; pinchRot.a0 += Math.sign(d) * 12 * Math.PI / 180; d -= Math.sign(d) * 12; if (NAV.follow) { NAV.follow = false; navPosBtn(); } }
    if (pinchRot.on) mapRotTo(pinchRot.r0 + d, false); }
  if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const k = Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d; zoomAt(pinch.cx, pinch.cy, pinch.s * k, pinch); return; }
  if (drag) { const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y; if (Math.hypot(dx, dy) > 4) drag.moved = true; if (drag.moved) { V.tx = drag.tx + dx; V.ty = drag.ty + dy; if (NAV.on && NAV.follow) { NAV.follow = false; navPosBtn(); } draw(); } }
});
cv.addEventListener('pointerup', e => { ptrs.delete(e.pointerId); ptrC.delete(e.pointerId); if (ptrs.size < 2) { pinch = null; pinchRot = null; } if (drag && !drag.moved) click(e.offsetX, e.offsetY); drag = null;  navIdleArm(); });
cv.addEventListener('pointerleave', () => { if (PIN_HOVER) { PIN_HOVER = ''; cv.style.cursor = ''; draw(); } });
cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); ptrC.delete(e.pointerId); drag = null; pinch = null; pinchRot = null; });
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, V.s * Math.exp(-e.deltaY * 0.0015)); navIdleArm(); }, { passive: false });
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
  if (!t && S.showTrack && !NAV.on) { const k = trackAt(sx, sy); if (k) return trackCard(k); }
  if (t === 'start' || t === 'end') {
    if (!q) return toast(`Choisis un point sur la carte (${C0.name} et communes voisines).`);
    setPoint(t, { lat, lon, name: `Point sur la carte · ${q.name}` }); setTool(null); generate(); return;
  }
  if ((t === 'quart' || t === 'place' || t === 'via') && !q) return toast(`Choisis un point sur la carte (${C0.name} et communes voisines).`);
  if (t === 'via') { if (!q) return toast(`Choisis un point sur la carte (${C0.name} et communes voisines).`); addVia({ lat, lon, name: `Point · ${q.name}` }); setTool(null); return; }
  if (t === 'quart') { S.exclQ.has(q.id) ? S.exclQ.delete(q.id) : S.exclQ.add(q.id); zonesChanged(); toast(`${q.name}${q.ar >= 50 ? '' : ` (${q.ar}${q.ar === 1 ? 'er' : 'e'})`} ${S.exclQ.has(q.id) ? 'évité' : 'réautorisé'}`); return; }
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
