// ---------- mode course : suivre le tracé en direct, sans montre (mobile) ----------
// Le téléphone compare sa position au tracé : prochain virage, km faits / restants, hors tracé, arrivée.
// Tout reste dans le téléphone. Sur le site, rien ne se passe écran verrouillé ; dans l'application, la position continue (D-100).
const NAV = { on: false };
const RUN_IC = {
  right: '<path d="M7 21V12h10"/><path d="M13 8l4 4-4 4"/>', left: '<path d="M17 21V12H7"/><path d="M11 8l-4 4 4 4"/>',
  sright: '<path d="M8 21v-7l7-7"/><path d="M10 7h5v5"/>', sleft: '<path d="M16 21v-7L9 7"/><path d="M14 7H9v5"/>',
  uturn: '<path d="M8 21V9a4 4 0 0 1 8 0v4"/><path d="M12 10l4 4 4-4"/>', straight: '<path d="M12 21V4"/><path d="M7 9l5-5 5 5"/>',
  keepl: '<path d="M14 21v-7l-6-8"/><path d="M6 10V5h5"/>', keepr: '<path d="M10 21v-7l6-8"/><path d="M18 10V5h-5"/>',
  left2: '<path d="M18 21v-7h-7V8H5"/><path d="M8 5L5 8l3 3"/>', right2: '<path d="M6 21v-7h7V8h6"/><path d="M16 5l3 3-3 3"/>',
  jogr: '<path d="M9 21v-8h6V4"/><path d="M11 8l4-4 4 4"/>', jogl: '<path d="M15 21v-8H9V4"/><path d="M5 8l4-4 4 4"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4h11l-2.5 4L17 12H6"/>', chrono: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/>', start: '<path d="M12 21s-6-5.6-6-10a6 6 0 0 1 12 0c0 4.4-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>'
};
const runIco = k => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${RUN_IC[k]}</svg>`;
function navWrong(on, m, wb) {
  if (!on) { if (NAV.wrongOn) { NAV.wrongOn = false; navMsg(null); $('#run-nav').hidden = false; } return; }
  NAV.wrongOn = true; const j = m.jx, br = j.br.filter(b => Math.abs(b.a) < 179).sort((p, q) => p.a - q.a), iw = br.indexOf(wb), ie = br.findIndex(b => b.out), s = ie > iw ? 'droite' : 'gauche';
  const rel = Math.abs(ie - iw) === 1 ? `la suivante à ${s}` : `plus à ${s}`;
  navMsg('err', 'Ce n’est pas la bonne rue', m.name ? `Reviens au carrefour : ta rue est ${m.name}, ${rel}.` : `Reviens au carrefour et prends la rue ${rel}.`);
  navBuzz('off'); navSay(`Ce n’est pas la bonne rue. Reviens au carrefour, ${m.name ? navArt(m.name) + ' est ' + rel : 'ta rue est ' + rel}.`); track('mauvaise-rue', 'Mauvaise rue au carrefour');
}
// mini-schéma d'un carrefour compliqué (D-93) : rues en gris (grands axes plus épais), la tienne en blanc avec la flèche ; arrivée par le bas
function navSchema(j) {
  const c = 36, L = 31, v = (a, l) => { const r = a * Math.PI / 180; return [c + Math.sin(r) * l, c - Math.cos(r) * l]; };
  let o = '<svg class="jxs" viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">';
  for (const b of j.br) if (!b.out) { const [x, y] = v(b.a, L); o += `<path d="M${c} ${c}L${x.toFixed(1)} ${y.toFixed(1)}" stroke="#5E6166" stroke-width="${b.maj ? 6 : 4}" fill="none"/>`; }
  const [ax, ay] = v(180, L), [ex, ey] = v(j.a, L * 0.86), r = j.a * Math.PI / 180, ux = Math.sin(r), uy = -Math.cos(r), hx = ex + ux * 5, hy = ey + uy * 5;
  o += `<path d="M${ax.toFixed(1)} ${ay.toFixed(1)}L${c} ${c}L${ex.toFixed(1)} ${ey.toFixed(1)}" stroke="#fff" stroke-width="6" fill="none" stroke-linejoin="miter"/>`;
  o += `<path d="M${hx.toFixed(1)} ${hy.toFixed(1)}L${(hx - ux * 10 - uy * 6.5).toFixed(1)} ${(hy - uy * 10 + ux * 6.5).toFixed(1)}L${(hx - ux * 10 + uy * 6.5).toFixed(1)} ${(hy - uy * 10 - ux * 6.5).toFixed(1)}Z" fill="#fff"/>`;
  return o + '</svg>';
}
// nom d'une rue avec son article, pour la voix (« le boulevard Pereire »)
function navArt(n) { const m = /^(Boulevard|Avenue|Rue|Place|Quai|Pont|Cours|Allée|Passage|Square|Carrefour|Rond-Point)\s+(.*)$/i.exec(n || ''); if (!m) return n || ''; const w = m[1].toLowerCase(), art = /^[aeiouâéè]/i.test(w) ? 'l’' : ['rue', 'place', 'allée', 'avenue'].includes(w) ? 'la ' : 'le '; return art + w + ' ' + m[2]; }
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
    for (const [e, fromA] of r.edges) { const p = E.edgePts(e); let len = 0; for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); segs.push([d, d + len, G.en[e] ? M.names[G.en[e] - 1] : '', e, fromA]); addRun(d, d + len, segs[segs.length - 1][2]); d += len; }
    const hdg = (p, q) => Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI, dev = (x, y) => { let t = y - x; while (t > 180) t -= 360; while (t < -180) t += 360; return t; };
    for (let i = 0; i < segs.length - 1; i++) {
      const dd = segs[i][1]; if (dd < 15 || dd > L - 15) continue;
      const nmAfter = j0 => { for (let j = j0; j < segs.length && segs[j][0] < segs[j0][0] + 60; j++) if (segs[j][2]) return segs[j][2]; return ''; };
      // carrefour à plusieurs nœuds (îlots, doubles voies) : une seule consigne, calculée sur l'entrée et la sortie (D-93)
      const jx = E.junctionAt(r.edges, i);
      if (jx && jx.j > i + 1 || jx && jx.complex || jx && Math.abs(jx.a) < 30 && Math.abs(jx.lat) >= 10) {
        const jog = Math.abs(jx.a) < 30 && Math.abs(jx.lat) >= 10 && jx.br.some(b => b.maj && !b.out && Math.abs(Math.abs(b.a) - 90) < 45);
        const name = nmAfter(jx.j);
        // on reste sur la même rue (trottoir qui contourne un coin, chaussée qui se dédouble) : rien à annoncer (D-114)
        if (!jog && name && segs[jx.k][2] === name && (Math.abs(jx.a) < 60 || !/^(Place|Rond-Point|Carrefour|Square)\b/i.test(name) && Math.abs(turn((segs[jx.k][1] + segs[jx.j][0]) / 2, 60)) < 45)) { i = jx.j - 1; continue; }
        if (!jog && jx.straight && !jx.complex) { i = jx.j - 1; continue; } // on continue tout droit, sans rue plus droite : rien à dire
        if (jog) man.push({ d: dd, a: jx.lat > 0 ? 1 : -1, jog: Math.abs(jx.lat), lat: jx.lat, name, jx, cross: (jx.br.find(b => b.maj && !b.out) || {}).name || '' });
        else if (Math.abs(jx.a) >= 35 || jx.complex && (Math.abs(jx.a) >= 20 || jx.br.some(b => !b.out && Math.abs(b.a - jx.a) < 30))) man.push({ d: dd, a: jx.a, name, jx, cx: jx.complex, straight: jx.straight });
        i = jx.j - 1; continue;
      }
      const a = turn(dd, 18), ein = segs[i][3], eout = segs[i + 1][3], v = segs[i][4] ? G.eb[ein] : G.ea[ein];
      // autres rues au carrefour : y a-t-il une rue tout droit, ou une fourche de l'autre côté ?
      const hin = hdg(at(dd - 18), at(dd)); let straight = false, fork = false;
      for (let k = G.deg[v]; k < G.deg[v + 1]; k++) { const e2 = G.adjE[k]; if (e2 === ein || e2 === eout) continue;
        let q = E.edgePts(e2); if (G.ea[e2] !== v) q = q.slice().reverse(); let j = 1, acc = 0; while (j < q.length - 1 && acc < 18) { acc += Math.hypot(q[j][0] - q[j - 1][0], q[j][1] - q[j - 1][1]); j++; }
        const dv = dev(hin, hdg(q[0], q[j])); if (Math.abs(dv) < 30) straight = true; if (Math.abs(dv) < 60 && Math.sign(dv) !== Math.sign(a)) fork = true; }
      let keep = false;
      if (Math.abs(a) < 35) { if (fork && Math.abs(a) >= 12) keep = true; else continue; } // petit angle sans fourche : on continue, rien à dire
      else if (Math.abs(a) < 60) { if (straight) keep = false; else if (fork) keep = true; else continue; } // pas de « légèrement » : jugé confus en course
      let nm = ''; for (let j = i + 1; j < segs.length && segs[j][0] < dd + 60; j++) if (segs[j][2]) { nm = segs[j][2]; break; }
      if (nm && segs[i][2] === nm && (Math.abs(a) < 60 || !/^(Place|Rond-Point|Carrefour|Square)\b/i.test(nm) && Math.abs(turn(dd, 60)) < 45)) continue; // même rue qui tourne un peu (ou trottoir qui contourne un coin) : on continue
      man.push({ d: dd, a, name: nm, keep, jx });
    }
  } else { // trace publiée : là où le cap change nettement
    for (let d = 0; d < L; d += 40) addRun(d, Math.min(L, d + 40), nameNear(d + 20));
    let best = null;
    for (let d = 30; d < L - 30; d += 10) { const a = turn(d, 25); if (Math.abs(a) >= 45) { if (!best || Math.abs(a) > Math.abs(best.a)) best = { d, a }; } else if (best) { man.push({ d: best.d, a: best.a, name: nameNear(best.d + 30) }); best = null; } }
  }
  man = man.filter((m, i) => !(i && m.d - man[i - 1].d < 12 && Math.abs(m.a) <= Math.abs(man[i - 1].a)));
  // même consigne répétée à quelques mètres sur la même rue (trottoirs qui se croisent au carrefour) : une seule (D-114)
  man = man.filter((m, i) => !(i && m.name && m.name === man[i - 1].name && m.d - man[i - 1].d < 50 && Math.sign(m.a) === Math.sign(man[i - 1].a) && !m.jog && !man[i - 1].jog));
  // rue qui reprend en face, décalée, après un grand axe : « Traverse puis en face » (D-93)
  for (let i = 0; i < man.length - 1; i++) { const m = man[i], q = man[i + 1]; if (m.jog || q.jog || m.straight || q.straight) continue;
    if (q.d - m.d <= 45 && Math.abs(m.a) >= 50 && Math.abs(m.a) <= 130 && Math.abs(q.a) >= 50 && Math.abs(q.a) <= 130 && Math.sign(m.a) !== Math.sign(q.a) && Math.abs(m.a + q.a) < 35) {
      const sg = r.edges ? (() => { let d0 = 0; for (const [e] of r.edges) { const l = G.LEN[e]; if (d0 + l > m.d + 2) return e; d0 += l; } return -1; })() : -1;
      if (sg >= 0 && G.C[sg] >= 2) { man.splice(i, 2, { d: m.d, a: m.a > 0 ? 1 : -1, jog: q.d - m.d, lat: (m.a > 0 ? 1 : -1) * (q.d - m.d), name: q.name, jx: m.jx, cross: G.en[sg] ? M.names[G.en[sg] - 1] : '' }); } } }
  // deux virages à moins de 60 m : annoncés ensemble (« À gauche, puis encore à gauche »)
  // boulevard à deux chaussées : deux décalages qui s'annulent = on traverse tout droit
  for (let i = 0; i < man.length - 1; i++) { const m = man[i], q = man[i + 1]; if (!m.jog || !q.jog || q.d - m.d > 60) continue;
    const net = m.lat + q.lat; if (Math.abs(net) < 8) { man.splice(i, 2); i--; } else { man.splice(i, 2, Object.assign({}, m, { a: net > 0 ? 1 : -1, jog: Math.abs(net), lat: net, name: q.name })); } }
  for (let i = 0; i < man.length - 1; i++) { const m = man[i], q = man[i + 1]; if (!m.second && !m.keep && !q.keep && !m.jog && !q.jog && !m.cx && !q.cx && Math.abs(m.a) < 160 && Math.abs(q.a) < 160 && q.d - m.d < 60) { m.pair = q; q.second = true; } }
  man.push({ d: L, a: 0, arrive: true, name: '' });
  return { pts, cum, L, idx, at, man, runs };
}
function navDir(m) {
  if (m.arrive) return ['flag', 'Arrivée'];
  const a = m.a, s = a > 0 ? 'droite' : 'gauche', k = a > 0 ? 'right' : 'left';
  if (m.jog) return ['jog' + (a > 0 ? 'r' : 'l'), 'Traverse puis en face'];
  if (m.cx) return ['jx', m.straight ? 'Tout droit' : navOrd(m)];
  if (Math.abs(a) >= 160) return ['uturn', 'Demi-tour'];
  if (m.keep) return ['keep' + (a > 0 ? 'r' : 'l'), 'Garde la ' + s];
  if (m.pair) { const q = m.pair, same = (q.a > 0) === (a > 0), s2 = q.a > 0 ? 'droite' : 'gauche'; return [same ? k + '2' : k, `À ${s}, puis à ${s2}`]; }
  return [k, 'À ' + s];
}
// carrefour compliqué : les rues du côté du virage sont comptées en partant du tout droit (D-93)
function navOrd(m, spoken) { const j = m.jx, s = m.a > 0 ? 'droite' : 'gauche';
  if (!j || j.nSide < 2) return (spoken ? 'tourne à ' : 'À ') + s;
  if (j.ord === j.nSide && j.nSide >= 3) return (spoken ? 'prends la rue la plus à ' : 'La plus à ') + s;
  const o = j.ord === 1 ? (spoken ? 'première' : '1re') : (spoken ? ['', '', 'deuxième', 'troisième', 'quatrième', 'cinquième'][j.ord] || j.ord + 'e' : j.ord + 'e');
  return spoken ? `prends la ${o} rue à ${s}` : `${o} à ${s}`; }
// consigne parlée d'un virage (sans la distance)
function navVerb(m) {
  const [k] = navDir(m), s = m.a > 0 ? 'droite' : 'gauche';
  if (m.jog) return `traverse${m.cross ? ' ' + navArt(m.cross) : ''}, ${m.name ? m.name + ' reprend' : 'la rue reprend'} en face, un peu à ${s}`;
  if (m.cx) return 'au carrefour, ' + (m.straight ? 'continue tout droit' : navOrd(m, true)) + (m.name ? ', ' + m.name : '');
  let v = k === 'uturn' ? 'fais demi-tour' : m.keep ? 'garde la ' + s : 'tourne à ' + s;
  if (m.pair) { const q = m.pair, same = (q.a > 0) === (m.a > 0); v += `${m.name ? ', ' + m.name : ''}, puis ${same ? 'encore ' : ''}à ${q.a > 0 ? 'droite' : 'gauche'} dans ${navSayDist(q.d - m.d)}`; }
  else if (m.name) v += ', ' + m.name;
  return v;
}
const navDistTxt = d => d >= 1000 ? fmt(d / 1000, 1) + ' km' : (d >= 100 ? Math.round(d / 50) * 50 : Math.max(10, Math.round(d / 10) * 10)) + ' m';
const navSayDist = d => d >= 1000 ? fmt(d / 1000, 1) + ' kilomètre' + (d >= 2000 ? 's' : '') : (d >= 100 ? Math.round(d / 50) * 50 : Math.round(d / 10) * 10) + ' mètres';
function navSay(t) { if (!NAV.voice || !('speechSynthesis' in window)) return; try { const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; u.rate = 1.05; speechSynthesis.speak(u); } catch (e) {} }
function navElapsed() { if (!NAV.t0) return 0; return ((NAV.paused ? NAV.pauseAt : Date.now()) - NAV.t0 - NAV.pausedMs) / 1000; }
async function navWake() { if (NATIVE) { if (NAV.on && NAV.wake) try { await NP.awake.keepAwake(); } catch (e) {} return; } if (!NAV.on || !NAV.wake || !('wakeLock' in navigator) || document.hidden) return; try { NAV.lock = await navigator.wakeLock.request('screen'); } catch (e) {} }
function navMsg(kind, title, text, ms) {
  const n = $('#run-msg'); clearTimeout(NAV.msgT); n.dataset.kind = n.dataset.kind === 'ask' && kind ? '' : n.dataset.kind || '';
  if (!kind) { n.hidden = true; n.dataset.kind = ''; return; }
  n.className = 'note' + (kind === 'err' ? ' err' : kind === 'info' ? ' info' : ''); n.innerHTML = ''; const b = document.createElement('b'); b.textContent = title; n.append(b, text); n.hidden = false;
  $('#run-nav').hidden = kind === 'err';
  if (ms) NAV.msgT = setTimeout(() => { n.hidden = true; $('#run-nav').hidden = false; }, ms);
}
// position bloquée : on dit où l'autoriser (message bloquant du design system)
function navDenied(n) {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent), and = /Android/.test(navigator.userAgent);
  const how = NATIVE ? 'Réglages → PerfectRun → Position : choisis « Toujours » (pour le suivi écran verrouillé) et active « Position exacte ». Reviens ensuite dans l’app.'
    : ios ? 'Réglages → Confidentialité et sécurité → Service de localisation : active-le, puis « Sites web Safari » → « Lorsque l’app est active » et « Position exacte ». Recharge ensuite la page.'
    : and ? 'Touche le cadenas à gauche de l’adresse → Autorisations → Position : autoriser, et vérifie que la localisation du téléphone est activée. Recharge ensuite la page.'
    : 'Autorise la position pour ce site dans les réglages du navigateur, puis recharge la page.';
  n.className = 'note err'; n.innerHTML = ''; const b = document.createElement('b'); b.textContent = 'Ta position est bloquée'; n.append(b, how); n.hidden = false;
  NAV.denied = true; const g = $('#runp-go'); NAV.goHTML = NAV.goHTML || g.innerHTML; g.textContent = NATIVE ? 'Ouvrir les réglages' : 'Recharger la page';
}
// course libre (D-99) : textes de « Prêt ? » selon le mode
const RUNP_TXT = {};
function runpTexts(solo) {
  const v = $('#run-voice').closest('label'), z = $('#run-buzz-l');
  if (!RUNP_TXT.t) Object.assign(RUNP_TXT, { t: $('#runp-t').textContent, vb: v.querySelector('b').textContent, vs: v.querySelector('small').textContent, zs: z.querySelector('small').textContent });
  $('#runp-t').textContent = solo ? 'Course libre' : RUNP_TXT.t;
  v.querySelector('b').textContent = solo ? 'Annonces vocales' : RUNP_TXT.vb; v.querySelector('small').textContent = solo ? 'Chaque kilomètre annoncé, avec ton temps et ton allure' : RUNP_TXT.vs;
  z.querySelector('small').textContent = solo ? 'À chaque kilomètre' : RUNP_TXT.zs;
  $('#runp .run-priv').hidden = solo; // « Parcours indicatif » : pas de parcours
  const g = $('#runp-go'); g.lastChild.textContent = solo ? 'Démarrer' : 'C’est parti';
  if (solo) { const f = $('#runp-far'); f.className = 'note info'; f.innerHTML = '<b>Cours où tu veux.</b> Ta trace est enregistrée pendant la course. À la fin, elle devient un parcours que tu peux refaire ou envoyer.'; f.hidden = false; }
}
function soloPrep() { NAV.soloNext = true; runPrep(); }
// course libre : la ville choisie doit être celle où l'on est (sinon carte vide et tracé perdu)
function soloWhere(la, lo) {
  if ($('#runp').hidden || !NAV.soloNext) return;
  const k = cityAt(la, lo), f = $('#runp-far'); if (k === CITY) return;
  f.innerHTML = '<b></b><span></span>'; const b = f.querySelector('b'), t = f.querySelector('span');
  if (k) { const c = CITIES[k]; f.className = 'note info'; b.textContent = `Tu es à ${c.name}.`; t.textContent = ` L’app est sur ${C0.name} : passe sur ${c.name} pour que ta course soit sur la carte.`;
    const r = document.createElement('div'); r.className = 'run-choice'; r.innerHTML = '<button type="button" class="btn primary"></button>'; r.firstChild.textContent = `Passer sur ${c.name}`; r.firstChild.onclick = () => setCity(k, { libre: 1 }); f.appendChild(r); }
  else { f.className = 'note'; b.textContent = 'Tu es hors des villes couvertes.'; t.textContent = ' Ta course sera gardée avec ses km et son temps, mais sans tracé.'; }
  f.hidden = false; track('course-libre', k ? 'Autre ville proposée · ' + CITIES[k].name : 'Hors des villes');
}
function runPrep() {
  const solo = !!NAV.soloNext;
  if (!solo && !S.route) return toast("Génère d'abord un parcours.");
  if (NATIVE && !runPrep.asked) { // application : on explique avant la question de l'iPhone (D-86)
    NP.geo.checkPermissions().then(r => { if (/prompt/.test(r.location)) $('#runperm').hidden = false; else { runPrep.asked = true; runPrep(); } }, () => { runPrep.asked = true; runPrep(); });
    return;
  }
  if (!navigator.geolocation) return toast('Ta position n’est pas disponible sur cet appareil.', 3500);
  if (!solo) NAV.n = navBuild(S.route); NAV.r_v = (NAV.r_v || 0) + 1;
  $('#runp-far').hidden = true; $('#runp-far').className = 'note info'; $('#runp').hidden = false;
  NAV.denied = false; if (NAV.goHTML) $('#runp-go').innerHTML = NAV.goHTML;
  runpTexts(solo);
  navigator.geolocation.getCurrentPosition(p => { if (solo) return soloWhere(p.coords.latitude, p.coords.longitude); // prévenir si on n'est pas encore au départ
    const [x, y] = E.toXY(p.coords.latitude, p.coords.longitude), [sx, sy] = NAV.n.pts[0], d = Math.hypot(x - sx, y - sy);
    if (d > 60 && !$('#runp').hidden) { const f = $('#runp-far'); f.innerHTML = ''; const b = document.createElement('b'); b.textContent = `Tu es à ${navDistTxt(d)} du départ.`; f.append(b, ' Rejoins le point D : le chrono démarre quand tu y es.'); f.hidden = false; }
  }, e => { if (e.code === 1) navDenied($('#runp-far')); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
}
const SOLO_N = { L: 0, pts: [[0, 0]], man: [], runs: [], idx: () => 0, at: () => [0, 0] };
function runStart() {
  $('#runp').hidden = true; const solo = !!NAV.soloNext;
  Object.assign(NAV, { free: false, extra: 0, track: [], trail: [], okT: 0, streets: new Map(), curFree: '', on: true, voice: $('#run-voice').checked, wake: $('#run-wake').checked, buzz: NATIVE && $('#run-buzz').checked, t0: 0, wasPre: true, pausedMs: 0, paused: false, prog: 0, pos: null, off: 0, offOn: false, mi: 0, a1: -1, a2: -1, km: 1, follow: true, reacq: false, hiddenAt: 0,
    r: S.route, base: 0, doneSegs: [], oldRest: null, offRun: 0, offTrack: [], ask: false, offAt: 0, mode: null, rejoinD: 0, busy: false, headUp: navHeadPref(), lastJ: null, wrongOn: false, wrongN: 0, jz: null, solo, up: 0, prof: [], curZone: '', segBreak: false, saved: null });
  if (solo) { // course libre (D-99) : pas de parcours, le chrono part tout de suite, la trace est enregistrée
    Object.assign(NAV, { n: SOLO_N, r: null, free: true, t0: Date.now(), wasPre: false, saved: { route: S.route, alts: S.alts } }); S.route = null; S.alts = [];
  }
  document.querySelector('#run .run-prog').hidden = solo;
  $('#run-vol').setAttribute('aria-pressed', NAV.voice); navPosBtn(); mapRotOn();
  document.documentElement.classList.add('running'); $('#run').hidden = false; navMsg(null);
  if (NAV.voice && 'speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) {} } // iOS : la voix doit démarrer après un geste
  navSay(solo ? 'Course libre. Le chrono est lancé.' : 'Suivi du parcours activé.');
  navWake(); resize();
  V.s = Math.max(V.s, 0.9); navUI();
  if (NATIVE) { // application : la position continue écran verrouillé
    NP.bg.addWatcher({ backgroundTitle: solo ? 'PerfectRun enregistre ta course' : 'PerfectRun suit ton parcours', backgroundMessage: solo ? 'Ta trace est enregistrée écran verrouillé.' : 'Le guidage continue écran verrouillé.', requestPermissions: false, stale: false, distanceFilter: 0 }, (l, err) => {
      if (err) { if (err.code === 'NOT_AUTHORIZED') { runStop(); runPrep(); navDenied($('#runp-far')); } return; }
      navFix({ coords: { latitude: l.latitude, longitude: l.longitude, accuracy: l.accuracy, altitude: l.altitude, heading: l.bearing, speed: l.speed }, timestamp: l.time || Date.now() });
    }).then(id => { if (NAV.on) NAV.bgId = id; else NP.bg.removeWatcher({ id }); });
  } else
  NAV.watch = navigator.geolocation.watchPosition(navFix, e => { if (e.code === 1) { runStop(); runPrep(); } }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  NAV.tick = setInterval(navUI, 1000);
  if (solo) track('course-libre', 'Course libre lancée'); else track('suivi', 'Suivi lancé ' + Math.round(NAV.n.L / 1000) + ' km');
}
function runStop() {
  if (NAV.watch != null) navigator.geolocation.clearWatch(NAV.watch); NAV.watch = null; clearInterval(NAV.tick);
  if (NATIVE) { if (NAV.bgId) NP.bg.removeWatcher({ id: NAV.bgId }).catch(() => {}); NAV.bgId = null; try { NP.awake.allowSleep(); } catch (e) {} }
  try { NAV.lock && NAV.lock.release(); } catch (e) {} NAV.lock = null;
  try { speechSynthesis.cancel(); } catch (e) {}
  liveEnd();
  if (NAV.solo && NAV.saved) { S.route = NAV.saved.route; S.alts = NAV.saved.alts; NAV.saved = null; }
  NAV.on = false; mapRotOff(); $('#run').hidden = true; $('#runz').hidden = true; document.documentElement.classList.remove('running');
  setTimeout(() => { resize(); setSheet(sheet); fitRoute(); }, 30);
}
function runFinish(arrived) {
  if (NAV.solo) { const secs = navElapsed(), tr = NAV.track.slice(), dist = NAV.extra, up = NAV.up; runStop(); return soloFinish(tr, dist, secs, up); }
  const secs = navElapsed(), started = !!NAV.t0, free = !!NAV.free, extra = NAV.extra || 0, base = NAV.base || 0, done = base + (free ? NAV.n.L + extra : NAV.prog);
  const streets = free ? [...NAV.streets.entries()].sort((a, b) => b[1] - a[1]).map(q => q[0]).slice(0, 3) : [];
  runStop(); $('#runa').hidden = true;
  if (!started) return;
  track('suivi-fin', free ? 'Terminé après avoir continué' : arrived ? 'Arrivée détectée' : 'Terminé avant l’arrivée');
  SH.extra = free && extra > 50 ? { km: Math.round(extra / 100) / 10, streets } : null;
  // distance prévue seulement si l'on a vraiment parcouru presque tout le tracé (une boucle « arrive » dès le départ)
  shOpen(secs, arrived && !free && !base && NAV.prog >= NAV.n.L * 0.8 ? null : done);
}
// arrivée : on ne coupe pas d'office, le coureur choisit de terminer ou de continuer (D-80)
function navArrive() {
  NAV.paused = true; NAV.pauseAt = Date.now(); NAV.prog = NAV.n.L; navUI();
  navSay('Parcours terminé. Tu peux terminer ou continuer.'); navBuzz('end');
  $('#ra-km').textContent = fmt(((NAV.base || 0) + NAV.n.L) / 1000, 1) + ' km'; $('#ra-time').textContent = fmtClock(navElapsed()); $('#runa').hidden = false;
}
function navContinue() {
  $('#runa').hidden = true; NAV.pausedMs += Date.now() - NAV.pauseAt; NAV.paused = false;
  Object.assign(NAV, { free: true, extra: 0, track: NAV.pos ? [NAV.pos.slice()] : [], streets: new Map(), offOn: false, errShown: false });
  navMsg(null); navSay('Course libre : tes kilomètres en plus sont comptés.'); navUI();
}
// ---------- course libre (D-99) : courir sans parcours, la trace devient un parcours ----------
// quartier ou commune d'un nœud : « Paris 11e », « Lyon 2e », « Villeurbanne »
function zoneName(v) { const q = M.quartiers[G.nq[v] - 1]; if (!q) return ''; if (q.ar >= 50) return q.name; return q.ar ? C0.name + ' ' + q.ar + (q.ar === 1 ? 'er' : 'e') : ''; }
function soloFix(x, y, c, t, last, d) {
  if (!last || NAV.segBreak) { NAV.track.push([x, y, t, last ? 1 : 0]); NAV.segBreak = false; }
  else if (d >= Math.max(4, c.accuracy * 0.5)) {
    const dt = Math.max(1, (t - last[2]) / 1000);
    if (d < 150 || d / dt < 7) NAV.extra += d, NAV.track.push([x, y, t, 0]);
    else { NAV.track.push([x, y, t, 1]); return; } // saut de position (tunnel, signal perdu) : trou dans la trace, pas compté
  } else return;
  const v = E.nearest(x, y);
  if (v >= 0 && Math.hypot(G.NX[v] - x, G.NY[v] - y) < 40) { // D+ : altitude des carrefours proches, lissée comme pour un parcours généré
    NAV.prof.push([NAV.extra, G.NZ[v]]); NAV.up = E.smoothClimb(NAV.prof);
    NAV.curZone = zoneName(v);
  }
  const nm = streetAt(x, y); if (nm && last) NAV.streets.set(nm, (NAV.streets.get(nm) || 0) + d); NAV.curFree = nm;
}
// nom d'un point : station proche, sinon la rue
function soloPlace(p) { const ns = nearestStation(p[0], p[1]); if (ns && ns.d < 400) return ns.s.n; return streetAt(p[0], p[1]) || 'Point sur la carte'; }
// la trace devient un parcours : nettoyée, recalée sur les rues de la carte quand c'est possible
function soloRoute(tr) {
  let inMap = 0; for (const p of tr) { const v = E.nearest(p[0], p[1]); if (v >= 0 && Math.hypot(G.NX[v] - p[0], G.NY[v] - p[1]) < 80) inMap++; }
  if (!tr.length || inMap / tr.length < 0.6) return null; // course hors de la carte
  const segs = []; let cur = []; for (const p of tr) { if (p[3] && cur.length) { segs.push(cur); cur = []; } cur.push([p[0], p[1]]); } if (cur.length) segs.push(cur);
  const out = [], add = q => { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 0.5) out.push([q[0], q[1]]); };
  for (const sg of segs) {
    const P = simplifyPts(sg, 3), W = [P[0]]; let acc = 0;
    for (let i = 1; i < P.length; i++) { acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (acc >= 40 || i === P.length - 1) { W.push(P[i]); acc = 0; } }
    let pv = -1, pw = null;
    if (out.length) { // trou dans la trace (signal perdu) : on relie par les rues si c'est plausible, sinon tout droit
      const l = out[out.length - 1], u = E.nearest(l[0], l[1]), v = E.nearest(W[0][0], W[0][1]), raw = Math.hypot(W[0][0] - l[0], W[0][1] - l[1]);
      const leg = u >= 0 && v >= 0 && u !== v ? E.routeThrough([u, v]) : null;
      if (leg && leg.reduce((s, [e]) => s + G.LEN[e], 0) <= raw * 1.6 + 60) for (const [e, fa] of leg) { const q = E.edgePts(e); if (!fa) q.reverse(); q.forEach(add); }
    }
    for (const w of W) {
      const v = E.nearest(w[0], w[1]), near = v >= 0 && Math.hypot(G.NX[v] - w[0], G.NY[v] - w[1]) < 35;
      if (!pw) add(w);
      else if (near && pv >= 0 && v !== pv) {
        const leg = E.routeThrough([pv, v]), raw = Math.hypot(w[0] - pw[0], w[1] - pw[1]);
        if (leg && leg.reduce((s, [e]) => s + G.LEN[e], 0) <= raw * 1.6 + 25) { add([G.NX[pv], G.NY[pv]]); for (const [e, fa] of leg) { const q = E.edgePts(e); if (!fa) q.reverse(); q.forEach(add); } }
        else add(w);
      } else if (!(near && v === pv)) add(w);
      pv = near ? v : -1; pw = w;
    }
  }
  for (let i = 1; i < out.length - 1; i++) { const a = out[i - 1], b = out[i], c = out[i + 1]; if (Math.hypot(a[0] - c[0], a[1] - c[1]) < 6 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 45) { out.splice(i, 2); i = Math.max(0, i - 2); } } // petits allers-retours dus au recalage
  if (out.length < 2) return null;
  const st = geomRoute(simplifyPts(out, 2)); st.kind = 'solo'; st.solo = true; return st;
}
function soloFinish(tr, dist, secs, up) {
  if (dist < 300 || secs < 120) { toast('Course trop courte pour être gardée.', 3500); track('course-libre', 'Course libre trop courte'); return; }
  track('course-libre', 'Course libre terminée ' + Math.round(dist / 1000) + ' km');
  const st = soloRoute(tr);
  if (!st) { // hors de la carte : km et temps gardés, sans tracé
    const L = mineLoad(); L.unshift({ id: Date.now(), city: CITY, d: new Date().toISOString(), km: Math.round(dist / 100) / 10, up: Math.round(up), dep: 'Course libre', loop: true, t: 'Course libre', g: '', secs: Math.round(secs), meas: true, solo: 1 }); mineSave(L);
    const nb = badgeSync(); setTab('mine'); mineOpen(0); toast(nb.length ? `Course gardée sans son tracé. Nouveau trophée : ${nb.map(b => b.name).join(', ')}.` : 'Course gardée sans son tracé : elle est hors de la carte.', 4000); return;
  }
  st.up = up; S.route = st; S.alts = [st]; S.recv = null; SH.extra = null; draw();
  shOpen(secs, dist);
}
$('#shx-name').addEventListener('input', () => { const v = $('#shx-name').value.trim(), d = SH.data; if (SH.entryId) minePatch(SH.entryId, { t: v || mineTitle(d) }); });

// rue la plus proche d'un point (course libre)
function streetAt(x, y) {
  const v = E.nearest(x, y); if (v < 0) return ''; let best = '', bd = 40;
  for (let k = G.deg[v]; k < G.deg[v + 1]; k++) { const e = G.adjE[k]; if (!G.en[e]) continue; const p = E.edgePts(e);
    for (let i = 1; i < p.length; i++) { const vx = p[i][0] - p[i - 1][0], vy = p[i][1] - p[i - 1][1], l = vx * vx + vy * vy || 1e-9, t = Math.max(0, Math.min(1, ((x - p[i - 1][0]) * vx + (y - p[i - 1][1]) * vy) / l)), d = Math.hypot(x - p[i - 1][0] - vx * t, y - p[i - 1][1] - vy * t); if (d < bd) { bd = d; best = M.names[G.en[e] - 1]; } } }
  return best;
}
// mv : sens dans lequel le coureur avance ; un passage du tracé parcouru dans l'autre sens est ignoré
// (rue empruntée à l'aller et au retour : on ne saute pas au retour en changeant de trottoir, D-114)
function navProject(x, y, d0, d1, mv, strict, pen) {
  const n = NAV.n, i0 = Math.max(0, n.idx(Math.max(0, d0))), i1 = Math.min(n.pts.length - 2, n.idx(Math.min(n.L, d1)) + 1); let best = null;
  for (let i = i0; i <= i1; i++) { const [ax, ay] = n.pts[i], [bx, by] = n.pts[i + 1], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1e-9;
    if (mv && (vx * mv[0] + vy * mv[1]) < (strict ? 0.5 : -0.5) * Math.sqrt(l2)) continue; // strict : seulement un bout pris dans le même sens
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2)), px = ax + vx * t, py = ay + vy * t, dd = Math.hypot(x - px, y - py);
    const d = n.cum[i] + t * Math.sqrt(l2), sc = dd + (pen || 0) * Math.max(0, d - NAV.prog - 30); // pen : un bout plus loin sur le parcours doit être nettement plus proche pour l'emporter
    if (!best || sc < best.sc) best = { dd, d, px, py, sc }; }
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
    if (NAV.solo) soloFix(x, y, c, p.timestamp || Date.now(), last, d);
    else if (!last || (d >= Math.max(4, c.accuracy * 0.5) && d < 150)) { if (last) { NAV.extra += d; const nm = streetAt(x, y); if (nm) NAV.streets.set(nm, (NAV.streets.get(nm) || 0) + d); NAV.curFree = nm; } NAV.track.push([x, y]); }
    const tot = NAV.base + n.L + NAV.extra; if (tot >= NAV.km * 1000) { const pc = navElapsed() / (tot / 1000); navBuzz('km'); navSay(`${NAV.km} kilomètre${NAV.km > 1 ? 's' : ''}. Allure ${Math.floor(pc / 60)} minutes ${Math.round(pc % 60)}.`); NAV.km = Math.floor(tot / 1000) + 1; }
    return navUI();
  }
  // départ : le chrono démarre quand on arrive au point D (ou qu'on est déjà sur le début du tracé)
  if (!NAV.t0) {
    const b = navProject(x, y, 0, 150), toStart = Math.hypot(x - n.pts[0][0], y - n.pts[0][1]);
    if (toStart <= 40 || (b && b.dd <= 25)) { NAV.t0 = Date.now(); NAV.okT = p.timestamp || NAV.t0; NAV.prog = b ? b.d : 0; NAV.proj = b; navSay('C’est parti.'); }
    else { NAV.toStart = toStart; NAV.proj = null; }
    navUI(); return;
  }
  if (NAV.paused) { navUI(); return; }
  const tol = Math.max(35, Math.min(60, c.accuracy * 1.2));
  // sens de déplacement : depuis la dernière position à plus de 12 m (dans les 40 dernières secondes)
  const now = p.timestamp || Date.now(); NAV.trail = (NAV.trail || []).filter(q => now - q[2] < 40000); let mv = null;
  for (let k = NAV.trail.length - 1; k >= 0; k--) { const q = NAV.trail[k], dx = x - q[0], dy = y - q[1], l = Math.hypot(dx, dy); if (l >= 12) { mv = [dx / l, dy / l]; break; } }
  NAV.trail.push([x, y, now]);
  // on ne peut pas avoir avancé plus vite qu'un coureur depuis la dernière position sur le parcours
  const dt = NAV.okT ? (now - NAV.okT) / 1000 : 60, ahead = Math.min(NAV.reacq ? 2500 : 400, 40 + 6.5 * dt); // 6,5 m/s : plus vite qu'un coureur (retour du 30/10 : saut entre deux rues proches)
  let b = navProject(x, y, NAV.prog - 60, NAV.prog + ahead, mv, false, 0.15);
  if (b && b.dd > tol && NAV.off >= 2 && mv) { const w = navProject(x, y, NAV.prog - 200, NAV.prog + 3000, mv, true); if (w && w.dd < b.dd && (w.d - NAV.prog <= ahead || NAV.off >= 3)) b = w; } // on a pu couper ou sauter un bout
  NAV.reacq = false;
  if (!b) return;
  // trottoir d'en face ou autre chaussée du même boulevard : parallèle au tracé, dans le même sens, à moins de 65 m (retour du 30/10)
  if (b.dd > tol && b.dd <= 65 && mv) { const p0 = n.at(b.d - 8), p1 = n.at(b.d + 8), l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1; if (((p1[0] - p0[0]) * mv[0] + (p1[1] - p0[1]) * mv[1]) / l > 0.95) b = Object.assign({}, b, { dd: Math.min(b.dd, 10), side: true }); }
  if (b.dd > tol) {
    NAV.off++; NAV.proj = b;
    if (NAV.offOn && prevPos) { const st = Math.hypot(x - prevPos[0], y - prevPos[1]); if (st < 150) { NAV.offRun += st; NAV.offTrack.push([x, y]); } }
    if (NAV.off >= 2 && !NAV.offOn) {
      NAV.offOn = true; NAV.offAt = Date.now(); NAV.offRun = 0; NAV.offTrack = [prevPos || [x, y], [x, y]]; navBuzz('off');
      if (NAV.mode === 'back' && NAV.prog < NAV.rejoinD) { NAV.ask = false; NAV.autoHere = true; } // on s'éloigne du chemin de retour : on attend ~150 m puis on recalcule depuis ici
      else { NAV.ask = true; navSay('Tu t’es écarté du parcours. Ouvre l’écran pour choisir, sinon je te ramène au parcours.'); }
    }
    if (NAV.offOn && NAV.autoHere && (NAV.offRun > 150 || b.dd > 150) && !NAV.busy) { NAV.autoHere = false; navReroute('here', true); }
    else if (NAV.offOn && NAV.ask && Date.now() - NAV.offAt > 20000 && !NAV.busy) navReroute('back', true);
  } else {
    if (NAV.offOn) { navSay('Tu es de retour sur le parcours.'); }
    NAV.off = 0; NAV.offOn = false; NAV.ask = false; NAV.autoHere = false; NAV.proj = b; NAV.okT = now;
    if (b.d > NAV.prog) NAV.prog = b.d;
    if (NAV.mode === 'back' && NAV.prog >= NAV.rejoinD) NAV.mode = null;
  }
  // annonces : virages et kilomètres
  while (NAV.mi < n.man.length - 1 && n.man[NAV.mi].d < NAV.prog + 5) { const pm = n.man[NAV.mi]; if (pm.jx) NAV.lastJ = { m: pm, t: Date.now() }; NAV.mi++; }
  // mauvaise rue au carrefour qu'on vient de passer : alerte dans les 30 premiers mètres (D-93)
  { const cj = n.man[NAV.mi], J = cj && cj.jx && cj.d - NAV.prog < 20 ? { m: cj, t: Date.now() } : NAV.lastJ, j = J && J.m.jx;
    if (j && !NAV.offOn) { const dj = Math.hypot(x - j.cx, y - j.cy), fresh = Date.now() - J.t < 60000 && NAV.prog - J.m.d < 70;
      let wrongB = null; if (fresh && dj > 12 && dj < 70 && b.dd > Math.max(14, c.accuracy * 0.6)) { let best = null; for (const q of j.br) { const vx = q.px - j.cx, vy = q.py - j.cy, l2 = vx * vx + vy * vy || 1, t = Math.max(0, ((x - j.cx) * vx + (y - j.cy) * vy) / l2), dd = Math.hypot(x - j.cx - vx * t, y - j.cy - vy * t); if (!best || dd < best.dd) best = { q, dd }; } if (best && !best.q.out) wrongB = best.q; }
      if (wrongB) { NAV.wrongN = (NAV.wrongN || 0) + 1; if (NAV.wrongN >= 2 && !NAV.wrongOn) navWrong(true, J.m, wrongB); }
      else { NAV.wrongN = 0; if (NAV.wrongOn && (b.dd < 12 || !fresh)) navWrong(false); } }
    else if (NAV.wrongOn && NAV.offOn) { NAV.wrongOn = false; } }
  // zoom automatique à l'approche d'un carrefour compliqué, dézoom une fois passé (D-93)
  { const mz = n.man[NAV.mi], dz = mz ? mz.d - NAV.prog : 1e9;
    if (mz && mz.cx && dz <= 80 && dz > 0 && NAV.jz !== NAV.mi && NAV.follow) { if (NAV.jz == null) NAV.sBase = V.s; NAV.jz = NAV.mi; NAV.jzEnd = mz.d + 40; V.s = Math.min(3, Math.max(NAV.sBase * 2, 1.8)); }
    else if (NAV.jz != null && NAV.prog > NAV.jzEnd && !(mz && mz.cx && dz <= 80)) { NAV.jz = null; if (NAV.sBase) V.s = NAV.sBase; } }
  const m = n.man[NAV.mi], dm = m.d - NAV.prog;
  if (!m.arrive && !NAV.offOn) {
    const s = m.a > 0 ? 'droite' : 'gauche', p = man => { const prev = n.man[NAV.mi - 1]; return man.second && prev && prev.pair === man; };
    const short = m.jog ? 'Traverse, puis en face' + (m.name ? ', ' + m.name : '') : m.cx ? (m.straight ? 'Tout droit' : navOrd(m)) + (m.name ? ', ' + m.name : '') : p(m) ? ((m.a > 0) === (n.man[NAV.mi - 1].a > 0) ? 'Encore à ' + s : 'Tourne à ' + s) : (m.keep ? 'Garde la ' + s : navDir(m)[0] === 'uturn' ? 'Fais demi-tour' : 'Tourne à ' + s) + (m.pair ? `, puis ${(m.pair.a > 0) === (m.a > 0) ? 'encore ' : ''}à ${m.pair.a > 0 ? 'droite' : 'gauche'}` : '');
    if (dm <= 120 && dm > 40 && NAV.a1 !== NAV.mi && !p(m)) { NAV.a1 = NAV.mi; navSay(`Dans ${navSayDist(dm)}, ${navVerb(m)}.`); }
    else if (dm <= 25 && NAV.a2 !== NAV.mi) { NAV.a2 = NAV.mi; navBuzz('turn'); navSay(short + '.'); }
  }
  { const tot = NAV.base + NAV.prog; if (tot >= NAV.km * 1000 && NAV.km * 1000 < NAV.base + n.L - 200) { const pc = navElapsed() / (tot / 1000); navBuzz('km'); navSay(`${NAV.km} kilomètre${NAV.km > 1 ? 's' : ''}. Allure ${Math.floor(pc / 60)} minutes ${Math.round(pc % 60)}.`); NAV.km = Math.floor(tot / 1000) + 1; } }
  // arrivée
  if (NAV.prog >= n.L - 30 || (NAV.prog > n.L * 0.9 && Math.hypot(x - n.pts[n.pts.length - 1][0], y - n.pts[n.pts.length - 1][1]) < 25)) return navArrive();
  navUI();
}
function navUI() {
  if (!NAV.on) return;
  const n = NAV.n, secs = navElapsed(), km = (NAV.base + (NAV.free ? n.L + NAV.extra : NAV.prog)) / 1000;
  $('#rs-done').textContent = fmt(km, 1) + ' km'; $('#rs-rest').textContent = NAV.solo ? Math.round(NAV.up) + ' m' : NAV.free ? '+' + fmt(NAV.extra / 1000, 1) + ' km' : fmt(Math.max(0, n.L - NAV.prog) / 1000, 1) + ' km'; $('#rs-rest-l').textContent = NAV.solo ? 'D+' : NAV.free ? 'en plus' : 'restants';
  $('#rs-time').textContent = fmtClock(secs); $('#rs-pace').textContent = km > 0.2 ? fmtClock(secs / km) : '–';
  if (!NAV.solo) $('#run-bar').style.width = (100 * (NAV.base + NAV.prog) / (NAV.base + n.L)).toFixed(1) + '%';
  { const pb = $('#run-pause'), pre = !NAV.t0 && !NAV.free; if (pb.dataset.pre !== String(pre)) { pb.dataset.pre = pre; // avant le départ : on peut arrêter le suivi (pas de pause sans chrono)
    pb.innerHTML = pre ? '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>Arrêter le suivi' : '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h3v16H7z"/><path d="M14 4h3v16h-3z"/></svg>Pause'; } }
  let ic, big, small;
  if (NAV.solo) { ic = 'chrono'; big = 'Course libre'; small = NAV.curFree ? NAV.curFree + (NAV.curZone ? ' · ' + NAV.curZone : '') : NAV.track.length ? NAV.curZone : 'Recherche de ta position…'; }
  else if (NAV.free) { ic = 'straight'; big = '+' + navDistTxt(NAV.extra); small = 'Course libre' + (NAV.curFree ? ' · ' + NAV.curFree : ''); }
  else if (!NAV.t0) { ic = 'start'; big = NAV.toStart ? navDistTxt(NAV.toStart) : '…'; small = NAV.toStart ? 'Rejoins le départ · point D' : 'Recherche de ta position…'; }
  let sub = '';
  if (!NAV.free && NAV.t0) { const m = n.man[NAV.mi] || n.man[n.man.length - 1], [k, t] = navDir(m); ic = k; big = m.arrive && NAV.prog >= n.L - 1 ? 'Arrivée' : navDistTxt(Math.max(0, m.d - NAV.prog));
    NAV.liveHead = m.arrive ? 'Arrivée' : t.replace(/, puis .*$/, '') + ' dans ' + big + (m.name ? ' · ' + m.name : ''); // écran verrouillé : un seul virage, le nom de la rue reste lisible (le second est annoncé dans l'app) NAV.liveTurn = ['right', 'left', 'straight'].includes(k) ? k : k === 'sright' || k === 'keepr' || k === 'right2' || k === 'jogr' ? 'right' : k === 'sleft' || k === 'keepl' || k === 'left2' || k === 'jogl' ? 'left' : 'straight';
    small = m.arrive ? (S.mode === 'loop' && S.tab !== 'race' ? 'Arrivée · retour au départ' : 'Arrivée') : t + (m.name ? ' · ' + m.name : '') + (m.pair && m.pair.name && m.pair.name !== m.name ? ', puis ' + m.pair.name : '');
    if (m.pair) { const same = (m.pair.a > 0) === (m.a > 0); sub = `${same ? 'Encore' : 'Puis'} à ${m.pair.a > 0 ? 'droite' : 'gauche'} ${navDistTxt(m.pair.d - m.d)} après`; }
    if (m.jog) sub = `La rue reprend ${navDistTxt(m.jog)} à ${m.a > 0 ? 'droite' : 'gauche'}`;
    else if (m.cx && !m.arrive) sub = `Carrefour à ${m.jx.br.length + 1} rues`;
    if (NAV.mode === 'back' && NAV.prog < NAV.rejoinD) sub = 'Retour au parcours dans ' + navDistTxt(NAV.rejoinD - NAV.prog); }
  if (ic === 'jx') { const m = n.man[NAV.mi], key = 'jx' + NAV.mi + ':' + NAV.r_v; if (NAV.icK !== key) { $('#run-ic').innerHTML = navSchema(m.jx); $('#run-ic').classList.add('jx'); NAV.icK = key; } }
  else if (NAV.icK !== ic) { $('#run-ic').innerHTML = runIco(ic); $('#run-ic').classList.remove('jx'); NAV.icK = ic; }
  $('#run-dist').textContent = big; $('#run-street').textContent = small; $('#run-sub').textContent = sub; $('#run-sub').hidden = !sub;
  const cur = NAV.free ? '' : NAV.t0 ? (n.runs.find(q => q.d0 <= NAV.prog + 1 && q.d1 >= NAV.prog - 1) || {}).name : ''; $('#run-cur').textContent = cur ? 'Tu es sur ' + cur : ''; $('#run-cur').hidden = !cur;
  if (NAV.offOn) { navOffMsg(NAV.proj ? NAV.proj.dd : 0); NAV.errShown = true; }
  else if (NAV.errShown) { NAV.errShown = false; navMsg(null); $('#run-nav').hidden = false; }
  if (NAV.follow && NAV.pos) navCenter(); else draw();
  mapRotFollow();
  { const tb = $('.run-top').getBoundingClientRect().bottom; $('.run-tools').style.top = Math.round(tb + 12) + 'px'; } // outils sous le bandeau ou le message
  liveSync();
}
// ---------- écran verrouillé : Activité en direct (D-100), application iPhone seulement ----------
function liveState() {
  const n = NAV.n, secs = navElapsed(), solo = NAV.solo, km = (NAV.base + (NAV.free ? n.L + NAV.extra : NAV.prog)) / 1000;
  const runHead = solo || NAV.free ? 'Course libre' : NAV.liveHead || 'Suivi du parcours', runTurn = solo || NAV.free ? 'chrono' : NAV.liveTurn || 'straight';
  const done = !$('#runa').hidden; // arrivée : le coureur choisit de terminer ou de continuer
  return { mode: solo ? 'solo' : 'route', head: done ? 'Parcours terminé' : NAV.paused ? 'En pause' : runHead, turn: NAV.paused ? 'pause' : runTurn, runHead, runTurn,
    km: fmt(km, 1) + ' km', kmLabel: solo || NAV.free ? 'faits' : 'faits sur ' + fmt((NAV.base + n.L) / 1000, 1), pace: km > 0.2 ? fmtClock(secs / km) : '–',
    paused: !!NAV.paused, elapsed: Math.round(secs), progress: solo || NAV.free ? -1 : Math.min(1, (NAV.base + NAV.prog) / (NAV.base + n.L)) };
}
function liveSync(force) {
  if (!NATIVE || !NAV.on || !NAV.t0 || NAV.liveFail) return; // un seul essai par course : pas de message en boucle
  const st = liveState(), key = [st.head, st.km, st.paused, Math.round(st.progress * 50)].join('|'); // le temps défile seul sur la carte : on n'envoie qu'aux changements (et toutes les 30 s pour l'allure)
  if (!force && key === NAV.liveK && Date.now() - (NAV.liveT || 0) < 30000) return;
  NAV.liveK = key; NAV.liveT = Date.now();
  if (!liveSync.w) { liveSync.w = true; NP.live.watch({}, r => { if (!r || !NAV.on) return; if (r.action === 'pause' && !NAV.paused && NAV.t0) $('#run-pause').onclick(); else if (r.action === 'resume' && NAV.paused) { if (!$('#runa').hidden) navContinue(); else runResume(); } }); }
  if (NAV.liveOn) NP.live.update(st).catch(() => {});
  else { NAV.liveOn = true; NP.live.start(st).then(r => { if (r && r.ok === false) { NAV.liveOn = false; NAV.liveFail = true; toast('Écran verrouillé indisponible : ' + (r.error || 'raison inconnue') + '.', 6000); track('ecran-verrouille', 'Échec · ' + String(r.error || '').slice(0, 60)); } })
    .catch(e => { NAV.liveOn = false; NAV.liveFail = true; toast('Écran verrouillé indisponible : ' + ((e && e.message) || e) + '.', 6000); }); }
}
function liveEnd() { NAV.liveFail = false; if (NATIVE && NAV.liveOn) { NAV.liveOn = false; NAV.liveK = ''; NP.live.end().catch(() => {}); } }
function navCenter() {
  const pv = mapPivot(), r = { width: W }, top = pv.top, bot = pv.bot;
  const [x, y] = NAV.pos;
  if (!NAV.t0) { // avant le départ : on cadre ta position et le point D
    const [sx, sy] = NAV.n.pts[0], w = Math.abs(sx - x) + 160, h = Math.abs(sy - y) + 160;
    V.s = Math.max(0.15, Math.min(1.2, (pv.ww - 32) / w, (pv.bot - pv.top - 32) / h)); V.tx = pv.cx - (x + sx) / 2 * V.s; V.ty = pv.cy - 20 - (y + sy) / 2 * V.s; return draw();
  }
  if (NAV.wasPre) { NAV.wasPre = false; V.s = Math.max(V.s, 0.9); }
  V.tx = pv.cx - x * V.s; V.ty = pv.cy - y * V.s; draw();
}
// dessin sur la carte (appelé depuis render) : partie déjà courue, position, écart au tracé
function navDrawDone(px) {
  if (NAV.on && NAV.oldRest && NAV.oldRest.length > 1) { const q = new Path2D(); NAV.oldRest.forEach(([x, y], i) => i ? q.lineTo(x, y) : q.moveTo(x, y)); ctx.save(); ctx.strokeStyle = css('--route-done'); ctx.lineWidth = px(3.5); ctx.setLineDash([px(6), px(6)]); ctx.stroke(q); ctx.restore(); }
  if (NAV.on && NAV.doneSegs) for (const sg of NAV.doneSegs) if (sg.length > 1) { const q = new Path2D(); sg.forEach(([x, y], i) => i ? q.lineTo(x, y) : q.moveTo(x, y)); ctx.strokeStyle = colors.casing; ctx.lineWidth = px(8); ctx.stroke(q); ctx.strokeStyle = css('--route-done'); ctx.lineWidth = px(4.5); ctx.stroke(q); }
  if (NAV.on && NAV.free && NAV.track.length > 1) { const q = new Path2D(); NAV.track.forEach(([x, y, , gap], i) => i && !gap ? q.lineTo(x, y) : q.moveTo(x, y)); ctx.strokeStyle = colors.casing; ctx.lineWidth = px(8); ctx.stroke(q); ctx.strokeStyle = NAV.solo ? colors.route : css('--route-done'); ctx.lineWidth = px(4.5); ctx.stroke(q); }
  if (!NAV.on || !NAV.t0 || NAV.prog <= 0) return;
  const n = NAV.n, k = n.idx(NAV.prog), p = new Path2D(); p.moveTo(n.pts[0][0], n.pts[0][1]);
  for (let i = 1; i <= k; i++) p.lineTo(n.pts[i][0], n.pts[i][1]); const e = n.at(NAV.prog); p.lineTo(e[0], e[1]);
  ctx.strokeStyle = colors.casing; ctx.lineWidth = px(8); ctx.stroke(p); ctx.strokeStyle = css('--route-done'); ctx.lineWidth = px(4.5); ctx.stroke(p);
}
// noms des rues du parcours, posés sur le tracé (D-80) : en course, et dès qu'on zoome sur un parcours
function drawRouteNames() {
  const R = NAV.on && NAV.r ? NAV.r : S.route; if (!R || !(NAV.on || V.s >= 0.45)) return;
  const n = NAV.on ? NAV.n : (R._nav || (R._nav = navBuild(R)));
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = `700 12px ${css('--f-body')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const boxes = [];
  for (const run of n.runs) {
    if (NAV.on && NAV.t0 && run.d1 < NAV.prog) continue; // en course : seulement les rues à venir
    const tw = ctx.measureText(run.name).width; if ((run.d1 - run.d0) * V.s < Math.min(tw + 40, 70)) continue;
    const dm = (run.d0 + run.d1) / 2, a = n.at(dm - 12), b = n.at(dm + 12), [mx, my] = n.at(dm), cx = mx * V.s + V.tx, cy = my * V.s + V.ty;
    if (cx < 0 || cy < 0 || cx > W || cy > H) continue;
    let ang = uprightAng(Math.atan2(b[1] - a[1], b[0] - a[0]));
    const hw = Math.abs(Math.cos(ang)) * (tw / 2 + 6) + Math.abs(Math.sin(ang)) * 10, hh = Math.abs(Math.sin(ang)) * (tw / 2 + 6) + Math.abs(Math.cos(ang)) * 10;
    if (boxes.some(q => Math.abs(q[0] - cx) < q[2] + hw && Math.abs(q[1] - cy) < q[3] + hh)) continue; boxes.push([cx, cy, hw, hh]);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-tw / 2 - 6, -10, tw + 12, 20, 4) : ctx.rect(-tw / 2 - 6, -10, tw + 12, 20); ctx.fillStyle = colors.panel; ctx.fill(); ctx.strokeStyle = colors.route; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = colors.ink; ctx.fillText(run.name, 0, 0.5); ctx.restore();
  }
  ctx.restore();
}
function navHeading() {
  let h = NAV.head; if (h == null && NAV.free) { const t = NAV.track, a = t[Math.max(0, t.length - 3)] || NAV.pos; h = a === NAV.pos ? 0 : Math.atan2(NAV.pos[0] - a[0], -(NAV.pos[1] - a[1])) * 180 / Math.PI; }
  if (h == null) { const n = NAV.n, a = NAV.t0 ? n.at(NAV.prog) : NAV.pos, b = NAV.t0 ? n.at(NAV.prog + 15) : n.pts[0]; h = Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180 / Math.PI; }
  return h;
}
function navDrawMe() {
  if (!NAV.on || !NAV.pos) return;
  const [x, y] = NAV.pos, sx = x * V.s + V.tx, sy = y * V.s + V.ty;
  if (NAV.offOn && NAV.proj) { const qx = NAV.proj.px * V.s + V.tx, qy = NAV.proj.py * V.s + V.ty; ctx.save(); ctx.strokeStyle = css('--err'); ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(qx, qy); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(qx, qy, 5, 0, 7); ctx.fillStyle = colors.panel; ctx.fill(); ctx.stroke(); ctx.restore(); }
  const h = navHeading(); // cap : 0 = nord, sens horaire
  ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, 22, 0, 7); ctx.fillStyle = colors.ink; ctx.globalAlpha = 0.1; ctx.fill(); ctx.globalAlpha = 1;
  ctx.translate(sx, sy); ctx.rotate(h * Math.PI / 180); ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(10, 11); ctx.lineTo(0, 5); ctx.lineTo(-10, 11); ctx.closePath();
  ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = colors.panel; ctx.stroke(); ctx.fillStyle = colors.ink; ctx.fill(); ctx.restore();
}

