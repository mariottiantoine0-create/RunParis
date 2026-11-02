// PerfectRun · Worker Cloudflare
// - Sert le site (dossier site/, via env.ASSETS) : le Worker ne tourne que pour /api/* (voir run_worker_first dans wrangler.jsonc).
// - POST /api/signalement : « Signaler un problème » (site et app) → email à l'éditeur, via Cloudflare Email Routing.
//   Adresse de destination : secret SIGNAL_TO (réglé dans Cloudflare, jamais dans le dépôt). Expéditeur : signalement@perfectrun.fr.
import { EmailMessage } from 'cloudflare:email';

// Sécurité (D-111) : on n'accepte que le site lui-même (production et aperçus staging, même adresse que la page)
// et l'app iPhone ; un même appareil ne peut pas envoyer plus de 3 signalements par minute.
const APP_ORIGINS = ['capacitor://localhost', 'ionic://localhost'];
const allowed = (req) => { const o = req.headers.get('Origin'); if (!o) return false; if (APP_ORIGINS.includes(o)) return true; try { return new URL(o).host === new URL(req.url).host; } catch (e) { return false; } };
const cors = (req) => ({
  'Access-Control-Allow-Origin': allowed(req) ? req.headers.get('Origin') : 'https://perfectrun.fr',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Vary': 'Origin',
});
// réponse JSON avec les en-têtes CORS de la requête à laquelle elle répond (pas d'état partagé entre requêtes simultanées)
const reply = (req) => (status, data) => new Response(JSON.stringify(data), { status, headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8' } });

// texte UTF-8 → base64 (en-têtes et corps de l'email)
const b64 = s => { const u = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(bin); };
const clean = (v, n) => String(v || '').replace(/\r/g, '').slice(0, n).trim();

async function signalement(req, env) {
  const json = reply(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: allowed(req) ? 204 : 403, headers: cors(req) });
  if (req.method !== 'POST') return json(405, { ok: false });
  if (!allowed(req)) return json(403, { ok: false, error: 'origine refusée' });
  if (env.SIGNAL_LIMIT) { const ip = req.headers.get('CF-Connecting-IP') || 'inconnu'; const { success } = await env.SIGNAL_LIMIT.limit({ key: ip }); if (!success) return json(429, { ok: false, error: 'trop d’envois, réessaie dans une minute' }); }
  if ((req.headers.get('Content-Length') | 0) > 20000) return json(413, { ok: false, error: 'message trop long' });
  let d = {};
  try { d = Object.fromEntries(new URLSearchParams(await req.text())); } catch (e) { return json(400, { ok: false }); }
  if (d['bot-field']) return json(200, { ok: true }); // piège à robots : on fait comme si
  const message = clean(d.message, 5000);
  if (!message) return json(400, { ok: false, error: 'message vide' });
  if (!env.MAIL || !env.SIGNAL_TO) return json(503, { ok: false, error: 'envoi non configuré' });

  const type = clean(d.type, 60), email = clean(d.email, 200), parcours = clean(d.parcours, 4000), page = clean(d.page, 1000);
  const host = new URL(req.url).hostname, origin = req.headers.get('Origin') || '';
  const where = /^capacitor:|^ionic:/.test(origin) ? 'app iPhone' : /perfectrun\.fr$/.test(host) ? 'site' : host;
  const from = env.SIGNAL_FROM || 'signalement@perfectrun.fr', to = env.SIGNAL_TO;
  const subject = `PerfectRun · ${type || 'Message'} (${where})`;
  const body = message + '\n\n—\n' + [
    `Type : ${type || '?'}`,
    `Email : ${email || '(non donné)'}`,
    `Depuis : ${where}`,
    page ? `Page : ${page}` : '',
    parcours ? `Parcours : ${parcours}` : 'Parcours : (non joint)',
    `Navigateur : ${clean(req.headers.get('User-Agent'), 300)}`,
  ].filter(Boolean).join('\n');
  const replyTo = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : '';
  const raw = [
    `From: "PerfectRun" <${from}>`,
    `To: ${to}`,
    replyTo ? `Reply-To: ${replyTo}` : '',
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `Message-ID: <${crypto.randomUUID()}@perfectrun.fr>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(body).replace(/.{76}/g, '$&\r\n'),
  ].filter((l, i, a) => l !== '' || i === a.length - 2).join('\r\n');

  try { await env.MAIL.send(new EmailMessage(from, to, raw)); }
  catch (e) { console.error('signalement', e && e.message); return json(502, { ok: false, error: 'envoi impossible' }); }
  return json(200, { ok: true });
}

// ---------- liens courts (retour du 2/11 : liens trop longs dans WhatsApp) ----------
// POST /api/lien {p, n, v} → {id} ; le parcours est gardé dans KV (LIENS) sous un identifiant tiré de son contenu (même parcours = même lien).
// GET /r/<id> → petite page avec l'aperçu (titre du parcours, distance) pour WhatsApp, iMessage…, puis ouverture de l'app web.
// Sans KV (binding LIENS absent), l'app garde les liens longs.
const B62 = '0123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
async function lienId(txt) { const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt))); let id = ''; for (let i = 0; i < 7; i++) id += B62[h[i] % B62.length]; return id; }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function lienCree(req, env) {
  const json = reply(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: allowed(req) ? 204 : 403, headers: cors(req) });
  if (req.method !== 'POST') return json(405, { ok: false });
  if (!allowed(req)) return json(403, { ok: false });
  if (!env.LIENS) return json(503, { ok: false, error: 'liens courts non configurés' });
  if (env.LIEN_LIMIT) { const { success } = await env.LIEN_LIMIT.limit({ key: req.headers.get('CF-Connecting-IP') || 'inconnu' }); if (!success) return json(429, { ok: false }); }
  if ((req.headers.get('Content-Length') | 0) > 30000) return json(413, { ok: false });
  let d; try { d = await req.json(); } catch (e) { return json(400, { ok: false }); }
  const p = clean(d.p, 25000), n = clean(d.n, 120), v = /^[a-z]{2,20}$/.test(d.v || '') ? d.v : 'paris', km = Math.round((+d.km || 0) * 10) / 10;
  if (!p || !/^[\x3f-\x7e]+$/.test(p)) return json(400, { ok: false });
  const val = JSON.stringify({ p, n, v, km }), id = await lienId(val);
  if (!(await env.LIENS.get(id))) await env.LIENS.put(id, val);
  return json(200, { ok: true, id });
}
async function lienOuvre(req, env, id) {
  const raw = env.LIENS && /^[0-9a-zA-Z]{7}$/.test(id) ? await env.LIENS.get(id) : null;
  if (!raw) return Response.redirect(new URL('/app.html', req.url).toString(), 302);
  const d = JSON.parse(raw), to = '/app.html?p=' + encodeURIComponent(d.p) + '&n=' + encodeURIComponent(d.n || '') + (d.v !== 'paris' ? '&ville=' + d.v : '');
  const ville = { paris: 'Paris', lyon: 'Lyon', bordeaux: 'Bordeaux', nantes: 'Nantes', toulouse: 'Toulouse', dijon: 'Dijon', lille: 'Lille' }[d.v] || '';
  const title = (d.n || 'Un parcours de course') + (d.km ? ' · ' + d.km.toFixed(1).replace('.', ',') + ' km' : '');
  const desc = `Un parcours de course PerfectRun${ville ? ' à ' + ville : ''}. Ouvre-le pour le voir, l’exporter ou le suivre avec le guidage.`;
  const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · PerfectRun</title>
<meta name="description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:site_name" content="PerfectRun"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="https://perfectrun.fr/og.jpg"><meta name="twitter:card" content="summary_large_image"><meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${esc(to)}"><link rel="canonical" href="https://perfectrun.fr/"><body style="font-family:system-ui;padding:24px">Ouverture du parcours… <a href="${esc(to)}">Continuer</a></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/signalement') return signalement(req, env);
    if (url.pathname === '/api/lien') return lienCree(req, env);
    if (url.pathname.startsWith('/r/')) return lienOuvre(req, env, url.pathname.slice(3));
    if (url.pathname.startsWith('/api/')) return reply(req)(404, { ok: false });
    return env.ASSETS.fetch(req);
  },
};
