<script>
(() => {
const $ = s => document.querySelector(s);
// Fonctions réservées à l'application (D-83) : mode course, Mes parcours, envoi de parcours, « Je l'ai fait » et image à partager.
// Elles ne s'allument que hors production (staging, tests) ; ?web=1 force la version du site pour la recette.
const PROD = /^(www\.)?perfectrun\.fr$|^runparis\.netlify\.app$/.test(location.hostname); // site en production (perfectrun.fr, ancienne adresse Netlify)
const APPF = !PROD && !/[?&]web=1/.test(location.search);
document.documentElement.classList.toggle('appf', APPF);
// Application iPhone (Capacitor, D-85) : même code, avec les modules du téléphone (position écran verrouillé, partage, écran allumé).
const CAP = window.Capacitor, NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
// sans @capacitor/core (pas de bundler) : on appelle les modules par le pont natif (nativePromise / nativeCallback)
const plug = n => new Proxy({}, { get: (_, m) => (o, cb) => cb ? Promise.resolve(CAP.nativeCallback(n, m, o || {}, cb)) : CAP.nativePromise(n, m, o || {}) });
const NP = NATIVE ? { share: plug('Share'), fs: plug('Filesystem'), awake: plug('KeepAwake'), geo: plug('Geolocation'), bg: plug('BackgroundGeolocation'), sb: plug('StatusBar'), hap: plug('Haptics'), live: plug('LiveRun') } : null;
// écran de lancement animé (D-86) : la boucle se dessine depuis le D, puis le logo ; retiré quand les données sont prêtes (au moins 1,5 s)
const SPLASH_T0 = Date.now();
if (NATIVE && !document.getElementById('splash')) { const sp = document.createElement('div'); sp.id = 'splash'; sp.setAttribute('aria-hidden', 'true');
  sp.innerHTML = '<svg viewBox="0 0 100 100" width="150" height="150"><g class="sp-st"><path d="M-10 22L110 12M-10 84L110 76M18 -10L24 110M86 -10L82 110"/></g><path class="sp-l sp-c" d="M26 33L64 23L76 63L38 75Z" pathLength="140"/><path class="sp-l sp-r" d="M26 33L64 23L76 63L38 75Z" pathLength="140"/><circle class="sp-d" cx="26" cy="33" r="9"/><text class="sp-dt" x="26" y="37" text-anchor="middle">D</text></svg><div class="sp-logo">PERFECT<span>RUN</span></div>';
  document.body.appendChild(sp); }
function splashDone() { const sp = document.getElementById('splash'); if (!sp) return; setTimeout(() => { sp.classList.add('out'); setTimeout(() => sp.remove(), 320); }, Math.max(0, 1500 - (Date.now() - SPLASH_T0))); }
// barre d'état : suit le thème de l'app (et l'écran toujours sombre de l'image à partager)
function sbSync() { if (!NATIVE) return; const t = document.documentElement.getAttribute('data-theme'), dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; const shx = document.getElementById('shx');
  NP.sb.setStyle({ style: (dark || (shx && !shx.hidden)) ? 'DARK' : 'LIGHT' }).catch(() => {}); }
if (NATIVE) { new MutationObserver(sbSync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sbSync); }
// vibrations du mode course (D-86) : courtes, jamais en continu
function navBuzz(k) { if (!NATIVE || !NAV.buzz) return; const h = NP.hap; (k === 'off' ? h.impact({ style: 'HEAVY' }).then(() => setTimeout(() => h.impact({ style: 'HEAVY' }), 160)) : k === 'end' ? h.notification({ type: 'SUCCESS' }) : h.impact({ style: 'LIGHT' })).catch(() => {}); }
document.documentElement.classList.toggle('native', NATIVE);
const WEB_APP = 'https://perfectrun.fr/app.html'; // adresse des liens envoyés depuis l'application : le site en production les ouvre (D-88)
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
  mode: 'loop', start: null, end: null, // {lat, lon, name}
  dmode: 'any', sig: 1, exclQ: new Set(), places: [], seed: 1, tool: null, route: null, showSig: false, showMetro: true, showTrees: false, showFont: false, showTrack: false,
  unit: 'km', endFree: false, view: 'set', kind: 'classic', vias: [], tab: 'gen', race: null
};
// ---------- villes (D-97) : une carte et des données par ville ; Paris à la racine, les autres dans leur dossier ----------
const CITIES = {
  paris: { name: 'Paris', dir: '', sub: 'et 29 communes voisines', ll: [48.8566, 2.3522], bb: [48.799, 48.975, 2.18, 2.5], end: ['Jardin du Luxembourg', 48.8462, 2.3371],
    hill: 'Paris va de 26 m (Seine) à 130 m (Montmartre), Saint-Cloud monte à 160 m.', zones: '80 quartiers et 29 communes', avoidEx: 'Un lieu : Tour Eiffel, Châtelet, un marché…', races: 'Les grands parcours de course de Paris, pour s’entraîner dessus en entier ou en partie.', od: 'Paris Open Data' },
  lyon: { name: 'Lyon', dir: 'lyon/', sub: 'et 15 communes voisines', ll: [45.7578, 4.832], bb: [45.675, 45.855, 4.7, 4.98], end: ['Parc de la Tête d’Or', 45.7772, 4.8556],
    hill: 'Lyon va de 160 m (Rhône) à 300 m (Fourvière, Croix-Rousse) ; les Monts d’Or montent bien plus haut.', zones: '9 arrondissements et 15 communes', avoidEx: 'Un lieu : Bellecour, Part-Dieu, un marché…', races: 'Les grands parcours de course de Lyon, pour s’entraîner dessus en entier ou en partie.', od: '' },
  bordeaux: { name: 'Bordeaux', dir: 'bordeaux/', sub: 'et 12 communes voisines', ll: [44.8425, -0.5743], bb: [44.74, 44.96, -0.77, -0.48], end: ['Jardin public', 44.8487, -0.5793],
    hill: 'Bordeaux va de 3 m (Garonne) à 30 m ; les coteaux de la rive droite (Cenon, Floirac, Lormont) montent à 70 m.', zones: '8 quartiers et 12 communes', avoidEx: 'Un lieu : place de la Bourse, Saint-Michel, un marché…', races: 'Les grands parcours de course de Bordeaux, pour s’entraîner dessus en entier ou en partie.', od: '' },
  nantes: { name: 'Nantes', dir: 'nantes/', sub: 'et 13 communes voisines', ll: [47.2129, -1.5598], bb: [47.105, 47.37, -1.855, -1.39], end: ['Jardin des Plantes', 47.2197, -1.5433],
    hill: 'Nantes va de 5 m (Loire) à 45 m ; Orvault et Saint-Herblain montent à 65 m.', zones: '11 quartiers et 13 communes', avoidEx: 'Un lieu : château des ducs, Commerce, un marché…', races: 'Les grands parcours de course de Nantes, pour s’entraîner dessus en entier ou en partie.', od: '' },
  toulouse: { name: 'Toulouse', dir: 'toulouse/', sub: 'et 17 communes voisines', ll: [43.6045, 1.444], bb: [43.5, 43.715, 1.275, 1.578], end: ['Jardin des Plantes', 43.5937, 1.4521],
    hill: 'Toulouse va de 130 m (Garonne) à 200 m ; les coteaux de Pech-David et de Vieille-Toulouse montent à 280 m.', zones: '20 quartiers et 17 communes', avoidEx: 'Un lieu : Capitole, Saint-Cyprien, un marché…', races: 'Les grands parcours de course de Toulouse, pour s’entraîner dessus en entier ou en partie.', od: '' },
  dijon: { name: 'Dijon', dir: 'dijon/', sub: 'et 15 communes voisines', ll: [47.322, 5.0415], bb: [47.25, 47.41, 4.89, 5.18], end: ['Parc de la Colombière', 47.3045, 5.0485],
    hill: 'Dijon va de 220 m à 300 m ; à l’ouest, les combes et Corcelles-les-Monts montent à 600 m.', zones: '13 quartiers et 15 communes', avoidEx: 'Un lieu : place de la Libération, les Halles, un marché…', races: 'Le grand parcours de course de Dijon, pour s’entraîner dessus en entier ou en partie.', od: '' }
};
const CITY_SOON = ['Lille'];
const cityAt = (la, lo) => Object.keys(CITIES).find(k => { const b = CITIES[k].bb; return la >= b[0] && la <= b[1] && lo >= b[2] && lo <= b[3]; }) || null;
const CITY_K = 'runparis-city';
const CITY_STORED = (() => { try { const v = localStorage.getItem(CITY_K); return CITIES[v] ? v : null; } catch (e) { return null; } })();
const CITY = (() => { const q = new URLSearchParams(location.search).get('ville'); return CITIES[q] ? q : CITY_STORED || 'paris'; })();
try { localStorage.setItem(CITY_K, CITY); } catch (e) {}
const C0 = CITIES[CITY], CD = C0.dir;
document.documentElement.dataset.city = CITY;
// changer de ville : on recharge l'app sur la nouvelle carte (le choix est gardé sur l'appareil) ; extra = paramètres à ajouter (parcours à rouvrir…)
function setCity(k, extra, force) { if (!CITIES[k]) return; if ((NATIVE || ONB_DEMO) && !force && !dlState()[k]) { cityAsk(k, extra); return; } try { localStorage.setItem(CITY_K, k); } catch (e) {} track('ville', 'Ville · ' + CITIES[k].name);
  const u = new URL(location.href); for (const x of [...u.searchParams.keys()]) if (x !== 'web') u.searchParams.delete(x); u.searchParams.set('ville', k); u.hash = '';
  if (extra) for (const [a, b] of Object.entries(extra)) u.searchParams.set(a, b); location.href = u.toString(); }
const DV = '__DATAV__';
// textes de la ville
$('#city-name').textContent = C0.name; $('#city-btn').setAttribute('aria-label', `Ville : ${C0.name}. Changer de ville`);
$('#loading').textContent = 'Chargement des rues de ' + C0.name + '…'; // D-104 : plus de « rues parisiennes » dans les autres villes

// ---------- villes à télécharger (application, onboarding) : rien n'est embarqué, chaque ville vient du site puis reste sur le téléphone ----------
// Sur le site, rien ne change : la page lit les fichiers de la ville à côté d'elle (CD + fichier + version).
const DL_BASE = (window.PR_DL_BASE || (NATIVE ? 'https://perfectrun.fr/' : new URL('./', location.href).href)).replace(/\/?$/, '/'); // copy-web.js peut viser un aperçu pour les tests (PR_DL_BASE)
const DL_K = 'runparis-villes'; // { ville: { h: empreinte, bytes, at } } : villes complètes sur le téléphone
const dlState = () => { try { return JSON.parse(localStorage.getItem(DL_K) || '{}') || {}; } catch (e) { return {}; } };
const dlSave = s => { try { localStorage.setItem(DL_K, JSON.stringify(s)); } catch (e) {} };
let DL_ROOT = ''; // adresse locale du dossier « villes » (stockage de l'application)
const dataURL = f => NATIVE ? DL_ROOT + CITY + '/' + f + '?h=' + ((dlState()[CITY] || {}).h || '') : CD + f + DV;
const b64buf = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
async function dlIndex() { const r = await fetch(DL_BASE + 'villes.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('index ' + r.status); return r.json(); }
// télécharge tous les fichiers d'une ville ; la ville n'est marquée complète qu'à la fin (un téléchargement coupé est repris en entier)
async function cityDownload(id, onp, idx) {
  idx = idx || await dlIndex(); const c = idx.cities[id]; if (!c) throw new Error('ville inconnue : ' + id);
  let done = 0; onp && onp(0);
  for (const [f, size, sh] of c.files) {
    const r = await fetch(DL_BASE + c.dir + f + '?v=' + sh); if (!r.ok) throw new Error(f + ' ' + r.status);
    await NP.fs.writeFile({ path: 'villes/' + id + '/' + f, data: b64buf(await r.arrayBuffer()), directory: 'DATA', recursive: true });
    done += size; onp && onp(done / c.bytes);
  }
  const s = dlState(); s[id] = { h: c.h, bytes: c.bytes, at: new Date().toISOString() }; dlSave(s);
  track('ville-telechargee-' + id, 'Ville téléchargée ' + c.name);
}
// au lancement : dossier local, puis la ville choisie si elle n'est pas encore sur le téléphone (en attendant l'onboarding, téléchargée d'office)
async function dlRoot() { if (!DL_ROOT) { const u = await NP.fs.getUri({ path: 'villes', directory: 'DATA' }); DL_ROOT = CAP.convertFileSrc(u.uri).replace(/\/?$/, '/'); } }
async function dlReady() {
  await dlRoot();
  if (dlState()[CITY]) return true;
  const recv = new URLSearchParams(location.search).has('p'), other = Object.keys(dlState()).find(k => CITIES[k]);
  if (!recv && other) { setCity(other, null, true); return false; } // la ville affichée n'est pas sur le téléphone : on passe sur une ville qui y est
  const ld = $('#loading'); ld.classList.add('dl-full');
  if (!recv && onbDone()) { // aucune ville (onboarding quitté avant la fin) : on propose de la choisir, sans rien télécharger d'office
    splashDone();
    ld.innerHTML = '<div class="dl-err"><b>Aucune ville sur ton téléphone</b><span>Choisis la ville où tu cours : ses rues se téléchargent une fois, puis l’app marche sans réseau.</span><button class="btn primary" type="button">Choisir ma ville</button></div>';
    ld.querySelector('button').onclick = () => { try { localStorage.removeItem(ONB_K); } catch (e) {} location.reload(); };
    return false;
  }
  const txt = p => 'Téléchargement des rues de ' + C0.name + (recv ? ' pour ouvrir le parcours reçu' : '') + '… ' + Math.round(p * 100) + ' %';
  try { await cityDownload(CITY, p => { ld.textContent = txt(p); }); ld.textContent = 'Chargement des rues de ' + C0.name + '…'; ld.classList.remove('dl-full'); return true; }
  catch (e) {
    track('ville-echec', 'Téléchargement de ville raté'); splashDone();
    ld.innerHTML = '<div class="dl-err" role="alert"><b>Pas de connexion</b><span></span><button class="btn primary" type="button">Réessayer</button></div>';
    ld.querySelector('span').textContent = 'Il faut internet une première fois pour télécharger les rues de ' + C0.name + '. Ensuite, l’app marche sans réseau.';
    ld.querySelector('button').onclick = () => location.reload();
    return false;
  }
}
$('#hill-hint').textContent = C0.hill; $('#zones-sum').textContent = `Choisir quartier par quartier (${C0.zones})`; $('#avoid-q').placeholder = C0.avoidEx; $('#race-hint').textContent = C0.races;
$('#map').setAttribute('aria-label', `Carte de ${C0.name} et des communes voisines avec le parcours`); $('#attrib-od').textContent = C0.od ? ' · ' + C0.od : '';
// ---------- choix de la ville (D-97, CityPicker) : bouton d'en-tête, feuille sur téléphone, liste sous l'en-tête sur ordinateur ----------
const CHECK_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"><path d="M5 12l5 5 9-10"/></svg>';
function cityOpen() {
  const L = $('#city-list'); L.innerHTML = '';
  for (const [k, c] of Object.entries(CITIES)) { const b = document.createElement('button'); b.type = 'button'; b.className = 'cityrow'; b.setAttribute('aria-pressed', k === CITY);
    b.innerHTML = `<span><b></b><small></small></span>${k === CITY ? CHECK_SVG : ''}`; b.querySelector('b').textContent = c.name; b.querySelector('small').textContent = c.sub;
    b.onclick = () => { if (k === CITY) return cityClose(); setCity(k); }; L.appendChild(b); }
  for (const n of CITY_SOON) { const d = document.createElement('div'); d.className = 'cityrow soon'; d.setAttribute('aria-disabled', 'true'); d.innerHTML = '<span><b></b></span><span class="tag">Bientôt</span>'; d.querySelector('b').textContent = n; L.appendChild(d); }
  const sh = $('#citysheet'); sh.hidden = false; $('#city-btn').setAttribute('aria-expanded', 'true');
  if (MOB.matches) { $('#mback').hidden = false; sh.style.left = sh.style.top = ''; }
  else { const r = $('#city-btn').getBoundingClientRect(); sh.style.left = Math.max(8, Math.min(innerWidth - 328, r.left)) + 'px'; sh.style.top = (r.bottom + 6) + 'px'; }
}
function cityClose() { const sh = $('#citysheet'); if (sh.hidden) return; sh.hidden = true; $('#city-btn').setAttribute('aria-expanded', 'false'); if (!MCUR) $('#mback').hidden = true; }
$('#city-btn').onclick = e => { e.stopPropagation(); $('#citysheet').hidden ? cityOpen() : cityClose(); };
$('#city-x').onclick = cityClose;
document.addEventListener('click', e => { const sh = $('#citysheet'); if (!sh.hidden && !sh.contains(e.target) && !$('#city-btn').contains(e.target)) cityClose(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') cityClose(); });
// position dans une autre ville couverte : on propose d'y passer, jamais sans demander
function cityHint(la, lo) {
  const k = cityAt(la, lo), n = $('#city-note');
  if (!k || k === CITY) { n.hidden = true; return false; }
  const c = CITIES[k];
  n.innerHTML = '<b class="nt"></b><span></span><div class="run-choice"><button type="button" class="btn primary" id="cn-go"></button><button type="button" class="textbtn" id="cn-stay"></button></div>';
  n.querySelector('b').textContent = `Tu es à ${c.name}`; n.querySelector('span').textContent = `Passe sur ${c.name} pour créer un parcours autour de toi.`;
  $('#cn-go').textContent = `Passer sur ${c.name}`; $('#cn-stay').textContent = `Rester sur ${C0.name}`;
  $('#cn-go').onclick = () => setCity(k); $('#cn-stay').onclick = () => { n.hidden = true; };
  n.hidden = false; track('ville-proposee', 'Autre ville proposée · ' + c.name); return true;
}
// première ouverture : si la position est déjà autorisée, on ouvre directement la ville où l'on est
function cityFirstRun() {
  if (S.onbJust || CITY_STORED || new URLSearchParams(location.search).has('ville') || !navigator.geolocation) return;
  const go = () => navigator.geolocation.getCurrentPosition(p => { const k = cityAt(p.coords.latitude, p.coords.longitude); if (k && k !== CITY) setCity(k); }, () => {}, { maximumAge: 600000, timeout: 8000 });
  if (NATIVE && NP.geo && NP.geo.checkPermissions) NP.geo.checkPermissions().then(r => { if (r && r.location === 'granted') go(); }).catch(() => {});
  else if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: 'geolocation' }).then(st => { if (st.state === 'granted') go(); }).catch(() => {});
}
 // version des données (ajoutée à la mise en ligne) : force le rechargement après une mise à jour
let M, G, paths = {}, colors = {}, RACES = [], SIGHTS = [], METRO = { lines: {}, st: [] }, TREES = null, TGRID = null, FONT = [], PARKS = [], TRACKS = [];

