// ---------- mesure d'audience (site en production seulement) : GoatCounter, anonyme, sans cookie ----------
const GC = 'runparis'; // code du compte GoatCounter (https://runparis.goatcounter.com)
const PUBLIC = !window.claude && (/netlify\.app$|runparis|perfectrun/i.test(location.hostname) || /[?&]test-public\b/.test(location.search));
const STATS = PUBLIC && PROD; // pas de stats sur staging ni en local
if (STATS) { const sc = document.createElement('script'); sc.async = true; sc.src = 'https://gc.zgo.at/count.js'; sc.dataset.goatcounter = `https://${GC}.goatcounter.com/count`; document.head.appendChild(sc); }
// application (D-89) : même compte GoatCounter, comptage direct sans script tiers ; ouverture « app » et événements « app/evt-… »
function gcHit(path, title, ev) {
  try { const q = new URLSearchParams({ p: path, t: title || path, e: ev ? 'true' : 'false', s: `${screen.width},${screen.height},${window.devicePixelRatio || 1}`, rnd: Math.random().toString(36).slice(2) });
    const i = new Image(); i.referrerPolicy = 'no-referrer'; i.src = `https://${GC}.goatcounter.com/count?${q}`; } catch (e) {}
}
function track(ev, title) { try { const cv = CITY !== 'paris' ? '-' + CITY : '', ct = CITY !== 'paris' ? ' · ' + C0.name : ''; if (NATIVE) return gcHit('app/evt-' + ev + cv, 'App · ' + (title || ev) + ct, true); if (STATS && window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: 'evt-' + ev + cv, title: (title || ev) + ct, event: true }); } catch (e) {} }
// ---------- feedback : « Signaler un problème » envoie un email via le Worker Cloudflare (worker.js, /api/signalement) ----------
if (PUBLIC) $('#fb-open').hidden = false;
// ---------- À propos : confidentialité, mentions légales, sources et licences, effacer mes données (D-87) ----------
const APP_VER = '1.0.2';
const ul = a => '<ul class="about-ul">' + a.map(x => '<li><span>' + x + '</span></li>').join('') + '</ul>';
const ap = t => '<p class="about-p">' + t + '</p>';
const ABOUT = {
  conf: ['Confidentialité', () => ap('Perfect Run n’a pas de compte et ne garde rien sur un serveur. Mise à jour : 15 octobre 2026.') +
    '<h3>Ce qui reste sur ton téléphone</h3>' + ul(['Ta position, utilisée pour partir de là où tu es et pendant le suivi', 'Tes sorties (« Mes parcours »), ton départ « Chez moi » et tes réglages', 'Tes photos : l’image de ta sortie est créée dans le téléphone']) +
    '<h3>Ce qui quitte ton téléphone</h3>' + ul(['« Signaler un problème » : ton message, ton email si tu le donnes, et le parcours si tu le joins (envoyés par email à l’éditeur, via Cloudflare)', '« Envoyer le parcours » : le lien contient le tracé, rien d’autre', 'La recherche d’une adresse avec numéro (« 12 rue … ») : le texte tapé est envoyé au service d’adresses de l’IGN, sans ta position ni identifiant ; sans numéro, la recherche reste dans l’app', 'La mesure d’audience : des compteurs anonymes (voir ci-dessous)']) +
    '<h3>Mesure d’audience</h3>' + ap('GoatCounter compte les visites et les actions (export, suivi, envoi…) sur le site et dans l’application, sans cookie, sans compte et sans te suivre d’un site ou d’une app à l’autre. Ta position, tes parcours et tes photos n’y sont jamais envoyés.') +
    '<h3>Tes droits</h3>' + ap((NATIVE ? 'Tout s’efface avec « Effacer mes données » ou en supprimant l’app.' : 'Tout s’efface en vidant les données de ce site dans ton navigateur.') + ' Pour un message envoyé : écris via « Signaler un problème ».')],
  ml: ['Mentions légales', () => '<h3>Éditeur</h3>' + ap('Antoine Mariotti, particulier. Contact : « Signaler un problème », dans le menu.') +
    '<h3>Directeur de la publication</h3>' + ap('Antoine Mariotti') +
    '<h3>Hébergeur du site</h3>' + ap('Cloudflare, Inc., 101 Townsend Street, San Francisco, CA 94107, États-Unis — cloudflare.com') +
    '<h3>Application</h3>' + ap('Application iPhone Perfect Run, sur l’App Store ; elle fonctionne sans serveur. Confidentialité et contact : <a href="https://perfectrun.fr/confidentialite" target="_blank" rel="noopener">perfectrun.fr/confidentialite</a> et <a href="https://perfectrun.fr/aide" target="_blank" rel="noopener">perfectrun.fr/aide</a>.') +
    '<h3>Responsabilité</h3>' + ap('Les parcours sont calculés automatiquement à partir de données ouvertes et donnés à titre indicatif : respecte le code de la route, la signalisation et les horaires des parcs.')],
  src: ['Sources et licences', () => '<h3>Données</h3>' + ul(['Rues, arbres, métro, parcs : © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">contributeurs OpenStreetMap</a>, licence ODbL', 'Altitudes : IGN, RGE ALTI', 'Adresses : Base Adresse Nationale, service de géocodage de l’IGN (Géoplateforme)', (CITY === 'paris' ? 'Quartiers : Paris Open Data' : 'Arrondissements et communes : OpenStreetMap'), 'Parcours mythiques : tracés issus de fichiers GPX et de cartes publics']) +
    '<h3>Logiciels et police</h3>' + ul(['Police Archivo, © The Archivo Project Authors, licence SIL Open Font License 1.1 <button type="button" class="textbtn" data-lic="ofl">Lire la licence</button>', 'Capacitor et ses modules (application), licence MIT <button type="button" class="textbtn" data-lic="mit">Lire la licence</button>'])],
  erase: ['Effacer mes données\u00a0?', () => { const n = mineLoad().length, h = getHome();
    return ap('Ces données sont seulement sur ce téléphone. Elles seront effacées :') + ul([`Mes parcours : ${n} sortie${n > 1 ? 's' : ''}`].concat(h ? ['Ton départ « Chez moi »'] : [], ['Tes réglages et ton thème'])) +
      '<div class="note warn"><b>Une sortie effacée ne peut pas être récupérée</b> après les 5 secondes du bouton « Annuler ».</div>'; }]
};
// lien reçu : erreur de lien incomplet (D-88) ; pas d'invitation à l'app sur le site
function linkErr(on) { $('#lnk-err').hidden = !on; }
$('#lnk-err-x').onclick = () => linkErr(false);
function aboutOpen(k) {
  $('#themepop').hidden = true; $('#theme-btn').setAttribute('aria-expanded', false);
  if (k === 'fb') return $('#fb-open').click();
  if (k === 'aide') { if (NATIVE) window.open('https://perfectrun.fr/aide', '_blank'); else location.href = 'aide.html'; return; } // page publique Aide et contact (D-112)
  const [t, f] = ABOUT[k]; $('#about-t').textContent = t; $('#about-b').innerHTML = f(); $('#about-b').scrollTop = 0;
  $('#about-f').hidden = k !== 'erase'; $('#about').hidden = false; track('a-propos', t);
}
document.querySelectorAll('[data-about]').forEach(b => b.onclick = e => { e.stopPropagation(); aboutOpen(b.dataset.about); });
$('#about-b').addEventListener('click', e => { const b = e.target.closest('[data-lic]'); if (!b) return; $('#about-t').textContent = b.dataset.lic === 'ofl' ? 'Licence de la police Archivo' : 'Licence MIT'; $('#about-b').innerHTML = $('#lic-' + b.dataset.lic).innerHTML; $('#about-b').scrollTop = 0; });
$('#about-x').onclick = $('#about-back').onclick = $('#erase-keep').onclick = () => { $('#about').hidden = true; };
$('#attrib-more').onclick = () => aboutOpen('src');
$('#erase-go').onclick = () => { // tout ce que Perfect Run garde sur l'appareil commence par « runparis- »
  const bak = {}; try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('runparis-')) { bak[k] = localStorage.getItem(k); localStorage.removeItem(k); } } } catch (e) {}
  $('#about').hidden = true; applyTheme('auto'); renderHome(); if (S.tab === 'mine') renderMine(); track('effacer', 'Données effacées');
  const t = $('#toast'); t.innerHTML = ''; t.append('Données effacées'); const u = document.createElement('button'); u.type = 'button'; u.className = 'undo'; u.textContent = 'Annuler';
  u.onclick = () => { try { for (const k in bak) localStorage.setItem(k, bak[k]); } catch (e) {} applyTheme(bak['runparis-theme'] || 'auto'); renderHome(); if (S.tab === 'mine') renderMine(); t.hidden = true; };
  t.appendChild(u); t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 5000);
};
if (NATIVE) { $('#m-erase').hidden = false; $('#mver').textContent = `Perfect Run ${APP_VER}`; gcHit('/app', `Application ${APP_VER}`, false); }
{ const k = new URLSearchParams(location.search).get('about'); if (ABOUT[k] && k !== 'erase') aboutOpen(k); } // liens de l'accueil et de « Comment ça marche »

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
  ev.preventDefault(); const msg = $('#fb-msg').value.trim();
  if (!$('#fb-type').value) { $('#fb-err').textContent = 'Choisis un sujet.'; $('#fb-err').hidden = false; $('#fb-type').focus(); return; }
  if (msg.length < 10) { $('#fb-err').textContent = 'Écris un peu plus (10 caractères au moins), par exemple où et quoi.'; $('#fb-err').hidden = false; $('#fb-msg').focus(); return; }
  const body = new URLSearchParams({ 'form-name': 'signalement', type: $('#fb-type').value, message: msg, email: $('#fb-mail').value.trim(), parcours: $('#fb-route').checked ? routeContext() : '', page: location.href });
  $('#fb-send').disabled = true;
  const nf = !NATIVE && /netlify\.app$/.test(location.hostname); /* ancien site Netlify : son propre formulaire */
  try { const r = await fetch(nf ? '/' : NATIVE ? 'https://perfectrun.fr/api/signalement' : '/api/signalement', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() }); if (!r.ok) throw new Error(r.status);
    $('#fb').close(); $('#fb-msg').value = ''; $('#fb-type').value = ''; $('#fb-err').hidden = true; toast('Merci ! Ton message a bien été envoyé.'); track('signalement', $('#fb-type').value);
  } catch (e) { $('#fb-err').textContent = 'Envoi impossible pour le moment (connexion ?). Réessaie dans un instant.'; $('#fb-err').hidden = false; }
  finally { $('#fb-send').disabled = false; }
};

