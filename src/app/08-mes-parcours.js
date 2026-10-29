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
  const url = (NATIVE ? WEB_APP : location.origin + location.pathname) + '?p=' + code + '&n=' + encodeURIComponent(title || '') + (CITY !== 'paris' ? '&ville=' + CITY : '');
  track('envoi', 'Parcours envoyé');
  if (NATIVE) { NP.share.share({ title: 'Un parcours Perfect Run', text: `${title} · ${fmt(km, 1)} km`, url }).catch(() => {}); return; }
  if (navigator.share && MOB.matches) { navigator.share({ title: 'Un parcours Perfect Run', text: `${title} · ${fmt(km, 1)} km`, url }).catch(() => {}); return; }
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Lien du parcours copié : colle-le dans un message.', 3500), () => { prompt('Copie ce lien :', url); });
}
// ouvrir un parcours précis (lien reçu ou « Refaire ce parcours ») : affiché tel quel, prêt à suivre, exporter ou faire
function openFixed(code, title, received) {
  const st = routeFromCode(code); if (!st) { if (!received) toast('Ce lien de parcours est incomplet.', 3500); return false; }
  if (S.tab !== 'gen') setTab('gen');
  const P = st.geom, a = P[0], b = P[P.length - 1], loop = Math.hypot(a[0] - b[0], a[1] - b[1]) < 150, ll = p => { const [la, lo] = E.toLL(p[0], p[1]); return { lat: la, lon: lo }; };
  const near = p => { const ns = nearestStation(p[0], p[1]); return ns && ns.d < 300 ? ns.s.n : 'Point sur la carte'; };
  setPoint('start', Object.assign(ll(a), { name: near(a) }));
  setArrival(loop ? 'back' : 'place'); if (!loop) setPoint('end', Object.assign(ll(b), { name: near(b) }));
  setUnit('km'); $('#km').value = clampKm(Math.round(st.len / 100) / 10); updateConv();
  S.route = st; S.alts = [st]; S.lastTarget = st.len; S.lastD = null;
  const t = title || mineTitle({ loop, dep: 'ce départ', arr: '' });
  const from = near(a), km = `${fmt(st.len / 1000)} km${loop ? ' en boucle' : ''}${from !== 'Point sur la carte' ? ' depuis ' + from : ''}`;
  S.recv = received ? st : null; if (received) linkErr(false);
  S.baseNotes = [received ? { info: true, b: 'Parcours reçu · ' + t, t: APPF ? `${km}. Suis-le, exporte-le, ou touche « Modifier » pour créer le tien.` : `${km}. Exporte-le vers ta montre, ou touche « Modifier » pour créer le tien.` } : { info: true, t: `${t} : le même tracé que ta sortie, ${fmt(st.len / 1000)} km.` }];
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
  $('#mine-detail').hidden = true; $('#mine-list').hidden = false; $('#mine-seg').hidden = false; $('#mine-badges').hidden = true;
  mineView(S.mineView || 'runs', true);
  $('#mine-empty').hidden = !!L.length; $('#mine-tot').hidden = !L.length;
  const km = L.reduce((t, e) => t + (e.km || 0), 0), secs = L.reduce((t, e) => t + (e.secs || 0), 0);
  const h = Math.floor(secs / 3600), mn = Math.round(secs % 3600 / 60);
  $('#mine-tot').innerHTML = `<div><b>${L.length}</b><span>sortie${L.length > 1 ? 's' : ''}</span></div><div><b>${fmt(km, 1)} km</b><span>au total</span></div>` + (secs ? `<div><b>${h ? h + ' h ' + String(mn).padStart(2, '0') : mn + ' min'}</b><span>de course</span></div>` : '');
  let month = '';
  L.forEach((e, i) => {
    const m = mineDate(e.d, { month: 'long', year: 'numeric' }); if (m !== month) { month = m; const hh = document.createElement('div'); hh.className = 'lbl mine-m'; hh.textContent = m; items.appendChild(hh); }
    const b = document.createElement('button'); b.type = 'button'; b.className = 'race mine-card';
    b.innerHTML = mineThumb(e.g) + '<span class="mine-tx"><span class="k"></span><span class="t"></span><span class="s"></span></span><span class="n"></span>';
    b.querySelector('.k').textContent = mineDate(e.d, { weekday: 'long', day: 'numeric', month: 'short' }) + (e.solo ? ' · course libre' : e.secs ? (e.meas ? ' · mesuré' : ' · estimé') : '');
    b.querySelector('.t').textContent = e.t || mineTitle(e);
    b.querySelector('.s').textContent = [e.secs ? fmtClock(e.secs) : '', e.secs && e.km ? fmtClock(e.secs / e.km) + ' /km' : '', e.up != null ? e.up + ' m D+' : ''].filter(Boolean).join(' · ');
    b.querySelector('.n').innerHTML = `${fmt(e.km || 0, 1)}<small> km</small>`;
    b.onclick = () => { if (b.dataset.sw) return; const r = b.parentNode; if (r.classList.contains('open')) { r.classList.remove('open'); b.style.transition = 'transform .18s ease'; b.style.transform = ''; return; } mineOpen(i); };
    const row = document.createElement('div'); row.className = 'mine-row';
    row.innerHTML = '<button type="button" class="mine-del" tabindex="-1">Supprimer</button>'; row.prepend(b);
    mineSwipe(row, b, e.id || e.d);
    items.appendChild(row);
  });
}
function mineOpen(i) {
  const e = mineLoad()[i]; if (!e) return renderMine();
  S.mineCur = e.id || e.d;
  $('#mine-list').hidden = true; $('#mine-badges').hidden = true; $('#mine-seg').hidden = true; $('#mine-detail').hidden = false; $('#view-mine').scrollTop = 0;
  $('#md-t').textContent = e.t || mineTitle(e);
  $('#md-sub').textContent = mineDate(e.d, { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + new Date(e.d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + (e.solo ? ' · course libre' : e.secs ? (e.meas ? ' · mesuré pendant ta course' : ' · temps estimé ou saisi') : '');
  $('#md-km').innerHTML = `${fmt(e.km || 0, 1)}<small>km</small>`;
  $('#md-stats').innerHTML = (e.secs ? `<div><b>${fmtClock(e.secs)}</b><span>temps</span></div><div><b>${fmtClock(e.secs / (e.km || 1))}</b><span>allure /km</span></div>` : '') + (e.up != null ? `<div><b>${e.up} m</b><span>D+</span></div>` : '');
  const x = e.extra; $('#md-extra').hidden = !(x && x.km); if (x && x.km) $('#md-extra').textContent = `Dont ${fmt(x.km, 1)} km en plus après l’arrivée${x.streets && x.streets.length ? ' (' + x.streets.join(', ') + ')' : ''}.`;
  const has = !!(e.g && decPoly(e.g).length > 1);
  $('#md-old').hidden = has; $('#md-old').textContent = e.solo ? 'Course faite hors de la carte : son tracé n’a pas été gardé, on ne peut pas la refaire ni l’envoyer.' : 'Sortie enregistrée avant « Mes parcours » : son tracé n’a pas été gardé, on ne peut pas la refaire ni l’envoyer.'; $('#md-redo').hidden = !has; $('#md-row').hidden = !has;
  // la carte montre la sortie
  if (has) { const st = routeFromCode(e.g); S.route = st; S.alts = [st]; fitRoute(); } else { S.route = null; S.alts = []; }
  draw();
}
function mineCurrent() { return mineLoad().find(x => (x.id || x.d) === S.mineCur); }
$('#tab-mine').onclick = () => setTab('mine');
$('#mine-new').onclick = () => setTab('gen');
$('#mine-back').onclick = () => { renderMine(); S.route = null; S.alts = []; draw(); };
$('#md-redo').onclick = () => { const e = mineCurrent(); if (!e) return; if ((e.city || 'paris') !== CITY) { setCity(e.city || 'paris', { p: e.g, n: e.t || mineTitle(e), refaire: 1 }); return; } if (openFixed(e.g, e.t || mineTitle(e), false)) track('refaire', 'Parcours refait'); };
$('#md-send').onclick = () => { const e = mineCurrent(); if (e) sendLink(e.g, e.t || mineTitle(e), e.km); };
$('#md-img').onclick = () => { const e = mineCurrent(); if (!e || !e.g) return; const st = routeFromCode(e.g); if (!st) return;
  const P = st.geom; SH.data = { pts: P, km: e.km, up: e.up || Math.round(st.up), loop: !!e.loop, dep: e.dep || '', arr: e.arr || '', race: !!e.race, date: new Date(e.d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) };
  SH.photo = null; SH.bg = 'map'; SH.ly = 'big'; SH.extra = null; $('#shx-time').value = fmtClock(e.secs || e.km * pace()); $('#shx').hidden = false; shOut(); };
$('#md-del').onclick = () => mineDel(S.mineCur);
// supprimer une sortie (depuis son détail ou en la glissant dans la liste), avec « Annuler » pendant 5 s
function mineDel(id) {
  const L = mineLoad(), i = L.findIndex(x => (x.id || x.d) === id); if (i < 0) return; const [gone] = L.splice(i, 1); mineSave(L);
  renderMine(); S.route = null; S.alts = []; draw(); track('supprimer', 'Sortie supprimée');
  const t = $('#toast'); t.innerHTML = ''; t.append('Sortie supprimée'); const u = document.createElement('button'); u.type = 'button'; u.className = 'undo'; u.textContent = 'Annuler';
  u.onclick = () => { const M2 = mineLoad(); M2.splice(Math.min(i, M2.length), 0, gone); mineSave(M2); if (S.tab === 'mine') renderMine(); t.hidden = true; };
  t.appendChild(u); t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 5000);
}
// glisser une sortie vers la gauche : bouton « Supprimer » (application, D-115)
const MINE_SW = 104; // bouton 96 px + 8 px d'écart
function mineSwipe(row, card, id, del = mineDel) { // aussi pour Mes villes (del = mvDel)
  let x0 = 0, y0 = 0, dx = 0, on = false, lock = 0;
  const set = (v, anim) => { card.style.transition = anim ? 'transform .18s ease' : 'none'; card.style.transform = v ? `translateX(${v}px)` : ''; row.classList.toggle('open', v <= -MINE_SW / 2); };
  card.addEventListener('touchstart', e => { const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; dx = row.classList.contains('open') ? -MINE_SW : 0; on = true; lock = 0;
    document.querySelectorAll('.mine-row.open').forEach(r => { if (r !== row) { r.classList.remove('open'); r.firstChild.style.transform = ''; } }); }, { passive: true });
  card.addEventListener('touchmove', e => { if (!on) return; const t = e.touches[0], mx = t.clientX - x0, my = t.clientY - y0;
    if (!lock) { if (Math.abs(mx) < 8 && Math.abs(my) < 8) return; lock = Math.abs(mx) > Math.abs(my) ? 1 : 2; }
    if (lock !== 1) return; e.preventDefault(); const base = row.classList.contains('open') ? -MINE_SW : 0; dx = Math.max(-MINE_SW * 1.4, Math.min(0, base + mx)); set(dx); }, { passive: false });
  card.addEventListener('touchend', () => { if (!on) return; on = false; if (lock === 1) { set(dx < -MINE_SW / 2 ? -MINE_SW : 0, true); card.dataset.sw = '1'; setTimeout(() => delete card.dataset.sw, 60); } });
  row.querySelector('.mine-del').onclick = () => del(id);
}
// ---------- badges, appelés « Trophées » dans l'app (RP-85) : calculés sur l'appareil à partir des sorties, jamais retirés ----------
// Les compteurs sont gardés à part (runparis-badges) : supprimer une sortie ou dépasser 200 sorties ne fait rien perdre.
// Distance : celle réellement courue en mode course, sinon celle du parcours. Application seulement (onglet Mes parcours).
const BADGE_K = 'runparis-badges';
const B_ICO = {
  distance: '<path d="M5 21 9.5 3M19 21 14.5 3M12 5v2M12 11v2M12 17v2"/>',
  sorties: '<path d="M2.5 15.5h15a4 4 0 0 0 4-4c0-1.3-.9-2.2-2.2-2.5L14 8l-2-4H8.8l.5 3.2H6l-3.5 3.8z"/><path d="M2.5 19h19"/>',
  regularite: '<path d="M3 5h18v16H3zM3 10h18M8 3v4M16 3v4M9 15.5l2 2 4-4"/>',
  exploration: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
  ville: '<path d="M12 21.5s-7-6.3-7-11.5a7 7 0 0 1 14 0c0 5.2-7 11.5-7 11.5z"/><path d="M9.5 10a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0"/>',
  mythique: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  piste: '<path d="M8 6.5h8a5.5 5.5 0 0 1 0 11H8a5.5 5.5 0 0 1 0-11zM8.5 9.5h7a2.5 2.5 0 0 1 0 5h-7a2.5 2.5 0 0 1 0-5z"/>',
  dplus: '<path d="M2.5 19.5 9 8.5l4 6 2.5-3.5 6 8.5z"/>',
  longue: '<path d="M5 21V4h12l-2.5 4L17 12H5"/>',
};
const bIco = (k, s) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" stroke-linejoin="miter">${B_ICO[k]}</svg>`;
// fam, icône, valeur et unité écrites dans l'écusson (null : icône seule ou nom de ville), palier, nom, compteur, objectif
const BADGES = (() => {
  const L = [], add = (id, fam, ico, val, unit, tier, name, key, goal) => L.push({ id, fam, ico, val, unit, tier, name, key, goal });
  [[10, 'depart'], [50, 'bronze'], [100, 'argent'], [250, 'or'], [500, 'special']].forEach(([n, t]) => add('km' + n, 'dist', 'distance', String(n), 'km', t, n + ' km au total', 'km', n));
  // sorties longues : la plus longue sortie d'un coup (demande d'Antoine le 29/10)
  [[5, '5', 'depart', '5 km d’un coup'], [10, '10', 'bronze', '10 km d’un coup'], [21.1, '21,1', 'argent', 'Semi-marathon'], [42.2, '42,2', 'or', 'Marathon']].forEach(([n, v, t, nm]) => add('long' + Math.round(n), 'long', 'longue', v, 'km', t, nm, 'best', n));
  [[1, 'depart'], [10, 'bronze'], [25, 'argent'], [50, 'or']].forEach(([n, t]) => add('n' + n, 'n', 'sorties', n === 1 ? '1re' : String(n), n === 1 ? 'sortie' : 'sorties', t, n === 1 ? '1re sortie' : n + ' sorties', 'n', n));
  [[2, 'bronze'], [4, 'argent'], [8, 'or']].forEach(([n, t]) => add('sem' + n, 'reg', 'regularite', String(n), 'sem.', t, n + ' semaines d’affilée', 'streak', n));
  [[5, 'bronze'], [10, 'argent'], [20, 'or']].forEach(([n, t]) => add('zone' + n, 'expl', 'exploration', String(n), 'quartiers', t, n + ' quartiers', 'zones', n)); // arrondissements à Paris et à Lyon, quartiers ailleurs : « quartiers » partout (choix d'Antoine)
  for (const k in CITIES) add('ville-' + k, 'ville', 'ville', null, null, 'ville', CITIES[k].name, 'city:' + k, 1);
  add('mythique', 'defi', 'mythique', null, null, 'special', 'Parcours mythique', 'myth', 1);
  add('piste', 'defi', 'piste', null, null, 'special', 'Séance sur piste', 'piste', 1);
  add('dplus1000', 'defi', 'dplus', '1 000', 'm D+', 'special', '1 000 m de D+', 'up', 1000);
  return L;
})();
function bLoad() { try { const s = JSON.parse(localStorage.getItem(BADGE_K) || 'null'); if (s && s.v === 1) return s; } catch (e) {} return { v: 1, got: {}, seen: {}, geo: {}, km: 0, n: 0, up: 0, weeks: [], zones: [], cities: [], myth: 0, piste: 0 }; }
function bSave(s) { try { localStorage.setItem(BADGE_K, JSON.stringify(s)); } catch (e) {} }
// semaine du lundi au dimanche, en heure locale
const bWeek = iso => { const d = new Date(iso); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
// plus longue suite de semaines d'affilée avec au moins une sortie
function bStreak(weeks) {
  const t = [...new Set(weeks)].map(w => new Date(w + 'T12:00:00').getTime()).sort((a, b) => a - b); let best = 0, run = 0;
  for (let i = 0; i < t.length; i++) { run = i && Math.round((t[i] - t[i - 1]) / 864e5) === 7 ? run + 1 : 1; best = Math.max(best, run); }
  return best;
}
// arrondissements ou quartiers traversés (au moins 150 m dans chacun) et tours de piste d'athlé : seulement pour la ville chargée
function bGeo(e) {
  const ll = decPoly(e.g || ''); if (ll.length < 2) return { z: [], p: 0 };
  const xy = ll.map(([la, lo]) => E.toXY(la, lo)), st = geomRoute(xy), per = new Map();
  for (const [qi, len] of st.quart) { const q = M.quartiers[qi - 1]; if (q && q.ar < 100) per.set(q.ar, (per.get(q.ar) || 0) + len); }
  const z = [...per].filter(([, len]) => len >= 150).map(([ar]) => CITY + ':' + ar);
  // course libre : au moins 150 m courus à moins de 15 m de l'anneau d'une piste
  let p = 0; if (TRACKS.length) {
    const pts = []; for (let i = 1; i < xy.length; i++) { const [ax, ay] = xy[i - 1], [bx, by] = xy[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 10)); for (let k = 0; k < n; k++) pts.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]); }
    const dSeg = (x, y, [ax, ay], [bx, by]) => { const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2)); return Math.hypot(x - ax - vx * t, y - ay - vy * t); };
    for (const t of TRACKS) { let on = 0; for (const [x, y] of pts) { if (Math.abs(x - t.x) > 300 || Math.abs(y - t.y) > 300) continue; for (let i = 0; i < t.ring.length; i++) if (dSeg(x, y, t.ring[i], t.ring[(i + 1) % t.ring.length]) < 15) { on++; break; } }
      if (on >= 15) { p = 1; break; } }
  }
  return { z, p };
}
function bStats(s) { return { km: s.km, best: s.best || 0, n: s.n, up: s.up, streak: bStreak(s.weeks), zones: s.zones.length, myth: s.myth, piste: s.piste, cities: s.cities }; }
const bVal = (b, st) => b.key.startsWith('city:') ? (st.cities.includes(b.key.slice(5)) ? 1 : 0) : st[b.key] || 0;
// met les compteurs à jour avec les sorties pas encore comptées ; renvoie les badges qui viennent d'être obtenus
function badgeSync(quiet) {
  if (!APPF) return [];
  const s = bLoad(), L = mineLoad(), geo = !!(M && G);
  for (const e of L) {
    const id = String(e.id || e.d), c = e.city || 'paris';
    if (!s.seen[id]) { s.seen[id] = 1; s.km += e.km || 0; s.n++; s.up += e.up || 0; const w = bWeek(e.d); if (!s.weeks.includes(w)) s.weeks.push(w); if (!s.cities.includes(c)) s.cities.push(c); if (e.race) s.myth = 1; if (e.pk) s.piste = 1; }
    if (!s.geo[id] && geo && c === CITY && e.g) { s.geo[id] = 1; const g = bGeo(e); for (const z of g.z) if (!s.zones.includes(z)) s.zones.push(z); if (g.p) s.piste = 1; }
  }
  s.best = Math.max(s.best || 0, ...L.map(e => e.km || 0)); // plus longue sortie, sorties déjà faites comprises
  const st = bStats(s), fresh = [];
  for (const b of BADGES) if (!s.got[b.id] && bVal(b, st) >= b.goal) { s.got[b.id] = new Date().toISOString(); fresh.push(b); }
  const first = !s.init; s.init = 1; bSave(s); // première fois : les sorties déjà faites comptent, sans annonce
  if (quiet || first) return [];
  fresh.forEach(b => track('badge-' + b.id, 'Trophée ' + b.name));
  return fresh;
}
// taille de police qui fait tenir un texte dans la largeur utile de l'écusson
const bFit = (txt, base, w, k = 0.54) => Math.floor(Math.min(base, w / (Math.max(1, txt.length) * k)));
function badgeHTML(b, size, got, note) {
  const sh = Math.round(size * 1.12); let inner = '', name = b.fam === 'ville' ? '1re sortie à ' + b.name : b.name, sub = note || ''; // sous l'écusson : le nom en clair, plus le palier (retour d'Antoine le 29/10)
  if (b.tier === 'ville') {
    const fs = bFit(b.name, size * 0.22, size * 0.68, 0.45);
    inner = bIco('ville', Math.round(size * 0.22)) + (fs >= 11 ? `<span class="v nm" style="font-size:${fs}px">${b.name}</span>` : '');
  } else if (b.val == null) inner = bIco(b.ico, Math.round(size * 0.44));
  else inner = bIco(b.ico, Math.round(size * 0.2)) + `<span class="v" style="font-size:${bFit(b.val, size * 0.34, size * 0.62)}px">${b.val}</span><span class="u" style="font-size:${bFit(b.unit, size * 0.15, size * 0.62, 0.5)}px">${b.unit}</span>`;
  const label = `${b.fam === 'defi' ? 'Défi' : 'Trophée'} ${name}${got ? '' : ', à débloquer'}`;
  return `<div class="bdg t-${b.tier}${got ? '' : ' off'}" role="img" aria-label="${label}"><span class="bdg-s" style="width:${size}px;height:${sh}px">${inner}</span><span class="bdg-c" aria-hidden="true"><b>${name}</b>${sub ? `<span>${sub}</span>` : ''}</span></div>`;
}
// après affichage : on mesure le texte réel et on le réduit s'il dépasse ; un nom de ville trop long est retiré de l'écusson (il est déjà dessous)
function bFitDom(root) {
  root.querySelectorAll('.bdg-s .v, .bdg-s .u').forEach(el => {
    const max = el.parentNode.clientWidth * (el.classList.contains('nm') ? 0.68 : 0.64); if (!max) return; let fs = parseFloat(el.style.fontSize) || 12;
    while (el.getBoundingClientRect().width > max && fs > 11) { fs--; el.style.fontSize = fs + 'px'; }
    if (el.getBoundingClientRect().width > max && el.classList.contains('nm')) el.remove();
  });
}
// prochain palier non obtenu de la même famille (pas pour les villes ni les défis à une étape)
function badgeNext(b, s, st) { const n = BADGES.find(x => x.fam === b.fam && x.goal > b.goal && !s.got[x.id] && x.goal > 1); if (!n) return ''; const left = n.goal - bVal(n, st); return `Prochain : ${n.name}, encore ${n.key === 'km' || n.key === 'best' ? fmt(Math.max(0.1, left), 1) + ' km' : n.key === 'up' ? Math.round(left) + ' m' : Math.ceil(left)}.`; }
const B_LEFT = (b, v) => { const l = b.goal - v; return b.key === 'km' || b.key === 'best' ? 'encore ' + fmt(Math.max(0.1, l), 1) + ' km' : b.key === 'up' ? 'encore ' + Math.round(l) + ' m' : 'encore ' + Math.ceil(l); };
function renderBadges() {
  badgeSync(true);
  const s = bLoad(), st = bStats(s), got = BADGES.filter(b => s.got[b.id]), off = BADGES.filter(b => !s.got[b.id]);
  $('#bdg-n').textContent = got.length; $('#bdg-of').textContent = `trophée${got.length > 1 ? 's' : ''} sur ${BADGES.length}`;
  const near = off.filter(b => b.goal > 1).map(b => ({ b, v: bVal(b, st) })).sort((x, y) => y.v / y.b.goal - x.v / x.b.goal).slice(0, 3);
  $('#bdg-near-w').hidden = !near.length;
  $('#bdg-near').innerHTML = near.map(({ b, v }) => `<div class="bdg-pl"><span class="bdg-pi">${bIco(b.ico, 18)}</span><span class="bdg-pt"><span class="bdg-pr"><b>${b.name}</b><span>${B_LEFT(b, v)}</span></span><span class="bdg-pb" role="progressbar" aria-label="Progression vers ${b.name}" aria-valuemin="0" aria-valuemax="${b.goal}" aria-valuenow="${Math.min(b.goal, Math.round(v))}"><i style="width:${Math.min(100, v / b.goal * 100).toFixed(0)}%"></i></span></span></div>`).join('');
  $('#bdg-got-w').hidden = !got.length; $('#bdg-got').innerHTML = got.map(b => badgeHTML(b, 72, true)).join('');
  $('#bdg-off').innerHTML = off.map(b => badgeHTML(b, 72, false, b.goal > 1 ? Math.min(Math.round(bVal(b, st)), b.goal).toLocaleString('fr-FR') + ' / ' + b.goal.toLocaleString('fr-FR') + (b.key === 'km' || b.key === 'best' ? ' km' : b.key === 'up' ? ' m' : '') : '')).join('');
  $('#bdg-off-w').hidden = !off.length; bFitDom($('#mine-badges'));
}
function mineView(v, silent) {
  S.mineView = v; document.querySelectorAll('#mine-seg [data-mv]').forEach(x => x.setAttribute('aria-pressed', x.dataset.mv === v));
  $('#mine-list').hidden = v !== 'runs'; $('#mine-badges').hidden = v !== 'badges';
  if (v !== 'badges') S.badgeBack = false; $('#bdg-back').hidden = !S.badgeBack;
  if (v === 'badges') { renderBadges(); if (!silent) track('badges-vue', 'Trophées ouverts'); }
}
document.querySelectorAll('#mine-seg [data-mv]').forEach(x => x.onclick = () => mineView(x.dataset.mv));
// « Bravo ! » : le ou les badges qui viennent d'être obtenus, avec le prochain palier
function badgeAnnounce(fresh) {
  const box = $('#shx-badge'); if (!box) return; box.hidden = !fresh.length; if (!fresh.length) return;
  const s = bLoad(), st = bStats(s), one = fresh.length === 1;
  $('#shx-badge-k').textContent = one ? 'Nouveau trophée' : `${fresh.length} nouveaux trophées`;
  $('#shx-badge-l').innerHTML = fresh.map(b => badgeHTML(b, one ? 104 : 72, true)).join('');
  bFitDom(box); const nx = one ? badgeNext(fresh[0], s, st) : '';
  $('#shx-badge-t').textContent = one ? (fresh[0].fam === 'ville' ? `Ta première sortie à ${fresh[0].name}.` : fresh[0].key === 'km' ? `${fresh[0].goal} km courus avec Perfect Run.` : fresh[0].name + '.') + (nx ? ' ' + nx : '') : fresh.map(b => b.name).join(' · ');
}
// « Voir mes trophées » met « Bravo ! » de côté : « Revenir à ma sortie » le rouvre, pour ajouter la photo ensuite
$('#shx-badge-go').onclick = () => { S.mineView = 'badges'; S.badgeBack = true; $('#shx').hidden = true; sbSync(); setTab('mine'); };
$('#bdg-back').onclick = () => { S.badgeBack = false; $('#bdg-back').hidden = true; $('#shx').hidden = false; $('#shx-bravo').hidden = false; $('#shx-out').hidden = true; sbSync(); };
$('#send').onclick = () => { if (!S.route) return; const d = shareData(); sendLink(routeCode(S.route), d ? mineTitle(d) : '', S.route.len / 1000); };