// ---------- course : hors parcours, deux choix (D-90) ----------
function navOffMsg(d) {
  const n = $('#run-msg'), txt = `Le tracé est à ${navDistTxt(d)}${NAV.proj && NAV.n ? '' : ''}.`;
  if (NAV.ask && !NAV.busy) {
    if (n.dataset.kind !== 'ask') { clearTimeout(NAV.msgT); n.className = 'note err'; n.innerHTML = '<b>Tu t’es écarté du parcours</b><span class="rm-t"></span><div class="run-choice"><button type="button" class="btn primary" id="rc-back">Me ramener au parcours</button><button type="button" class="btn ghost" id="rc-here">Continuer par ici</button></div>';
      n.querySelector('#rc-back').onclick = () => navReroute('back', false); n.querySelector('#rc-here').onclick = () => navReroute('here', false); n.dataset.kind = 'ask'; n.hidden = false; $('#run-nav').hidden = true; }
    n.querySelector('.rm-t').textContent = txt;
  } else if (n.dataset.kind !== 'off' || NAV.busy) { n.dataset.kind = NAV.busy ? 'busy' : 'off'; navMsg('err', 'Tu t’es écarté du parcours', NAV.busy ? 'Calcul du nouveau chemin…' : txt + ' Suis le pointillé rouge pour le rejoindre.'); }
  else n.lastChild.textContent = txt + ' Suis le pointillé rouge pour le rejoindre.';
}
async function navReroute(kind, auto) {
  if (!NAV.on || !NAV.pos || NAV.busy) return;
  const n = NAV.n, R = NAV.r, [px, py] = NAV.pos, A = E.nearest(px, py); if (A < 0) return;
  NAV.busy = true; NAV.ask = false; navOffMsg(NAV.proj ? NAV.proj.dd : 0);
  const from = NAV.proj ? Math.max(NAV.prog, NAV.proj.d) : NAV.prog; let st = null, rejoin = 0;
  try {
    if (kind === 'back') { // rejoindre le parcours un peu plus loin (pas de demi-tour)
      const dT = Math.min(n.L - 20, from + 100);
      if (R.edges && R.edges.length) { let c = 0, k = 0; while (k < R.edges.length - 1 && c + G.LEN[R.edges[k][0]] <= dT) { c += G.LEN[R.edges[k][0]]; k++; }
        const [e0, f0] = R.edges[k], T = f0 ? G.ea[e0] : G.eb[e0], leg = E.routeThrough([A, T]);
        if (leg) { st = E.statsOf(leg.concat(R.edges.slice(k)), A); rejoin = leg.reduce((s, [e]) => s + G.LEN[e], 0); } }
      else { const [tx, ty] = n.at(dT), T = E.nearest(tx, ty), leg = T >= 0 ? E.routeThrough([A, T]) : null;
        if (leg) { const pts = []; for (const [e, fa] of leg) { const q = E.edgePts(e); if (!fa) q.reverse(); q.forEach((p, i) => (i || !pts.length) && pts.push(p)); } rejoin = leg.reduce((s, [e]) => s + G.LEN[e], 0); for (let i = n.idx(dT) + 1; i < n.pts.length; i++) pts.push(n.pts[i]); st = geomRoute(pts); } }
    } else { // continuer par ici : fin du parcours recalculée jusqu'à l'arrivée, à distance égale
      let B; if (R.edges && R.edges.length) { const [e1, f1] = R.edges[R.edges.length - 1]; B = f1 ? G.eb[e1] : G.ea[e1]; } else { const q = n.pts[n.pts.length - 1]; B = E.nearest(q[0], q[1]); }
      const target = Math.max(200, n.L - from);
      if (B >= 0 && B !== A) { const r = await E.aToB(A, B, target, Object.assign({}, S.lastOpt || {}, { seed: (S.lastOpt && S.lastOpt.seed || 1) + 101, endNodes: undefined })); st = r && (r.alts ? r.alts[0] : r); }
    }
  } catch (e) { console.error(e); st = null; }
  NAV.busy = false;
  if (!NAV.on) return;
  if (!st || !st.len) { NAV.ask = true; NAV.offAt = Date.now(); navMsg('err', 'Recalcul impossible', 'Suis le pointillé rouge pour rejoindre le parcours.'); $('#run-msg').dataset.kind = 'fail'; return; }
  // ce qui est fait reste fait : tracé couru + écart, puis on repart sur le nouveau parcours
  const done = []; { const k = n.idx(NAV.prog); for (let i = 0; i <= k; i++) done.push(n.pts[i]); done.push(n.at(NAV.prog)); }
  NAV.doneSegs.push(done); if (NAV.offTrack.length > 1) NAV.doneSegs.push(NAV.offTrack.slice());
  if (kind === 'here') { const rest = []; for (let i = n.idx(from); i < n.pts.length; i++) rest.push(n.pts[i]); NAV.oldRest = rest; } else NAV.oldRest = null;
  const oldRestLen = n.L - from;
  NAV.base += NAV.prog + NAV.offRun; NAV.r = st; NAV.n = navBuild(st); NAV.r_v = (NAV.r_v || 0) + 1; NAV.lastJ = null; navWrong(false);
  Object.assign(NAV, { prog: 0, mi: 0, a1: -1, a2: -1, off: 0, offOn: false, offRun: 0, offTrack: [], proj: null, mode: kind, rejoinD: kind === 'back' ? rejoin : 0, errShown: false });
  $('#run-msg').dataset.kind = ''; navMsg(null);
  if (kind === 'here') { const dl = st.len - oldRestLen, dTxt = Math.abs(dl) < 100 ? '' : `, soit ${fmt(Math.abs(dl) / 1000, 1)} km de ${dl > 0 ? 'plus' : 'moins'}`;
    navMsg('info', 'Parcours recalculé', `Depuis ta position : ${fmt(st.len / 1000, 1)} km restants${dTxt}.`, 7000); navSay(`Parcours recalculé depuis ta position. ${navSayDist(st.len)} restants.`); }
  else navSay(auto ? 'Je te ramène au parcours.' : 'D’accord, je te ramène au parcours.');
  track('hors-parcours', (kind === 'back' ? 'Me ramener' : 'Continuer par ici') + (auto ? ' (auto)' : ''));
  navUI();
}
// ---------- course : carte qui suit ta direction (D-90) ----------
const navHeadPref = () => { try { return localStorage.getItem('runparis-headup') !== '0'; } catch (e) { return true; } };
function uprightAng(ang) { const r = MAPROT * Math.PI / 180; let a = ang + r; while (a > Math.PI / 2) a -= Math.PI; while (a < -Math.PI / 2) a += Math.PI; return a - r; }
{ // textes toujours droits à l'écran quand la carte tourne
  const ft = ctx.fillText.bind(ctx), stt = ctx.strokeText.bind(ctx);
  const wrap = f => (t, x, y, mw) => { if (!MAPROT) return f(t, x, y, mw); const m = ctx.getTransform(); if (Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6) return f(t, x, y, mw); ctx.save(); ctx.translate(x, y); ctx.rotate(-MAPROT * Math.PI / 180); f(t, 0, 0, mw); ctx.restore(); };
  ctx.fillText = wrap(ft); ctx.strokeText = wrap(stt);
}
function mapPivot() { // point où se place le coureur, en coordonnées du canvas
  const mw = $('#mapwrap').getBoundingClientRect(), top = $('.run-top').getBoundingClientRect().bottom - mw.top, bot = $('.run-panel').getBoundingClientRect().top - mw.top;
  const ox = MAPROT_ON ? (cv.offsetWidth - mw.width) / 2 : 0, oy = MAPROT_ON ? (cv.offsetHeight - mw.height) / 2 : 0;
  return { cx: mw.width / 2 + ox, cy: (top + bot) / 2 + 20 + oy, top: top + oy, bot: bot + oy, ww: mw.width };
}
function mapRotOn() { // canvas agrandi (diagonale) pour que les coins restent couverts quand il tourne
  const mw = $('#mapwrap').getBoundingClientRect(), D = Math.ceil(Math.hypot(mw.width, mw.height)) + 4;
  MAPROT_ON = true; Object.assign(cv.style, { position: 'absolute', width: D + 'px', height: D + 'px', left: (mw.width - D) / 2 + 'px', top: (mw.height - D) / 2 + 'px' });
  resize(); mapRotTo(0, false);
}
function mapRotOff() { MAPROT = 0; MAPROT_ON = false; Object.assign(cv.style, { position: '', width: '', height: '', left: '', top: '', transform: '', transformOrigin: '', transition: '' }); $('#run-north').hidden = true; resize(); }
function mapRotTo(deg, anim) {
  if (!MAPROT_ON) return; const pv = mapPivot();
  cv.style.transformOrigin = `${pv.cx}px ${pv.cy}px`; cv.style.transition = anim ? 'transform .45s ease' : 'none';
  MAPROT = deg; cv.style.transform = deg ? `rotate(${deg}deg)` : '';
  const nr = ((deg % 360) + 360) % 360, off = Math.min(nr, 360 - nr) > 3; $('#run-north').hidden = !off; $('#run-needle').style.transform = `rotate(${deg}deg)`;
  draw();
}
function mapRotFollow() { // direction en haut : la carte tourne avec le coureur
  if (!NAV.on || !MAPROT_ON || !NAV.follow || !NAV.headUp || !NAV.pos) return;
  let t = -navHeading(); while (t - MAPROT > 180) t -= 360; while (t - MAPROT < -180) t += 360;
  if (Math.abs(t - MAPROT) > 4) mapRotTo(t, true);
}
// recentrage automatique (D-92) : au retour dans l'app, et 10 s après le dernier geste sur la carte
function navRefollow() { if (!NAV.on) return; clearTimeout(NAV.refT); NAV.follow = true; navPosBtn(); if (NAV.pos) navCenter(); else draw(); mapRotFollow(); }
function navIdleArm() { if (!NAV.on) return; clearTimeout(NAV.refT); if (NAV.follow) return; NAV.refT = setTimeout(() => { if (NAV.on && !NAV.follow && !ptrs.size) navRefollow(); else navIdleArm(); }, 10000); }
function navPosBtn() { const b = $('#run-pos'); b.setAttribute('aria-pressed', !!NAV.follow); b.dataset.mode = NAV.headUp ? 'head' : 'north'; b.setAttribute('aria-label', !NAV.follow ? 'Recentrer sur ma position' : NAV.headUp ? 'Carte orientée dans ta direction (toucher : nord en haut)' : 'Nord en haut (toucher : orienter dans ta direction)'); }
if (/[?&]navtest=1/.test(location.search)) { window.RP_NAV = NAV; window.RP_VS = () => V.s; } // recette automatique uniquement
$('#run-go').onclick = () => { NAV.soloNext = false; runPrep(); };
$('#solo-go').onclick = $('#mine-solo').onclick = soloPrep;
$('#runp-x').onclick = $('#runp-back').onclick = () => { $('#runp').hidden = true; };
$('#runp-go').onclick = () => { if (NAV.denied) { NAV.denied = false; if (NATIVE) { $('#runp').hidden = true; return NP.bg.openSettings().catch(() => {}); } return location.reload(); } runStart(); };
$('#runperm-go').onclick = () => { $('#runperm').hidden = true; runPrep.asked = true; NP.geo.requestPermissions({ permissions: ['location'] }).then(() => runPrep(), () => runPrep()); };
$('#runperm-later').onclick = $('#runperm-back').onclick = () => { $('#runperm').hidden = true; };
$('#run-vol').onclick = () => { NAV.voice = !NAV.voice; $('#run-vol').setAttribute('aria-pressed', NAV.voice); if (!NAV.voice) try { speechSynthesis.cancel(); } catch (e) {} };
$('#run-pos').onclick = () => { // libre → suivi ; suivi → bascule nord en haut / direction en haut
  if (!NAV.follow) NAV.follow = true; else { NAV.headUp = !NAV.headUp; try { localStorage.setItem('runparis-headup', NAV.headUp ? '1' : '0'); } catch (e) {} if (!NAV.headUp) mapRotTo(0, true); }
  navPosBtn(); if (NAV.pos) navCenter(); mapRotFollow(); };
