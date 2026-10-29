// ---------- onboarding (application) : Bienvenue, Où cours-tu ?, Ta position, C'est prêt ----------
// Montré une seule fois (runparis-onb), aussi aux utilisateurs déjà installés à la mise à jour (« Choisis tes villes »).
// Les villes choisies se téléchargent dès l'écran 2 et pendant l'écran 3. Sur le site : seulement avec ?onb=1, pour la recette (téléchargement simulé).
const ONB_K = 'runparis-onb';
const ONB_DEMO = !NATIVE && APPF && /[?&]onb=1\b/.test(location.search);
const onbDone = () => { try { return localStorage.getItem(ONB_K) === '1'; } catch (e) { return false; } };
// utilisateur déjà installé : il a des sorties, des réglages gardés ou une ville choisie avant cette version
const ONB_OLD = (() => { try { return !!(localStorage.getItem('runparis-done') || localStorage.getItem('runparis-last') || CITY_STORED); } catch (e) { return false; } })();
const ONB = { step: 1, pick: new Set(), idx: null, prog: {}, err: new Set(), done: new Set(), queue: null, resolve: null };
const onbCities = () => Object.keys(CITIES);
const mo = b => b >= 1e6 ? fmt(b / 1e6, 1) + ' Mo' : Math.max(1, Math.round(b / 1e3)) + ' Ko';
function onbShow(n) {
  ONB.step = n; document.querySelectorAll('#onb [data-step]').forEach(s => s.hidden = +s.dataset.step !== n);
  document.querySelectorAll('#onb .onb-dots').forEach(d => d.innerHTML = [1, 2, 3].map(i => `<span class="${i === Math.min(n, 3) ? 'on' : i < n ? 'past' : ''}"></span>`).join(''));
  $('#onb').scrollTop = 0; track('onb-' + n, 'Onboarding · écran ' + n);
  if (n === 4) { const m = document.querySelector('#onb [data-step="4"] .onb-map'); if (!m.innerHTML) m.innerHTML = document.querySelector('#onb [data-step="1"] .onb-map').innerHTML; }
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
      if (ONB_DEMO) { for (let p = 0; p <= 1; p += 0.25) { ONB.prog[k] = p; onbProgress(); await new Promise(r => setTimeout(r, 120)); } }
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
  const go = $('#onb-go'); if (go) { go.disabled = !ready; go.textContent = ready ? 'Créer mon premier parcours' : 'Téléchargement…'; }
}
// à la fin : la ville affichée doit être sur le téléphone, sinon on passe sur la première ville choisie
function onbFinish() {
  try { localStorage.setItem(ONB_K, '1'); } catch (e) {}
  S.onbJust = true; track('onb-fin', 'Onboarding terminé');
  const keep = ONB.done.has(CITY) ? CITY : onbList().find(k => ONB.done.has(k)) || CITY;
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
document.querySelectorAll('#onb .onb-skip').forEach(b => b.onclick = () => { track('onb-passer', 'Onboarding · Passer'); onbShow(ONB.step === 1 ? 2 : 4); });
$('#onb-dl').onclick = () => { if (!ONB.pick.size) return; onbDownload(); onbShow(ONB.posOk ? 4 : 3); };
$('#onb-pos').onclick = () => { const next = () => onbShow(4); if (NATIVE) NP.geo.requestPermissions({ permissions: ['location'] }).then(next, next); else next(); };
$('#onb-later').onclick = () => onbShow(4);
document.querySelectorAll('#onb .onb-retry').forEach(b => b.onclick = () => onbDownload());
$('#onb-go').onclick = onbFinish;
// au lancement : onboarding si besoin, puis la ville affichée doit être sur le téléphone
async function onbGate() {
  if ((NATIVE || ONB_DEMO) && (!onbDone() || ONB_DEMO)) { if (NATIVE) await dlRoot(); await onboarding(); }
  return NATIVE ? dlReady() : true;
}