// site : le logo ramène à l'accueil
if (!window.claude && /app\.html$/.test(location.pathname)) { const l = $('.logo'); const a = document.createElement('a'); a.href = './'; a.className = 'logo'; a.setAttribute('aria-label', 'Perfect Run, accueil'); a.innerHTML = l.innerHTML; l.replaceWith(a); }
// ---------- mobile : réglages en phrase + feuilles (D-74) ----------
// Sur téléphone, les contrôles existants sont déplacés dans des feuilles ; sur ordinateur, rien ne change.
var MPHR = false, MCUR = null, MHOLD = {};
const MSH = {
  dist: { t: 'Distance', ok: () => 'Valider ' + $('#mf-dist').textContent, nodes: () => [$('#u-km').parentElement, document.querySelector('.stepper'), $('#chips-km'), $('#chips-min'), $('#conv').parentElement] },
  dep: { t: 'Départ', ok: null, nodes: () => [$('#start-box'), $('#home-row')] },
  arr: { t: 'Arrivée', ok: () => 'Valider', nodes: () => [$('#a-back').parentElement, $('#end-fixed'), $('#end-free-hint'), $('#end-metro-row')] },
  via: { t: 'Passer par', ok: () => 'Valider', nodes: () => [$('#via-list'), $('#via-box'), $('#via-hint')] }, // D-101 : au même niveau que « À éviter »
  prefs: { t: 'Préférences', ok: () => 'Appliquer', nodes: () => ['Type de parcours', $('#k-classic').parentElement, $('#k-hint'), 'Dénivelé', $('#d-flat').parentElement, $('#dplus-row'), 'Priorité', $('#prio'), $('#prio-hint'), document.querySelector('.depline'), $('#dep-hint'), $('#prefer-paths').closest('label'), $('#water-on').closest('label'), $('#allow-repeat').closest('label')] },
  avoid: { t: 'À éviter', ok: () => 'Valider', nodes: () => [$('#avoid-list'), $('#addbox'), $('#crowd-row'), $('#crowd-hint'), $('#always')] }
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
  if (k === 'via') $('#via-box').hidden = false;
  $('#mback').hidden = false; $('#msheet').hidden = false; $('#msheet-b').scrollTop = 0;
  if (focus === 'start') $('#start-q').focus(); else if (focus === 'end') $('#end-q').focus();
}
function mClose() { if (!MCUR) return; MCUR = null; $('#msheet').hidden = true; $('#mback').hidden = true; msync(); }
const mShort = n => { if (!n) return ''; if (/^Chez moi/.test(n)) return 'chez moi'; if (n === 'Ma position') return 'ma position'; n = n.replace(/^Point sur la carte · /, ''); return n.length > 24 ? n.slice(0, 23) + '…' : n; };
function msync() {
  if (!MPHR) return;
  const km = parseFloat(String($('#km').value).replace(',', '.')), mn = parseFloat($('#dur').value);
  $('#mf-dist').textContent = S.unit === 'min' ? (mn >= 60 ? `${Math.floor(mn / 60)} h${mn % 60 ? ' ' + String(Math.round(mn % 60)).padStart(2, '0') : ''}` : `${Math.round(mn || 0)} min`) : `${fmt(km || 0, km % 1 ? 1 : 0)} km`;
  $('#mf-arr').textContent = S.mode === 'loop' ? 'en boucle' : S.endFree ? 'n’importe où' : S.end ? 'jusqu’à ' + mShort(S.end.name) : 'jusqu’à un lieu';
  $('#mf-dep').textContent = S.start ? mShort(S.start.name) : 'choisis ton départ';
  const kind = { classic: 'Classique', green: 'Vert', discover: 'Découverte' }[S.kind] || 'Classique';
  const dn = { flat: 'Plat', any: 'Normal', target: 'Vallonné' }[S.dmode] || 'Normal';
  const p = [kind, dn, PRIO[S.prio || 'eq'].txt];
  if ($('#prefer-paths').checked) p.push('parcs'); if ($('#water-on').checked) p.push('eau tous les 3 km');
  if (S.depNow === false && $('#dep-time').value) p.push('départ ' + $('#dep-time').value.replace(':', ' h '));
  $('#mf-prefs').textContent = p.join(' · ');
  const xs = [...document.querySelectorAll('#avoid-list .xchip .name')].map(e => e.textContent);
  $('#mf-avoid').textContent = xs.length ? xs.join(' · ') : 'Aucun quartier ni lieu';
  $('#mf-via').textContent = S.vias.length ? S.vias.map(v => v.name.replace(/^Point · /, '')).join(' · ') : 'Aucun lieu';
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