$('#run-north').onclick = () => { if (NAV.headUp) { NAV.headUp = false; try { localStorage.setItem('runparis-headup', '0'); } catch (e) {} } mapRotTo(0, true); navPosBtn(); };
$('#run-pause').onclick = () => { if (!NAV.t0) return runFinish(false); NAV.paused = true; NAV.pauseAt = Date.now(); $('#rz-done').textContent = fmt((NAV.solo ? NAV.extra : NAV.base + NAV.prog) / 1000, 1) + ' km'; $('#rz-of').textContent = NAV.solo ? 'faits' : 'faits sur ' + fmt((NAV.base + NAV.n.L) / 1000, 1); $('#rz-time').textContent = fmtClock(navElapsed()); $('#runz').hidden = false; liveSync(true); };
const runResume = () => { if (NAV.paused) { NAV.pausedMs += Date.now() - NAV.pauseAt; NAV.paused = false; NAV.reacq = true; NAV.segBreak = true; } $('#runz').hidden = true; navUI(); };
$('#runz-go').onclick = runResume; $('#runz-x').onclick = runResume; $('#runz-back').onclick = runResume;
$('#runa-end').onclick = () => runFinish(true); $('#runa-go').onclick = navContinue;
$('#runz-end').onclick = () => { if (NAV.paused) { NAV.pausedMs += Date.now() - NAV.pauseAt; NAV.paused = false; NAV.pauseAt = 0; } runFinish(false); };
document.addEventListener('visibilitychange', () => {
  if (!NAV.on) return;
  if (document.hidden) { NAV.hiddenAt = Date.now(); return; }
  navWake(); const gap = NAV.hiddenAt ? (Date.now() - NAV.hiddenAt) / 1000 : 0; NAV.hiddenAt = 0;
  navRefollow(); setTimeout(navRefollow, 400); // la carte revient sur toi, dans le mode choisi
  if (gap > 15 && NAV.t0 && !NAV.paused && !NATIVE) { NAV.reacq = true; navMsg('warn', `Suivi interrompu ${gap >= 90 ? Math.round(gap / 60) + ' min' : Math.round(gap) + ' s'}`, 'L’écran s’est verrouillé. Ta position a repris, la distance est recalculée.', 8000); }
});
addEventListener('beforeunload', e => { if (NAV.on && NAV.t0) { e.preventDefault(); e.returnValue = ''; } });
