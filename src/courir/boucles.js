// Pages « Courir à <ville> » (SEO, 3/11) : calcule les 3 boucles de chaque ville et leur carte.
// À relancer seulement si les départs (departs.json) ou les données d'une ville changent :
//   node src/courir/boucles.js   (depuis la racine) → écrit src/courir/boucles.json, lu par build.py
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..'), E = require(path.join(ROOT, 'src/engine.js'));
const DEP = JSON.parse(fs.readFileSync(path.join(__dirname, 'departs.json'), 'utf8'));
const DIRS = { paris: '' }; const b64 = s => Uint8Array.from(Buffer.from(s, 'base64'));
const W = 640, H = 400;
function simplify(P, tol) { if (P.length < 3) return P.slice(); const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1; const st = [[0, P.length - 1]];
  while (st.length) { const [a, b] = st.pop(); const [ax, ay] = P[a], [bx, by] = P[b], vx = bx - ax, vy = by - ay, l = Math.hypot(vx, vy) || 1e-9; let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = l < 1 ? Math.hypot(P[i][0] - ax, P[i][1] - ay) : Math.abs((P[i][0] - ax) * vy - (P[i][1] - ay) * vx) / l; if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return P.filter((_, i) => keep[i]); }
function enc(ll) { let s = '', pa = 0, po = 0; const e = v => { v = v < 0 ? ~(v << 1) : v << 1; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } s += String.fromCharCode(v + 63); };
  for (const [la, lo] of ll) { const a = Math.round(la * 1e5), o = Math.round(lo * 1e5); e(a - pa); e(o - po); pa = a; po = o; } return s; }
function mapSvg(G, meta, xy) {
  let x0 = Math.min(...xy.map(p => p[0])), x1 = Math.max(...xy.map(p => p[0])), y0 = Math.min(...xy.map(p => p[1])), y1 = Math.max(...xy.map(p => p[1]));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; let w = (x1 - x0) * 1.18, h = (y1 - y0) * 1.18; if (w / h > W / H) h = w * H / W; else w = h * W / H;
  x0 = cx - w / 2; y0 = cy - h / 2; x1 = cx + w / 2; y1 = cy + h / 2; const k = W / w;
  const P = ([x, y]) => ((x - x0) * k).toFixed(0) + ' ' + ((y - y0) * k).toFixed(0), inb = (x, y, m = 50) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;
  const poly = arr => { let d = ''; for (const ring of arr || []) for (const part of (Array.isArray(ring[0][0]) ? ring : [ring])) { const pts = part.map(([la, lo]) => E.toXY(la, lo)); if (pts.some(([x, y]) => inb(x, y, 300))) d += 'M' + pts.map(P).join('L') + 'Z'; } return d; };
  let maj = '', min = '';
  for (let e = 0; e < G.nE; e++) { const a = G.ea[e], c = G.eb[e]; if (!inb(G.NX[a], G.NY[a]) && !inb(G.NX[c], G.NY[c])) continue; const s = 'M' + E.edgePts(e).map(P).join('L'); if (G.C[e] >= 2) maj += s; else if (G.C[e] === 1 || (k > 0.25 && G.P[e] === 0)) min += s; }
  const route = 'M' + simplify(xy, 3).map(P).join('L'), [sx, sy] = P(xy[0]).split(' ');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path class="m-green" d="${poly(meta.layers.green)}"/><path class="m-water" d="${poly(meta.layers.water)}"/><path class="m-minor" d="${min}"/><path class="m-major" d="${maj}"/><path class="m-route-case" d="${route}"/><path class="m-route" d="${route}"/><circle class="m-start" cx="${sx}" cy="${sy}" r="15"/><text class="m-start-t" x="${sx}" y="${sy}" font-size="17">D</text></svg>`;
}
(async () => {
  const out = {};
  for (const [id, c] of Object.entries(DEP)) {
    const D = path.join(ROOT, 'site', id in DIRS ? DIRS[id] : id + '/'), rd = f => fs.readFileSync(path.join(D, f), 'utf8');
    const meta = JSON.parse(rd('meta.json')), b = fs.readFileSync(path.join(D, 'graph.bin')); E.init(meta, b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); const G = E.G;
    E.setGreen(b64(rd('green.txt'))); E.setDark(b64(rd('dark.txt'))); E.setCrowd(b64(rd('crowd.txt')));
    const pv = b64(rd('private.txt')), ex = b64(rd('excl.txt')); for (let i = 0; i < pv.length; i++) pv[i] |= ex[i]; E.setPrivate(pv);
    E.setConstraints(new Set(), [], { avoidCemeteries: true, closedEdges: [] });
    // mêmes poids que le type « Au vert » de l'app, réglage « équilibré »
    E.setWeights({ climb: 0, sig: 250, turn: 150, turnRun: 100, turnFar: 0.3, path: -0.3, reuse: 4, green: 0.7, road: [0, 0.3, 0.6, 0.9], dark: 0, crowd: 0 });
    out[id] = [];
    for (const d of c.boucles) {
      const L = d.km * 1000, s = E.nearest(...E.toXY(d.lat, d.lon)); let best = null;
      for (const seed of d.seed ? [d.seed] : [7, 8, 9, 10]) { // graine fixe : la même boucle à chaque calcul
        const r = await E.loop(s, L, { seed: seed * 7919 + 13, sigScore: 0.5, green: true }, () => {}); if (!r) continue; const a = (r.alts || [r])[0], st = E.statsOf(a.edges, s);
        const sc = st.green - Math.abs(st.len - L) / L * 2 - st.overlap / st.len; if (!best || sc > best.sc) best = { sc, a, st, seed };
      }
      const pts = []; let first = true; for (const [e, fA] of best.a.edges) { const p = E.edgePts(e); if (!fA) p.reverse(); p.forEach((q, i) => { if (first || i) pts.push(q); first = false; }); }
      const ll = simplify(pts, 4).map(([x, y]) => E.toLL(x, y));
      out[id].push({ label: d.label, km: d.km, seed: best.seed, len: Math.round(best.st.len), up: Math.round(best.st.up), feux: best.st.feux, green: Math.round(best.st.green * 100),
        p: enc(ll), gpx: ll.map(([a, o]) => [+a.toFixed(6), +o.toFixed(6)]), svg: mapSvg(G, meta, pts) });
      console.log(id, d.label, best.st.len | 0, 'm');
    }
  }
  fs.writeFileSync(path.join(__dirname, 'boucles.json'), JSON.stringify(out));
})();
