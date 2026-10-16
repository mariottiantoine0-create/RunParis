// Perfect Run · Worker Cloudflare
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
  const subject = `Perfect Run · ${type || 'Message'} (${where})`;
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
    `From: "Perfect Run" <${from}>`,
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

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/signalement') return signalement(req, env);
    if (url.pathname.startsWith('/api/')) return reply(req)(404, { ok: false });
    return env.ASSETS.fetch(req);
  },
};
