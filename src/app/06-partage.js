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
  if (r.solo) { dep = soloPlace(a); arr = loop ? '' : soloPlace(b); }
  else if (S.tab === 'race' && S.race) dep = S.race.name;
  else { dep = shortName(S.start && S.start.name); if (!dep || dep === 'Ma position' || /^Point sur la carte/.test(S.start && S.start.name || '')) { const ns = nearestStation(a[0], a[1]); dep = ns && ns.d < 800 ? ns.s.n : (dep || 'Départ'); } if (!loop) { if (S.mode === 'ab' && !S.endFree && S.end) arr = shortName(S.end.name); else { const ns = nearestStation(b[0], b[1]); arr = ns && ns.d < 600 ? ns.s.n : 'Arrivée'; } } }
  const d = new Date(); const date = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  return { pts, km, up: Math.round(r.up || 0), loop, dep, arr, race: !r.solo && S.tab === 'race' && !!S.race, date, solo: !!r.solo };
}
function shOpen(secs, doneM) {
  const meas = typeof secs === 'number';
  const d = shareData(); if (!d) return toast("Génère d'abord un parcours.");
  if (meas && typeof doneM === 'number' && doneM > 100) d.km = doneM / 1000;
  SH.data = d; SH.photo = null; SH.bg = 'map'; SH.ly = 'big'; $('#done').setAttribute('aria-pressed', true);
  $('#shx-time').value = fmtClock(meas ? secs : d.km * pace());
  $('#shx-bravo .shx-time small').textContent = meas ? 'Mesuré pendant ta course, pauses déduites' : 'Estimé avec ton allure, modifie-le si besoin';
  $('#shx-name-l').hidden = !d.solo;
  $('#shx-lede').textContent = d.solo ? `${fmt(d.km, 1)} km ${d.loop ? 'en boucle autour de ' + d.dep : 'de ' + d.dep + ' à ' + d.arr}, mesurés pendant ta course. Ton tracé est gardé dans « Mes parcours » : tu pourras le refaire ou l’envoyer.` : `${fmt(d.km, 1)} km ${d.race ? 'sur « ' + d.dep + ' »' : d.loop ? 'autour de ' + d.dep : 'depuis ' + d.dep}${meas ? ', mesurés pendant ta course' : ''}${meas && SH.extra ? ', dont ' + fmt(SH.extra.km, 1) + ' km en plus' + (SH.extra.streets.length ? ' (' + SH.extra.streets.join(', ') + ')' : '') : ''}. Immortalise ta sortie et partage-la.`;
  $('#shx').hidden = false; $('#shx-bravo').hidden = false; $('#shx-out').hidden = true; sbSync();
  const entry = { id: Date.now(), city: CITY, d: new Date().toISOString(), km: Math.round(d.km * 10) / 10, up: d.up, dep: d.dep, arr: d.arr, loop: d.loop, race: d.race, t: mineTitle(d), g: routeCode(S.route), secs: Math.round(meas ? secs : d.km * pace()), meas, extra: meas && SH.extra ? SH.extra : undefined, solo: d.solo ? 1 : undefined, pk: !d.solo && !d.race && S.vias.some(v => v.track) ? 1 : undefined };
  const L = mineLoad(); if (SH.entryRoute === S.route && SH.entryId && L.some(x => x.id === SH.entryId)) { const i = L.findIndex(x => x.id === SH.entryId); entry.id = SH.entryId; L[i] = entry; } else L.unshift(entry);
  mineSave(L); SH.entryId = entry.id; SH.entryRoute = S.route; SH.fresh = true; if (d.solo) $('#shx-name').value = entry.t;
  badgeAnnounce(badgeSync());
  track('fait', d.race ? 'Fait parcours mythique ' + d.dep : 'Fait parcours ' + Math.round(d.km) + ' km');
}
function shClose() {
  $('#shx').hidden = true; SH.photo = null; sbSync();
  // sortie qui vient d'être enregistrée : on la montre dans « Mes parcours », avec ou sans photo
  if (SH.fresh && APPF) { SH.fresh = false; const i = mineLoad().findIndex(x => x.id === SH.entryId); if (i >= 0) { setTab('mine'); mineOpen(i); toast('Sortie enregistrée dans «\u00a0Mes parcours\u00a0».', 3000); } }
}
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
  if (onMap) { if (!D.loop) dot(D.pts[D.pts.length - 1], 'A', INK, '#fff'); dot(D.pts[0], 'D', ACC, '#fff'); }
  else { if (!D.loop) { const [X, Y] = P(D.pts[D.pts.length - 1]); g.beginPath(); g.arc(X, Y, 24, 0, 7); g.lineWidth = 9; g.strokeStyle = '#fff'; g.stroke(); g.beginPath(); g.arc(X, Y, 10, 0, 7); g.fillStyle = '#fff'; g.fill(); } dot(D.pts[0], '', '#fff'); }
  // textes
  const NARF = (w, s) => { g.font = `${w} ${s}px Archivo, sans-serif`; try { g.fontStretch = 'condensed'; } catch (e) {} };
  const BODY = (w, s) => { g.font = `${w} ${s}px Archivo, sans-serif`; try { g.fontStretch = 'normal'; } catch (e) {} };
  g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillStyle = fg;
  if (onPhoto) { g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 8; }
  const logo = (x, y, s, align) => { NARF(800, s); const a = 'PERFECT', b = 'RUN', wa = g.measureText(a).width, wb = g.measureText(b).width; let x0 = align === 'center' ? x - (wa + wb) / 2 : x; g.fillStyle = fg; g.fillText(a, x0, y); g.fillStyle = onMap ? ACC : SH.bg === 'uni' ? 'rgba(255,255,255,.72)' : '#7B96FF'; g.fillText(b, x0 + wa, y); g.fillStyle = fg; };
  const km = fmt(D.km, 1), time = fmtClock(SH.secs), pc = fmtClock(SH.secs / Math.max(.1, D.km)), url = 'perfectrun.fr';
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
    const rows = [['Perfect Run', D.date], ['Distance ' + km + ' km', 'Temps ' + time], ['D+ ' + D.up + ' m', 'Allure ' + pc + ' /km'], lieux.map(l => l[0]).length > 1 ? [lieux[0][0] + ' → ' + lieux[1][0]] : [lieux[0][0]]];
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
  if (NATIVE) { await nativeShareFile(f.name, b, 'Ma sortie avec Perfect Run · perfectrun.fr'); return; }
  if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], text: 'Ma sortie avec Perfect Run · perfectrun.fr' }); } catch (e) {} return; }
  shSave(b); toast('Partage direct indisponible ici : l’image est enregistrée.', 3500);
}
// retour dans l'app après un partage vers une autre app : la feuille de partage a été fermée côté iOS (SceneDelegate)
window.prShared = () => toast('Image partagée', 2500);
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

