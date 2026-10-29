// ---------- départ : ouvrir la recherche, « Autour de moi » (D-70) ----------
function openStart(focus) { if (MPHR) { if (focus) mOpen('dep', 'start'); return; } $('#start-box').hidden = false; $('#change-start').setAttribute('aria-expanded', true); $('#change-start').textContent = 'Fermer'; if (focus) $('#start-q').focus(); }
function locate() {
  return new Promise(res => {
    if (!navigator.geolocation) { toast('Ta position n’est pas disponible sur cet appareil : choisis un départ.', 4000); openStart(false); return res(false); }
    toast('Recherche de ta position…', 10000);
    navigator.geolocation.getCurrentPosition(p => {
      const la = p.coords.latitude, lo = p.coords.longitude, [x, y] = E.toXY(la, lo), n = E.nearest(x, y);
      if (n < 0 || Math.hypot(G.NX[n] - x, G.NY[n] - y) > 800) { $('#toast').hidden = true; if (!cityHint(la, lo)) toast(`Tu sembles hors de ${C0.name} et des communes voisines : choisis un départ.`, 4500); openStart(false); return res(false); }
      cityHint(la, lo);
      $('#toast').hidden = true; setPoint('start', { lat: la, lon: lo, name: 'Ma position' }); if (!$('#start-box').hidden) $('#change-start').click(); fitRoute(true); res(true);
    }, e => { toast(e.code === 1 ? 'Position refusée : choisis un départ dans la recherche.' : 'Position introuvable : choisis un départ dans la recherche.', 4500); openStart(false); res(false); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
}
$('#pos-go').onclick = () => locate().then(ok => { if (ok && S.mode === 'loop') generate(); });
// réglages passés dans le lien, depuis l'accueil : ?km=10&arr=back&dep=pos&type=green&go=1, ou ?race=marathon
function applyParams() {
  const Q = new URLSearchParams(location.search); if (![...Q.keys()].some(k => k !== 'ville' && k !== 'web')) return false;
  if (Q.has('p')) { if (openFixed(Q.get('p'), Q.get('n') || '', !Q.has('refaire'))) track('recu', APPF ? 'Parcours reçu ouvert' : 'Parcours reçu ouvert sur le site'); else { linkErr(true); track('recu', 'Lien de parcours incomplet'); } return true; }
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
$('#pick-end').onclick = () => setTool('end');
let tt; function toast(m, ms = 2600) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, ms); }

// ---------- réglages ----------
function seg(ids, onPick) { ids.forEach(id => $('#' + id).onclick = () => { ids.forEach(j => $('#' + j).setAttribute('aria-pressed', j === id)); onPick(id); }); }
// Arrivée : En boucle / Jusqu'à un lieu / N'importe où (mêmes mots que l'accueil)
function setArrival(k) {
  ['back', 'place', 'free'].forEach(j => $('#a-' + j).setAttribute('aria-pressed', j === k));
  S.mode = k === 'back' ? 'loop' : 'ab'; S.endFree = k === 'free';
  $('#end-fixed').hidden = k !== 'place'; $('#end-free-hint').hidden = k !== 'free'; $('#end-metro-row').hidden = k !== 'free' || !METRO.st.length;
  if (k === 'place' && !S.end) { const p = M.poi.find(p => p[0] === C0.end[0]) || [C0.end[0], 'park', C0.end[1], C0.end[2]]; setPoint('end', { lat: p[2], lon: p[3], name: p[0] }); }
  applyModeLabels(); if (typeof TRACKS !== 'undefined') $('#via-track').hidden = !TRACKS.length || S.mode !== 'loop' || S.vias.some(v => v.track); draw();
}
['back', 'place', 'free'].forEach(k => $('#a-' + k).onclick = () => setArrival(k));
// Rues très fréquentées (D-109) : pénalité pleine de 10 h à 20 h, moitié de 8 h à 10 h et de 20 h à 23 h, presque rien la nuit
function crowdAt(d) { const h = d.getHours(); return h >= 10 && h < 20 ? 1 : (h >= 8 && h < 10) || (h >= 20 && h < 23) ? 0.5 : 0.1; }
function applyModeLabels() {
  const ab = S.mode === 'ab';
  $('#start-pin').textContent = 'D';
  $('#start-sub').textContent = ab ? 'Départ' : 'Départ et arrivée';
  $('#start-q').placeholder = 'Rechercher un départ (adresse, lieu, rue…)';
  $('#tl-start').textContent = 'Placer le départ';
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
// Priorité (D-95) : moins de feux / équilibré / lignes droites ; remplace « Éviter les feux rouges » et « Limiter / Au maximum »
const PRIO = {
  few: { sig: 2, w: { sig: 450, turn: 150, turnRun: 100, turnFar: 0.3 }, score: 1.5, txt: 'moins de feux', hint: 'Moins de feux : des petites rues, donc plus de virages. Une des propositions sera la plus simple.' },
  eq: { sig: 1, w: { sig: 250, turn: 150, turnRun: 100, turnFar: 0.3 }, score: 0.5, txt: 'équilibré', hint: 'Équilibré : peu de feux, sans tourner sans arrêt. Une des propositions sera la plus simple.' },
  turn: { sig: 1, w: { sig: 120, turn: 2500, turnRun: 800, turnFar: 0.7, road: [0.8, 0.4, 0, 0] }, score: 0.15, simple: true, txt: 'lignes droites', hint: 'Lignes droites : de grands axes et peu de virages, un tour facile à retenir. Plus de feux. Une des propositions aura le moins de feux.' }
};
function setPrio(k, save) { if (!PRIO[k]) k = 'eq'; S.prio = k; S.sig = PRIO[k].sig; ['few', 'eq', 'turn'].forEach(j => $('#p-' + j).setAttribute('aria-pressed', j === k)); $('#prio-hint').textContent = PRIO[k].hint; if (save) try { localStorage.setItem('runparis-prio', k); } catch (e) {} }
['few', 'eq', 'turn'].forEach(k => $('#p-' + k).onclick = () => setPrio(k, true));
{ let k = 'eq'; try { k = localStorage.getItem('runparis-prio') || 'eq'; } catch (e) {} setPrio(k, false); }
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
$('#ly-track').onclick = e => { S.showTrack = !S.showTrack; e.currentTarget.setAttribute('aria-pressed', S.showTrack); draw(); if (S.showTrack) track('calque-pistes', 'Calque pistes d’athlé'); };
// toucher une piste : son nom, et « Y passer » l'ajoute aux lieux par où passer (parcours échauffement → piste → retour)
function trackAt(sx, sy) { const mx = (sx - V.tx) / V.s, my = (sy - V.ty) / V.s; let best = null, bd = 26;
  for (const t of TRACKS) { const d = Math.hypot(t.x * V.s + V.tx - sx, t.y * V.s + V.ty - sy); if (d < bd) { bd = d; best = t; } }
  if (!best && V.s >= 0.25) best = TRACKS.find(t => Math.abs(t.x - mx) < 400 && Math.abs(t.y - my) < 400 && pip([my, mx], t.ring.map(([x, y]) => [y, x]))) || null; return best; }
function trackCard(t) {
  const [lat, lon] = E.toLL(t.x, t.y), name = t.n || 'Piste d’athlétisme', toastEl = $('#toast'); toastEl.innerHTML = '';
  toastEl.append(`${name} · piste d’environ ${t.lap} m`); const u = document.createElement('button'); u.type = 'button'; u.className = 'undo'; u.textContent = 'Y passer';
  u.onclick = () => { toastEl.hidden = true; if (S.vias.some(v => v.track === t)) return; if (S.mode !== 'loop') toast('Les pistes s’ajoutent aux boucles : choisis « En boucle ».'); addVia({ lat, lon, name: 'Piste · ' + name, track: t }); track('piste', 'Piste ajoutée'); if (S.mode === 'loop') toast('Piste ajoutée aux lieux où passer : choisis ta distance et lance la boucle.', 4000); };
  toastEl.appendChild(u); toastEl.hidden = false; clearTimeout(tt); tt = setTimeout(() => toastEl.hidden = true, 6000);
}
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
// légende : ouverte par défaut sur grand écran, fermée sur téléphone ; choix gardé sur l'appareil
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

// ramener la carte à l'écran après un calcul (utile quand la page est étroite et la carte au-dessus du panneau)
function scrollToMap() {
  if (MOB.matches) { setSheet('half', true); return; }
  const r = $('#mapwrap').getBoundingClientRect();
  if (r.top < -10 || r.top > innerHeight * 0.4) window.scrollTo({ top: Math.max(0, scrollY + r.top), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
// ---------- Lancer en 2 gestes (D-107) : l'app rouvre avec les réglages de la dernière fois (gardés sur l'appareil) ----------
// Gardé à chaque « Générer » : distance ou durée, allure, arrivée (boucle / n'importe où), départ « Chez moi » ou « autour de moi »,
// préférences ; zones et lieux à éviter par ville. Pas gardé : départ cherché ou posé, « jusqu'à un lieu », « Passer par ».
const LAST_K = 'runparis-last';
let LAST_DEF = null;
function lastLoad() { try { return JSON.parse(localStorage.getItem(LAST_K) || 'null'); } catch (e) { return null; } }
function lastSave() { try {
  const st = S.start && S.start.name || '';
  const g = { unit: S.unit, km: $('#km').value, dur: $('#dur').value, pace: $('#pace').value, arr: S.mode === 'loop' ? 'back' : S.endFree ? 'free' : null, kind: S.kind, dmode: S.dmode, dplus: $('#dplus').value,
    paths: $('#prefer-paths').checked, metro: $('#end-metro').checked, crowd: $('#avoid-crowd').checked, dep: /^Chez moi/.test(st) ? 'home' : st === 'Ma position' ? 'pos' : null };
  const o = lastLoad() || {}; o.g = g; o.c = o.c || {}; o.c[CITY] = { q: [...S.exclQ], p: S.places.map(({ lat, lon, r, name }) => ({ lat, lon, r, name })) };
  localStorage.setItem(LAST_K, JSON.stringify(o)); } catch (e) {} }
function lastSet(g, c) {
  setUnit(g.unit === 'min' ? 'min' : 'km'); $('#km').value = g.km; $('#dur').value = g.dur; $('#pace').value = g.pace;
  setArrival(g.arr || 'back');
  const kb = $('#k-' + (g.kind || 'classic')); (kb && !kb.disabled ? kb : $('#k-classic')).click();
  ($('#d-' + (g.dmode || 'any')) || $('#d-any')).click(); $('#dplus').value = g.dplus;
  $('#prefer-paths').checked = g.paths !== false; $('#end-metro').checked = g.metro !== false; $('#avoid-crowd').checked = g.crowd !== false;
  S.exclQ = new Set(((c && c.q) || []).filter(id => M.quartiers.some(q => q.id === id))); S.places = (c && c.p) || []; zonesChanged(); renderPlaces();
  updateConv(); if (typeof msync === 'function') msync();
}
function lastApply() {
  LAST_DEF = { unit: 'km', km: $('#km').value, dur: $('#dur').value, pace: $('#pace').value, arr: 'back', kind: 'classic', dmode: S.dmode, dplus: $('#dplus').value, paths: $('#prefer-paths').checked, metro: $('#end-metro').checked, crowd: true };
  const o = lastLoad(); if (!o || !o.g) return null;
  lastSet(Object.assign({}, LAST_DEF, o.g), (o.c || {})[CITY]); $('#last-line').hidden = false; return o.g;
}
$('#last-reset').onclick = () => { try { localStorage.removeItem(LAST_K); } catch (e) {} if (LAST_DEF) lastSet(LAST_DEF, null); $('#last-line').hidden = true; toast('Réglages remis à zéro.'); };
// ---------- type de parcours ----------
const KHINT = { green: 'Passe au maximum par les parcs, jardins, quais et rues bordées d’arbres (≈ 160 000 arbres recensés dans OpenStreetMap), quitte à faire quelques détours.', discover: 'Passe devant des monuments et lieux connus à portée de ta distance. Tu peux aussi choisir tes lieux avec « Passer par un lieu ».' };
['classic', 'green', 'discover'].forEach(k => $('#k-' + k).onclick = () => { S.kind = k; ['classic', 'green', 'discover'].forEach(j => $('#k-' + j).setAttribute('aria-pressed', j === k)); $('#k-hint').hidden = k === 'classic'; $('#k-hint').textContent = KHINT[k] || ''; });
// ---------- lieux par où passer ----------
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
  box.appendChild(add); msync();
  $('#via-track').hidden = !TRACKS.length || S.mode !== 'loop' || S.vias.some(v => v.track);
}
// « Passer par » : la piste d'athlé la plus proche du départ, sans la chercher sur la carte (D-116)
$('#via-track').onclick = () => {
  if (!S.start) return toast('Choisis d’abord ton départ.');
  const [sx, sy] = E.toXY(S.start.lat, S.start.lon); let best = null, bd = 1e9;
  for (const t of TRACKS) { const d = Math.hypot(t.x - sx, t.y - sy); if (d < bd) { bd = d; best = t; } }
  if (!best || bd > 6000) return toast('Pas de piste d’athlé à moins de 6 km du départ.');
  const [lat, lon] = E.toLL(best.x, best.y), name = best.n || 'Piste d’athlétisme';
  addVia({ lat, lon, name: 'Piste · ' + name, track: best }); track('piste', 'Piste la plus proche');
  toast(`${name} · piste d’environ ${best.lap} m, à ${bd < 1000 ? Math.round(bd / 50) * 50 + ' m' : fmt(bd / 1000, 1) + ' km'} du départ.`, 4000);
};
searchBox($('#via-q'), $('#via-res'), h => { addVia({ lat: h.lat, lon: h.lon, name: h.name }); });
// ---------- parcours mythiques ----------
function setTab(t) {
  const prev = S.tab; if (t !== 'mine') S.badgeBack = false;
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
