// ---------- onboarding (application) : Bienvenue, Où cours-tu ?, Ta position, Trophées, C'est prêt ----------
// écrans dans l'ordre : 1, 2, 3, 5 (trophées, ajouté le 30/10), 4 ; les points suivent cet ordre
const ONB_POS = { 1: 1, 2: 2, 3: 3, 5: 4, 4: 5 };
// Montré une seule fois (runparis-onb), aussi aux utilisateurs déjà installés à la mise à jour (« Choisis tes villes »).
// Les villes choisies se téléchargent dès l'écran 2 et pendant l'écran 3. Sur le site : seulement avec ?onb=1, pour la recette (téléchargement simulé).
const ONB_K = 'runparis-onb';
const ONB_DEMO = !NATIVE && APPF && /[?&]onb=1\b/.test(location.search);
const onbDone = () => { try { return localStorage.getItem(ONB_K) === '1'; } catch (e) { return false; } };
// utilisateur déjà installé : il a des sorties, des réglages gardés ou une ville choisie avant cette version
const ONB_OLD = (() => { try { return !!(localStorage.getItem('runparis-done') || localStorage.getItem('runparis-last') || CITY_STORED); } catch (e) { return false; } })();
const ONB = { step: 1, pick: new Set(), idx: null, prog: {}, err: new Set(), done: new Set(), queue: null, resolve: null };
const onbCities = () => Object.keys(CITIES);
const mo = b => b >= 1e6 ? fmt(b / 1e6, 1) + '\u00a0Mo' : Math.max(1, Math.round(b / 1e3)) + '\u00a0Ko'; // espace insécable : « 4,0 Mo » ne se coupe pas
function onbShow(n) {
  ONB.step = n; document.querySelectorAll('#onb [data-step]').forEach(s => s.hidden = +s.dataset.step !== n);
  document.querySelectorAll('#onb .onb-dots').forEach(d => d.innerHTML = [1, 2, 3, 4, 5].map(i => `<span class="${i === ONB_POS[n] ? 'on' : i < ONB_POS[n] ? 'past' : ''}"></span>`).join(''));
  // retour : pas sur le premier écran ; de « C'est prêt », retour au choix des villes
  document.querySelectorAll('#onb .onb-back').forEach(b => b.hidden = n === 1 || (n === 2 && ONB_OLD));
  $('#onb').scrollTop = 0; track('onb-' + n, 'Onboarding · écran ' + n);
  if (n === 4) { const m = document.querySelector('#onb [data-step="4"] .onb-map'); if (!m.innerHTML) m.innerHTML = document.querySelector('#onb [data-step="1"] .onb-map').innerHTML; }
  if (n === 5 && !$('#onb-bdg').innerHTML) { const B = id => BADGES.find(b => b.id === id); $('#onb-bdg').innerHTML = [B('n1'), B('ville-' + CITY), B('myst-leve'), B('km50'), B('sem4'), B('zone20')].map(b => badgeHTML(b, 72, b.fam !== 'myst')).join(''); bFitDom($('#onb-bdg')); document.querySelectorAll('#onb-bdg-pts [data-ico]').forEach(li => li.insertAdjacentHTML('afterbegin', bIco(li.dataset.ico, 20))); } // mêmes icônes que dans les écussons
  if (n === 2) onbCityList(); if (n >= 3) onbProgress();
}
// écran 2 : la liste des villes, avec leur poids
function onbCityList() {
  const box = $('#onb-cities'); box.innerHTML = '';
  for (const k of onbCities()) {
    const c = CITIES[k], on = ONB.pick.has(k), b = ONB.idx && ONB.idx.cities[k] ? ONB.idx.cities[k].bytes : 0;
    const l = document.createElement('label'); l.className = 'onb-city' + (on ? ' on' : '');
    l.innerHTML = `<input type="checkbox"${on ? ' checked' : ''}><span class="onb-box" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span class="onb-ct"><b></b><span></span></span>${ONB.near === k ? '<span class="onb-tag">Près de toi</span>' : ''}`;
    l.querySelector('b').textContent = c.name; l.querySelector('.onb-ct span').textContent = c.sub + (b ? ' · ' + mo(b) : '');
    l.querySelector('input').onchange = e => { e.target.checked ? ONB.pick.add(k) : ONB.pick.delete(k); onbCityList(); };
    box.appendChild(l);
  }
  for (const n of CITY_SOON) { const d = document.createElement('div'); d.className = 'onb-city off'; d.innerHTML = '<span class="onb-box" aria-hidden="true"></span><span class="onb-ct"><b></b></span><span class="onb-soon">Bientôt</span>'; d.querySelector('b').textContent = n; box.appendChild(d); }
  const n = ONB.pick.size, tot = [...ONB.pick].reduce((t, k) => t + (ONB.idx && ONB.idx.cities[k] ? ONB.idx.cities[k].bytes : 0), 0);
  $('#onb-dl').disabled = !n; $('#onb-dl').textContent = n ? `Télécharger ${n} ville${n > 1 ? 's' : ''}` : 'Choisis au moins une ville';
  $('#onb-dl-note').textContent = (tot ? mo(tot) + ' · ' : '') + 'Menu › Mes villes pour en ajouter plus tard';
}
// téléchargement des villes choisies, l'une après l'autre (la ville affichée d'abord)
// une ville ratée n'arrête pas les autres ; elle pourra être reprise (Réessayer, ou plus tard à l'ouverture de la ville)
const onbList = () => [...ONB.pick].sort((a, b) => (b === CITY) - (a === CITY));
async function onbDownload() {
  if (ONB.busy) return; ONB.busy = true; ONB.err.clear(); onbProgress();
  for (const k of onbList()) {
    if (ONB.done.has(k)) continue;
    try {
      if (ONB_DEMO) { for (let p = 0; p <= 1; p += 0.25) { ONB.prog[k] = p; onbProgress(); await new Promise(r => setTimeout(r, 120)); } const s = dlState(); s[k] = { h: 'demo', bytes: ONB.idx && ONB.idx.cities[k] ? ONB.idx.cities[k].bytes : 0, at: new Date().toISOString() }; dlSave(s); }
      else await cityDownload(k, p => { ONB.prog[k] = p; onbProgress(); }, ONB.idx);
      ONB.done.add(k); ONB.prog[k] = 1;
    } catch (e) { ONB.err.add(k); track('ville-echec', 'Téléchargement de ville raté'); }
    onbProgress();
  }
  ONB.busy = false; onbProgress();
}
function onbProgress() {
  const list = onbList(), html = list.map(k => {
    const ok = ONB.done.has(k), p = Math.round((ONB.prog[k] || 0) * 100), err = ONB.err.has(k);
    return `<div class="onb-prog${err ? ' err' : ''}"><div class="onb-pr"><b>${CITIES[k].name}</b>${ok ? '<span class="ok">Prête</span>' : err ? '<span>Interrompu</span>' : `<span>${p} %</span>`}</div>${ok ? '' : `<span class="onb-bar" role="progressbar" aria-label="Téléchargement de ${CITIES[k].name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><i style="width:${p}%"></i></span>`}</div>`; }).join('');
  document.querySelectorAll('#onb .onb-progs').forEach(b => b.innerHTML = html);
  // on peut partir dès que la première ville est prête ; les autres finissent derrière
  const first = list.find(k => ONB.done.has(k)), ready = !!first && (ONB.done.has(list[0]) || !ONB.busy);
  document.querySelectorAll('#onb .onb-neterr').forEach(e => e.hidden = !ONB.err.size || ONB.busy);
  // rien de prêt et téléchargement arrêté sur une erreur : le bouton principal devient « Réessayer »
  const retry = !ready && ONB.err.size && !ONB.busy, go = $('#onb-go'); ONB.ready = ready;
  if (go) { go.disabled = !ready && !retry; go.textContent = ready ? 'Créer mon premier parcours' : retry ? 'Réessayer' : 'Téléchargement…'; }
  // écran 4 selon la situation : en cours, prêt, impossible (sans réseau), ou prêt avec une ville ratée
  const t4 = $('#onb-t4'), p4 = $('#onb-p4'), part = $('#onb-part'); if (!t4) return;
  const names = ks => ks.map(k => CITIES[k].name).join(', '), failed = list.filter(k => ONB.err.has(k));
  if (ready) { t4.textContent = 'C’est prêt'; p4.textContent = 'Il ne te reste qu’à créer ton premier parcours !'; }
  else if (retry) { t4.textContent = 'Pas de connexion'; p4.textContent = 'Il faut internet une première fois pour télécharger les rues de ' + names(failed) + '. Ensuite, l’app marche sans réseau. Reconnecte-toi, puis réessaie.'; }
  else { t4.textContent = 'Presque prêt'; p4.textContent = 'Les rues de ' + names(list.filter(k => !ONB.done.has(k))) + ' se téléchargent. Quelques secondes…'; }
  part.hidden = !(ready && failed.length && !ONB.busy);
  if (!part.hidden) part.innerHTML = `<b>${names(failed)} n’a pas pu se télécharger.</b> Tu pourras ${failed.length > 1 ? 'les' : 'la'} reprendre dans Menu › Mes villes.`;
}
// à la fin : la ville affichée doit être sur le téléphone, sinon on passe sur la première ville choisie
function onbFinish() {
  try { localStorage.setItem(ONB_K, '1'); } catch (e) {}
  S.onbJust = true; track('onb-fin', 'Onboarding terminé');
  const keep = ONB.done.has(CITY) || dlState()[CITY] ? CITY : onbList().find(k => ONB.done.has(k)) || CITY;
  if (keep !== CITY) { setCity(keep); return; }
  $('#onb').hidden = true; sbSync(); ONB.resolve && ONB.resolve(true);
}
async function onboarding() {
  const o = $('#onb'); o.hidden = false; splashDone();
  o.classList.toggle('old', ONB_OLD);
  // villes pré-cochées : celle où l'on est si la position est déjà autorisée ; un ancien utilisateur garde sa ville et celles de ses sorties
  if (ONB_OLD) { ONB.pick.add(CITY); for (const e of mineLoad()) if (e.city && CITIES[e.city]) ONB.pick.add(e.city); }
  const near = await new Promise(res => {
    const go = () => navigator.geolocation.getCurrentPosition(p => res(cityAt(p.coords.latitude, p.coords.longitude)), () => res(null), { maximumAge: 600000, timeout: 4000 });
    if (NATIVE) NP.geo.checkPermissions().then(r => r && r.location === 'granted' ? go() : res(null)).catch(() => res(null)); else res(null);
  });
  if (near) { ONB.near = near; if (!ONB_OLD) ONB.pick.add(near); }
  ONB.posOk = !!near;
  dlIndex().then(i => { ONB.idx = i; if (ONB.step === 2) onbCityList(); }).catch(() => {});
  onbShow(ONB_OLD ? 2 : 1);
  return new Promise(r => { ONB.resolve = r; });
}
$('#onb-start').onclick = () => onbShow(2);
document.querySelectorAll('#onb .onb-back').forEach(b => b.onclick = () => onbShow(ONB.step === 4 ? 5 : ONB.step === 5 ? 2 : ONB.step - 1));
// « Plus tard » : on sort à tout moment ; sans ville sur le téléphone, l'app propose de la choisir au lieu de bloquer
document.querySelectorAll('#onb .onb-exit').forEach(b => b.onclick = () => { track('onb-plus-tard', 'Onboarding · Plus tard · écran ' + ONB.step); onbFinish(); });
$('#onb-dl').onclick = () => { if (!ONB.pick.size) return; onbDownload(); onbShow(ONB.posOk ? 5 : 3); };
$('#onb-pos').onclick = () => { const next = () => onbShow(5); if (NATIVE) NP.geo.requestPermissions({ permissions: ['location'] }).then(next, next); else next(); };
$('#onb-later').onclick = () => onbShow(5);
$('#onb-bdg-go').onclick = () => onbShow(4);
document.querySelectorAll('#onb .onb-retry').forEach(b => b.onclick = () => onbDownload());
$('#onb-go').onclick = () => ONB.ready ? onbFinish() : onbDownload();
// au lancement : onboarding si besoin, puis la ville affichée doit être sur le téléphone
async function onbGate() {
  if ((NATIVE || ONB_DEMO) && (!onbDone() || ONB_DEMO)) { if (NATIVE) await dlRoot(); await onboarding(); }
  return NATIVE ? dlReady() : true;
}
// ---------- Menu › Mes villes : villes sur le téléphone, mises à jour, suppression, ajout (application) ----------
const DLX = { idx: null, busy: {} };
const DL_SEEN = 'runparis-villes-vu'; // empreintes des mises à jour déjà signalées (une seule annonce par mise à jour)
const dlUpdates = () => { const st = dlState(), i = DLX.idx; return i ? Object.keys(st).filter(k => i.cities[k] && i.cities[k].h !== st[k].h) : []; };
// au lancement, en silence : y a-t-il de nouvelles données pour une ville du téléphone ? (pas de mise à jour automatique en v1)
async function dlCheck() {
  if (!NATIVE && !ONB_DEMO) return;
  try { DLX.idx = await dlIndex(); } catch (e) { return; }
  const up = dlUpdates(); $('#m-villes').classList.toggle('dot', !!up.length);
  let seen = {}; try { seen = JSON.parse(localStorage.getItem(DL_SEEN) || '{}'); } catch (e) {}
  const fresh = up.filter(k => seen[k] !== DLX.idx.cities[k].h); if (!fresh.length) return;
  for (const k of fresh) seen[k] = DLX.idx.cities[k].h; try { localStorage.setItem(DL_SEEN, JSON.stringify(seen)); } catch (e) {}
  const t = $('#toast'); t.innerHTML = ''; t.append(`Nouvelles données pour ${fresh.map(k => CITIES[k].name).join(', ')}`);
  const u = document.createElement('button'); u.type = 'button'; u.className = 'undo'; u.textContent = 'Voir'; u.onclick = () => { t.hidden = true; aboutOpen('villes'); };
  t.appendChild(u); t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 6000);
}
function mvRender() {
  const b = $('#mv'); if (!b) return; const st = dlState(), i = DLX.idx, have = Object.keys(CITIES).filter(k => st[k]), miss = Object.keys(CITIES).filter(k => !st[k]);
  b.innerHTML = `<p class="mv-p">Les rues de ces villes sont sur ton téléphone : l’app marche sans réseau.${have.length > 1 ? ' Glisse une ville vers la gauche pour la supprimer (pas celle qui est affichée).' : ''}</p><div class="mv-list" id="mv-have"></div>` +
    (miss.length || CITY_SOON.length ? '<div class="lbl mv-h">Ajouter une ville</div><div class="mv-list" id="mv-miss"></div>' : '');
  for (const k of have) {
    const up = i && i.cities[k] && i.cities[k].h !== st[k].h, busy = DLX.busy[k];
    const row = document.createElement('div'); row.className = 'mine-row mv-row';
    row.innerHTML = `<div class="mv-card"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.5s-7-6.3-7-11.5a7 7 0 0 1 14 0c0 5.2-7 11.5-7 11.5z"/><path d="M9.5 10a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0"/></svg><span class="mv-t"><b></b><span></span></span><span class="mv-s"></span></div><button type="button" class="mine-del" tabindex="-1">Supprimer</button>`;
    row.querySelector('b').textContent = CITIES[k].name + (k === CITY ? ' · affichée' : '');
    row.querySelector('.mv-t span').textContent = mo(st[k].bytes || 0);
    const s = row.querySelector('.mv-s');
    if (busy != null) s.innerHTML = `<span class="mv-pc">${Math.round(busy * 100)} %</span>`;
    else if (up) { const u = document.createElement('button'); u.type = 'button'; u.className = 'btn ghost mv-up'; u.innerHTML = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>Mettre à jour'; u.setAttribute('aria-label', 'Mettre à jour ' + CITIES[k].name); u.onclick = () => mvGet(k, true); s.appendChild(u); }
    else s.innerHTML = '<span class="mv-ok">À jour</span>';
    if (have.length > 1 && k !== CITY) mineSwipe(row, row.firstChild, k, mvDel); else row.querySelector('.mine-del').remove();
    $('#mv-have').appendChild(row);
  }
  for (const k of miss) {
    const c = i && i.cities[k], busy = DLX.busy[k], r = document.createElement('button'); r.type = 'button'; r.className = 'mv-add';
    r.innerHTML = `<span class="mv-t"><b></b><span></span></span>${busy != null ? `<span class="mv-pc">${Math.round(busy * 100)} %</span>` : '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg>'}`;
    r.querySelector('b').textContent = CITIES[k].name; r.querySelector('.mv-t span').textContent = CITIES[k].sub + (c ? ' · ' + mo(c.bytes) : '');
    r.setAttribute('aria-label', 'Télécharger ' + CITIES[k].name); r.disabled = busy != null; r.onclick = () => mvGet(k, false);
    $('#mv-miss').appendChild(r);
  }
  for (const n of CITY_SOON) { const d = document.createElement('div'); d.className = 'mv-add off'; d.innerHTML = '<span class="mv-t"><b></b></span><span class="mv-soon">Bientôt</span>'; d.querySelector('b').textContent = n; $('#mv-miss').appendChild(d); }
}
// télécharger ou mettre à jour une ville depuis Mes villes
async function mvGet(k, update) {
  if (DLX.busy[k] != null) return; DLX.busy[k] = 0; mvRender();
  try {
    if (!DLX.idx) DLX.idx = await dlIndex();
    if (ONB_DEMO) { for (let p = 0; p <= 1; p += 0.25) { DLX.busy[k] = p; mvRender(); await new Promise(r => setTimeout(r, 120)); } const s = dlState(); s[k] = { h: DLX.idx.cities[k].h, bytes: DLX.idx.cities[k].bytes, at: new Date().toISOString() }; dlSave(s); }
    else await cityDownload(k, p => { DLX.busy[k] = p; mvRender(); }, DLX.idx);
    delete DLX.busy[k]; mvRender(); $('#m-villes').classList.toggle('dot', !!dlUpdates().length);
    if (update) track('ville-maj-' + k, 'Ville mise à jour ' + CITIES[k].name);
    if (update && k === CITY) { toast(`${CITIES[k].name} à jour : la carte se recharge.`, 2000); setTimeout(() => setCity(k, null, true), 1200); }
    else toast(update ? `${CITIES[k].name} à jour.` : `${CITIES[k].name} est sur ton téléphone.`);
  } catch (e) { delete DLX.busy[k]; mvRender(); track('ville-echec', 'Téléchargement de ville raté'); toast('Téléchargement interrompu : vérifie ta connexion et réessaie.', 3500); }
}
// supprimer une ville : « Annuler » pendant 5 s, puis les fichiers sont effacés ; ni la dernière ville, ni la ville affichée (retour d'Antoine le 29/10)
let mvT = null;
function mvDel(k) {
  const st = dlState();
  if (Object.keys(st).length < 2) { toast('Garde au moins une ville.'); mvRender(); return; }
  if (k === CITY) { toast(`${CITIES[k].name} est affichée : passe sur une autre ville pour la supprimer.`, 3500); mvRender(); return; }
  const gone = st[k]; delete st[k]; dlSave(st); mvRender(); track('ville-supprimee-' + k, 'Ville supprimée ' + CITIES[k].name);
  const t = $('#toast'); t.innerHTML = ''; t.append(`${CITIES[k].name} supprimée`); const u = document.createElement('button'); u.type = 'button'; u.className = 'undo'; u.textContent = 'Annuler';
  let undone = false; u.onclick = () => { undone = true; clearTimeout(mvT); const s = dlState(); s[k] = gone; dlSave(s); mvRender(); t.hidden = true; };
  t.appendChild(u); t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 5000);
  // minuterie à part : un autre message ne doit pas annuler l'effacement
  clearTimeout(mvT); mvT = setTimeout(() => { if (!undone && NATIVE && !dlState()[k]) NP.fs.rmdir({ path: 'villes/' + k, directory: 'DATA', recursive: true }).catch(() => {}); }, 5000);
}
// passer sur une ville absente du téléphone : on propose de la télécharger d'abord
async function cityAsk(k, extra) {
  const c = CITIES[k]; $('#about-t').textContent = `Télécharger ${c.name} ?`; $('#about-f').hidden = true; $('#about').hidden = false;
  const b = $('#about-b'); b.innerHTML = `<div class="mv-ask"><p></p><div class="onb-progs" id="ask-prog"></div><button type="button" class="btn primary" id="ask-go">Télécharger</button><button type="button" class="textbtn" id="ask-no">Annuler</button></div>`;
  const p = b.querySelector('p'); p.textContent = `Les rues de ${c.name} et de ses communes voisines. Ensuite, ${c.name} marche sans réseau.`;
  $('#ask-no').onclick = () => { $('#about').hidden = true; };
  try { if (!DLX.idx) DLX.idx = await dlIndex(); p.textContent = `Les rues de ${c.name} et de ses communes voisines : ${mo(DLX.idx.cities[k].bytes)}. Ensuite, ${c.name} marche sans réseau.`; } catch (e) {}
  $('#ask-go').onclick = async () => {
    const go = $('#ask-go'); go.disabled = true; go.textContent = 'Téléchargement…';
    const show = q => { $('#ask-prog').innerHTML = `<div class="onb-prog"><div class="onb-pr"><b>${c.name}</b><span>${Math.round(q * 100)} %</span></div><span class="onb-bar" role="progressbar" aria-label="Téléchargement de ${c.name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(q * 100)}"><i style="width:${Math.round(q * 100)}%"></i></span></div>`; };
    try {
      if (ONB_DEMO) { for (let q = 0; q <= 1; q += 0.25) { show(q); await new Promise(r => setTimeout(r, 120)); } const s = dlState(); s[k] = { h: 'demo', bytes: 0, at: new Date().toISOString() }; dlSave(s); }
      else { if (!DLX.idx) DLX.idx = await dlIndex(); await cityDownload(k, show, DLX.idx); }
      setCity(k, extra, true);
    } catch (e) { go.disabled = false; go.textContent = 'Réessayer'; $('#ask-prog').innerHTML = '<div class="note err" role="alert"><b>Téléchargement interrompu</b> Vérifie ta connexion, puis réessaie.</div>'; track('ville-echec', 'Téléchargement de ville raté'); }
  };
}
if (NATIVE || ONB_DEMO) { $('#m-villes').hidden = false; setTimeout(dlCheck, 4000); }
