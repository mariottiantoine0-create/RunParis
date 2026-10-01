// RunParis routing engine — works in browser and node
const Engine = (() => {
  let M, G = {};
  const DEG = Math.PI / 180;

  function init(meta, buf) {
    M = meta;
    const o = meta.offs, nN = meta.nN, nE = meta.nE, nG = meta.nG;
    const ny = new Uint16Array(buf, o[0], nN), nx = new Uint16Array(buf, o[1], nN);
    const nz = new Uint16Array(buf, o[2], nN), nc = new Uint16Array(buf, o[3], nN);
    const nq = new Uint8Array(buf, o[4], nN);
    const ea = new Uint32Array(buf, o[5], nE), eb = new Uint32Array(buf, o[6], nE);
    const el = new Uint16Array(buf, o[7], nE), eu = new Uint16Array(buf, o[8], nE), ed = new Uint16Array(buf, o[9], nE);
    const ef = new Uint8Array(buf, o[10], nE), en = new Uint16Array(buf, o[11], nE);
    const ez = new Uint8Array(buf, o[12], nE * 4);
    const go = new Uint32Array(buf, o[13], nE + 1);
    const gy = new Uint16Array(buf, o[14], nG), gx = new Uint16Array(buf, o[15], nG);
    const CEM = o.length > 16 ? new Uint8Array(buf, o[16], nE) : new Uint8Array(nE);
    const [la0, la1, lo0, lo1] = meta.bbox;
    const latM = (la0 + la1) / 2, kx = Math.cos(latM * DEG) * 111320, ky = 110540;
    const qlat = v => la0 + v / 65535 * (la1 - la0), qlon = v => lo0 + v / 65535 * (lo1 - lo0);
    const NX = new Float32Array(nN), NY = new Float32Array(nN), NZ = new Float32Array(nN);
    for (let i = 0; i < nN; i++) { NX[i] = (qlon(nx[i]) - lo0) * kx; NY[i] = (la1 - qlat(ny[i])) * ky; NZ[i] = nz[i] / 10; }
    const GX = new Float32Array(nG), GY = new Float32Array(nG);
    for (let i = 0; i < nG; i++) { GX[i] = (qlon(gx[i]) - lo0) * kx; GY[i] = (la1 - qlat(gy[i])) * ky; }
    const LEN = new Float32Array(nE), C = new Uint8Array(nE), P = new Uint8Array(nE), S = new Uint8Array(nE);
    for (let e = 0; e < nE; e++) { LEN[e] = el[e] / 2; C[e] = ef[e] & 3; P[e] = (ef[e] >> 2) & 3; S[e] = ef[e] >> 4; }
    // CSR adjacency
    const deg = new Uint32Array(nN + 1);
    for (let e = 0; e < nE; e++) { deg[ea[e] + 1]++; deg[eb[e] + 1]++; }
    for (let i = 0; i < nN; i++) deg[i + 1] += deg[i];
    const adjE = new Uint32Array(2 * nE), fill = deg.slice(0, nN);
    for (let e = 0; e < nE; e++) { adjE[fill[ea[e]]++] = e; adjE[fill[eb[e]]++] = e; }
    // spatial grid (200 m)
    const CELL = 200; let maxX = 0, maxY = 0;
    for (let i = 0; i < nN; i++) { if (NX[i] > maxX) maxX = NX[i]; if (NY[i] > maxY) maxY = NY[i]; }
    const GW = Math.ceil(maxX / CELL) + 1, GH = Math.ceil(maxY / CELL) + 1;
    const cellCount = new Uint32Array(GW * GH + 1);
    const cellOf = i => Math.floor(NY[i] / CELL) * GW + Math.floor(NX[i] / CELL);
    for (let i = 0; i < nN; i++) cellCount[cellOf(i) + 1]++;
    for (let i = 0; i < GW * GH; i++) cellCount[i + 1] += cellCount[i];
    const cellNodes = new Uint32Array(nN), cf = cellCount.slice(0, GW * GH);
    for (let i = 0; i < nN; i++) cellNodes[cf[cellOf(i)]++] = i;
    // signal cluster centroids
    const sc = new Map();
    for (let i = 0; i < nN; i++) if (nc[i]) { const k = nc[i]; const a = sc.get(k) || [0, 0, 0]; a[0] += NX[i]; a[1] += NY[i]; a[2]++; sc.set(k, a); }
    const SIG = [...sc.entries()].map(([k, a]) => ({ id: k, x: a[0] / a[2], y: a[1] / a[2] }));
    G = { CEM, nN, nE, nG, ea, eb, eu, ed, en, ez, go, nc, nq, NX, NY, NZ, GX, GY, LEN, C, P, S, deg, adjE, CELL, GW, GH, cellCount, cellNodes, kx, ky, la1, lo0, SIG, maxX, maxY };
    G.bad = new Uint8Array(nE); G.blocked = new Uint8Array(nE); G.nodeOk = new Uint8Array(nN).fill(1);
    G.dist = new Float64Array(nN); G.stamp = new Uint32Array(nN); G.prev = new Int32Array(nN); G.done = new Uint32Array(nN); G.cur = 0;
    G.used = new Uint8Array(nE);
    return G;
  }

  const toXY = (lat, lon) => [(lon - G.lo0) * G.kx, (G.la1 - lat) * G.ky];
  const toLL = (x, y) => [G.la1 - y / G.ky, G.lo0 + x / G.kx];

  // ---------- constraints ----------
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  }
  function edgePts(e) {
    const pts = [[G.NX[G.ea[e]], G.NY[G.ea[e]]]];
    for (let k = G.go[e]; k < G.go[e + 1]; k++) pts.push([G.GX[k], G.GY[k]]);
    pts.push([G.NX[G.eb[e]], G.NY[G.eb[e]]]);
    return pts;
  }
  function setConstraints(exclQ, places, opts = {}) {
    const { nE, nN, blocked, nodeOk, ez, nq } = G;
    blocked.fill(0); nodeOk.fill(1);
    if (opts.avoidCemeteries) for (let e = 0; e < nE; e++) if (G.CEM[e]) blocked[e] = 1;
    for (let i = 0; i < nN; i++) if (exclQ.has(nq[i])) nodeOk[i] = 0;
    for (let e = 0; e < nE; e++) {
      for (let k = 0; k < 4; k++) { const z = ez[4 * e + k]; if (z && exclQ.has(z)) { blocked[e] = 1; break; } }
    }
    for (const pl of places) {
      const [px, py] = toXY(pl.lat, pl.lon), r = pl.r;
      for (let e = 0; e < nE; e++) {
        if (blocked[e]) continue;
        const a = G.ea[e], b = G.eb[e];
        const minx = Math.min(G.NX[a], G.NX[b]) - r - 400, maxx = Math.max(G.NX[a], G.NX[b]) + r + 400;
        if (px < minx || px > maxx) continue;
        const miny = Math.min(G.NY[a], G.NY[b]) - r - 400, maxy = Math.max(G.NY[a], G.NY[b]) + r + 400;
        if (py < miny || py > maxy) continue;
        const pts = edgePts(e);
        for (let i = 1; i < pts.length; i++) if (segDist(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) < r) { blocked[e] = 1; break; }
      }
      for (let i = 0; i < nN; i++) if (Math.hypot(G.NX[i] - px, G.NY[i] - py) < r) nodeOk[i] = 0;
    }
    // a node is usable only if it keeps an open edge
    for (let i = 0; i < nN; i++) if (nodeOk[i]) {
      let open = false; for (let k = G.deg[i]; k < G.deg[i + 1]; k++) if (!blocked[G.adjE[k]]) { open = true; break; }
      if (!open) nodeOk[i] = 0;
    }
    // drop small islands cut off by exclusions (e.g. a square whose exits are all in an avoided zone)
    const comp = new Int32Array(nN).fill(-1), stack = [];
    for (let i = 0; i < nN; i++) {
      if (!nodeOk[i] || comp[i] >= 0) continue;
      const members = [i]; comp[i] = i; stack.push(i);
      while (stack.length) {
        const u = stack.pop();
        for (let k = G.deg[u]; k < G.deg[u + 1]; k++) {
          const ed = G.adjE[k]; if (blocked[ed]) continue;
          const v = G.ea[ed] === u ? G.eb[ed] : G.ea[ed];
          if (comp[v] < 0) { comp[v] = i; stack.push(v); members.push(v); }
        }
      }
      if (members.length < 300) for (const v of members) nodeOk[v] = 0;
    }
  }

  function nearest(x, y, opts = {}) {
    const { CELL, GW, GH, cellCount, cellNodes, NX, NY, NZ, nodeOk } = G;
    x = Math.max(0, Math.min(G.maxX, x)); y = Math.max(0, Math.min(G.maxY, y));
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    let best = -1, bd = Infinity;
    const hill = opts.hillRadius || 0, greenR = !hill && G.GR ? (opts.greenRadius || 0) : 0;
    for (let r = 0; r < 60; r++) {
      for (let gy = cy - r; gy <= cy + r; gy++) for (let gx = cx - r; gx <= cx + r; gx++) {
        if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== r) continue;
        if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
        const c = gy * GW + gx;
        for (let k = cellCount[c]; k < cellCount[c + 1]; k++) {
          const i = cellNodes[k]; if (!nodeOk[i]) continue;
          const d = Math.hypot(NX[i] - x, NY[i] - y);
          if (hill) { if (d > hill) continue; const sc = -NZ[i] * 12 + d * 0.02; if (sc < bd) { bd = sc; best = i; } }
          else if (greenR) { if (d > greenR) continue; let g = 0; for (let k = G.deg[i]; k < G.deg[i + 1]; k++) g = Math.max(g, G.GR[G.adjE[k]]); const sc = -g * greenR + d * 0.5; if (sc < bd) { bd = sc; best = i; } }
          else if (d < bd) { bd = d; best = i; }
        }
      }
      if (!hill && !greenR && best >= 0 && bd < r * CELL) break;
      if ((hill || greenR) && r * CELL > (hill || greenR) + CELL) break;
    }
    if ((hill || greenR) && best < 0) return nearest(x, y);
    return best;
  }

  // ---------- A* ----------
  let W = { road: [0, 0.15, 0.35, 0.6], path: -0.1, steps: 0.6, climb: 0, sig: 150, reuse: 4, green: 0 };
  // green share per edge (0..1): parks + streets lined with trees (OSM natural=tree)
  function setGreen(u8) { G.GR = new Float32Array(G.nE); for (let e = 0; e < G.nE; e++) G.GR[e] = u8[e] / 255; }
  function setWeights(w) { W = Object.assign({}, W, w); }

  function stepCost(e, fromA) {
    if (G.blocked[e]) return Infinity;
    const L = G.LEN[e];
    let m = 1 + W.road[G.C[e]];
    const p = G.P[e]; if (p === 1) m += W.path; else if (p === 2) m += (W.climb < 0 ? -0.2 : W.steps);
    if (W.green && G.GR) m -= W.green * G.GR[e];
    let cost = L * m;
    const up = (fromA ? G.eu[e] : G.ed[e]) / 10;
    cost += W.climb * up;
    if (cost < 0.3 * L) cost = 0.3 * L;
    cost += G.S[e] * W.sig;
    const v = fromA ? G.eb[e] : G.ea[e];
    if (G.nc[v]) cost += W.sig;
    if (G.used[e]) cost *= W.reuse;
    return cost;
  }

  // binary heap
  let hN = new Uint32Array(1 << 16), hK = new Float64Array(1 << 16), hS = 0;
  function hpush(n, k) {
    if (hS >= hN.length) { const a = new Uint32Array(hN.length * 2); a.set(hN); hN = a; const b = new Float64Array(hK.length * 2); b.set(hK); hK = b; }
    let i = hS++; while (i > 0) { const p = (i - 1) >> 1; if (hK[p] <= k) break; hN[i] = hN[p]; hK[i] = hK[p]; i = p; } hN[i] = n; hK[i] = k;
  }
  function hpop() {
    const n = hN[0], last = --hS; const ln = hN[last], lk = hK[last]; let i = 0;
    while (true) { let c = 2 * i + 1; if (c >= hS) break; if (c + 1 < hS && hK[c + 1] < hK[c]) c++; if (hK[c] >= lk) break; hN[i] = hN[c]; hK[i] = hK[c]; i = c; }
    hN[i] = ln; hK[i] = lk; return n;
  }

  function astar(s, t) {
    const { dist, stamp, prev, done, NX, NY, deg, adjE, ea, eb } = G;
    const cur = ++G.cur; hS = 0;
    const hk = 0.3; // admissible lower bound factor
    const tx = NX[t], ty = NY[t];
    stamp[s] = cur; dist[s] = 0; prev[s] = -1; hpush(s, 0);
    while (hS) {
      const u = hpop();
      if (done[u] === cur) continue; done[u] = cur;
      if (u === t) break;
      const du = dist[u];
      for (let k = deg[u]; k < deg[u + 1]; k++) {
        const e = adjE[k]; const fromA = ea[e] === u; const v = fromA ? eb[e] : ea[e];
        if (done[v] === cur) continue;
        const c = stepCost(e, fromA); if (c === Infinity) continue;
        const nd = du + c;
        if (stamp[v] !== cur || nd < dist[v]) { stamp[v] = cur; dist[v] = nd; prev[v] = e; hpush(v, nd + hk * Math.hypot(NX[v] - tx, NY[v] - ty)); }
      }
    }
    if (done[t] !== cur) return null;
    const edges = []; let v = t;
    while (v !== s) { const e = prev[v]; const fromA = eb[e] === v; edges.push([e, fromA]); v = fromA ? ea[e] : eb[e]; }
    return edges.reverse();
  }

  function routeThrough(nodes) {
    G.used.fill(0);
    const all = [];
    for (let i = 1; i < nodes.length; i++) {
      if (nodes[i] === nodes[i - 1]) continue;
      const leg = astar(nodes[i - 1], nodes[i]);
      if (!leg) return null;
      for (const [e] of leg) G.used[e] = 1;
      all.push(...leg);
    }
    return all.length ? all : null;
  }

  function stats(edges, startNode) {
    let len = 0, up = 0, dn = 0, extraSig = 0;
    const clusters = new Set(), quart = new Map(), names = new Map(), seen = new Map();
    let v = startNode; const prof = [[0, G.NZ[v]]]; const nodes = [v];
    if (G.nc[v]) clusters.add(G.nc[v]);
    for (const [e, fromA] of edges) {
      const L = G.LEN[e]; len += L;
      up += (fromA ? G.eu[e] : G.ed[e]) / 10; dn += (fromA ? G.ed[e] : G.eu[e]) / 10;
      extraSig += G.S[e];
      v = fromA ? G.eb[e] : G.ea[e]; nodes.push(v);
      if (G.nc[v]) clusters.add(G.nc[v]);
      quart.set(G.nq[v], (quart.get(G.nq[v]) || 0) + L);
      if (G.en[e]) names.set(G.en[e] - 1, (names.get(G.en[e] - 1) || 0) + L);
      seen.set(e, (seen.get(e) || 0) + 1);
      prof.push([len, G.NZ[v]]);
    }
    let overlap = 0; for (const [e, n] of seen) if (n > 1) overlap += G.LEN[e] * (n - 1);
    up = smoothClimb(prof); dn = smoothClimb(prof.map(([d, z]) => [d, -z]));
    let cemLen = 0, gl = 0; for (const [e] of edges) { if (G.CEM[e]) cemLen += G.LEN[e]; if (G.GR) gl += G.GR[e] * G.LEN[e]; }
    return { green: len ? gl / len : 0, cemLen, len, up, dn, feux: clusters.size + extraSig, clusterIds: [...clusters], quart, names, prof, nodes, overlap: len ? overlap / len : 0, edges };
  }

  // D+ as a GPS watch would report it: 10 m resampling, 60 m moving average, 1 m hysteresis
  function smoothClimb(prof, win = 60, hyst = 1) {
    if (prof.length < 2) return 0;
    const L = prof[prof.length - 1][0], pts = []; let j = 0;
    for (let d = 0; d <= L; d += 10) {
      while (j < prof.length - 2 && prof[j + 1][0] < d) j++;
      const [d0, z0] = prof[j], [d1, z1] = prof[j + 1]; const t = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
      pts.push(z0 + Math.max(0, Math.min(1, t)) * (z1 - z0));
    }
    const h = Math.round(win / 20); let up = 0, ref = null;
    for (let i = 0; i < pts.length; i++) {
      let s = 0, n = 0; for (let k = Math.max(0, i - h); k <= Math.min(pts.length - 1, i + h); k++) { s += pts[k]; n++; }
      const z = s / n; if (ref === null) ref = z;
      if (z > ref + hyst) { up += z - ref; ref = z; } else if (z < ref - hyst) ref = z;
    }
    return up;
  }

  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function score(st, target, opt) {
    const de = Math.abs(st.len - target) / target;
    let s = de * 200 + (de > 0.05 ? 40 : 0);
    if (opt.dplus != null) s += Math.abs(st.up - opt.dplus) / Math.max(opt.dplus, 15) * 45;
    else if (opt.flat) s += st.up / 2;
    s += st.feux * (opt.sigScore || 0);
    s += st.overlap * (opt.allowRepeat ? 0 : 120);
    if (opt.green) s -= st.green * 90;
    if (opt.sights) s -= Math.min(st.sightsN || 0, 8) * 20;
    return s;
  }

  const tick = () => new Promise(r => setTimeout(r, 0));

  // ---------- alternatives: keep up to 3 good and clearly different routes ----------
  function edgeSet(st) { const m = new Map(); for (const [e] of st.edges) m.set(e, G.LEN[e]); return m; }
  function similarity(a, b) {
    const A = a._set || (a._set = edgeSet(a)), B = b._set || (b._set = edgeSet(b));
    let inter = 0, uni = 0; for (const [e, l] of A) { uni += l; if (B.has(e)) inter += l; } for (const [e, l] of B) if (!A.has(e)) uni += l;
    return uni ? inter / uni : 0;
  }
  function pickAlts(cands, target, max = 3) {
    if (!cands.length) return null;
    const ok = cands.filter(c => Math.abs(c.len - target) / target <= 0.05);
    const pool = (ok.length ? ok : cands).slice().sort((a, b) => a.score - b.score);
    const picked = [];
    for (const c of pool) { if (picked.length >= max) break; if (picked.every(p => similarity(p, c) < 0.5)) picked.push(c); }
    const best = picked[0]; best.alts = picked; return best;
  }

  function candidateLoop(start, target, opt, rng, theta, nW) {
    const sx = G.NX[start], sy = G.NY[start];
    const jit = Array.from({ length: nW }, () => [(rng() - 0.5) * 0.5, 0.85 + rng() * 0.3]);
    const n = nW + 1, perim = n * 2 * Math.sin(Math.PI / n);
    let R = target / (perim * 1.3), cb = null;
    for (let it = 0; it < 4; it++) {
      const cx = sx + R * Math.cos(theta), cy = sy + R * Math.sin(theta);
      const wps = [];
      for (let k = 1; k <= nW; k++) {
        const ang = theta + Math.PI + k * 2 * Math.PI / n + jit[k - 1][0], rr = R * jit[k - 1][1];
        wps.push(nearest(cx + rr * Math.cos(ang), cy + rr * Math.sin(ang), opt.hill ? { hillRadius: Math.min(450, R * 0.5) } : opt.green ? { greenRadius: Math.min(500, R * 0.5) } : {}));
      }
      const r = routeThrough([start, ...wps, start]); if (!r) break;
      const st = stats(r, start); st.kind = 'boucle';
      if (!cb || Math.abs(st.len - target) < Math.abs(cb.len - target)) cb = st;
      if (Math.abs(st.len / target - 1) < 0.025) break;
      R *= Math.pow(target / st.len, 0.95);
    }
    return cb;
  }
  // straight out to a point and back (only when repeating streets is allowed)
  function candidateOutBack(start, target, opt, theta) {
    const sx = G.NX[start], sy = G.NY[start];
    let D = target / 2 / 1.25, cb = null;
    for (let it = 0; it < 4; it++) {
      const w = nearest(sx + D * Math.cos(theta), sy + D * Math.sin(theta), opt.hill ? { hillRadius: 400 } : opt.green ? { greenRadius: 450 } : {});
      if (w < 0 || w === start) break;
      G.used.fill(0);
      const go = astar(start, w); if (!go) break;
      const back = go.slice().reverse().map(([e, fromA]) => [e, !fromA]);
      const st = stats(go.concat(back), start); st.kind = 'aller-retour';
      if (!cb || Math.abs(st.len - target) < Math.abs(cb.len - target)) cb = st;
      if (Math.abs(st.len / target - 1) < 0.025) break;
      D *= target / st.len;
    }
    return cb;
  }
  function hillTheta(sx, sy, R0, rng, theta) {
    let bz = -1e9, best = theta;
    for (let k = 0; k < 5; k++) {
      const th = k ? rng() * 2 * Math.PI : theta;
      let z = 0; for (const f of [1, 2]) { const n = nearest(sx + f * R0 * Math.cos(th), sy + f * R0 * Math.sin(th)); if (n >= 0) z += G.NZ[n]; }
      if (z > bz) { bz = z; best = th; }
    }
    return best;
  }

  async function loop(start, target, opt, onProgress) {
    const rng = mulberry(opt.seed || 1);
    const NC = opt.candidates || (opt.green ? 16 : 12), NB = opt.allowRepeat ? 4 : 0, cands = [];
    const sx = G.NX[start], sy = G.NY[start], off = rng() * 2 * Math.PI;
    for (let c = 0; c < NC + NB; c++) {
      let theta = off + (c % NC) * 2 * Math.PI / NC + (rng() - 0.5) * 0.4; // spread directions for variety
      let st;
      if (c < NC) {
        const nW = rng() < 0.55 ? 2 : 3;
        if (opt.hill) theta = hillTheta(sx, sy, target / ((nW + 1) * 2 * Math.sin(Math.PI / (nW + 1)) * 1.3), rng, theta);
        st = candidateLoop(start, target, opt, rng, theta, nW);
      } else {
        if (opt.hill) theta = hillTheta(sx, sy, target / 2.5, rng, theta);
        st = candidateOutBack(start, target, opt, theta);
      }
      if (st) { st.score = score(st, target, opt); cands.push(st); }
      if (onProgress) onProgress((c + 1) / (NC + NB));
      await tick();
    }
    return pickAlts(cands, target);
  }

  async function aToB(A, B, target, opt, onProgress) {
    const rng = mulberry(opt.seed || 1);
    G.used.fill(0);
    const base = routeThrough([A, B]);
    if (!base) return null;
    const bst = stats(base, A); bst.kind = 'a-b'; bst.score = score(bst, target || bst.len, opt);
    if (!target || target <= bst.len * 1.03) { bst.shortest = true; bst.alts = [bst]; return bst; }
    const ax = G.NX[A], ay = G.NY[A], bx = G.NX[B], by = G.NY[B];
    const d = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / d, uy = (by - ay) / d;
    const NC = opt.candidates || 10, cands = [];
    for (let c = 0; c < NC; c++) {
      const side = c % 2 ? 1 : -1, along = 0.25 + ((c >> 1) % 5) * 0.12 + (rng() - 0.5) * 0.08;
      let h = Math.sqrt(Math.max(0, (target / 2.6) ** 2 - (d / 2) ** 2)) + 50;
      let cb = null;
      for (let it = 0; it < 4; it++) {
        const mx = ax + (bx - ax) * along, my = ay + (by - ay) * along;
        const w = nearest(mx - uy * h * side, my + ux * h * side, opt.hill ? { hillRadius: 400 } : opt.green ? { greenRadius: 450 } : {});
        const r = routeThrough([A, w, B]); if (!r) break;
        const st = stats(r, A); st.kind = 'a-b';
        if (!cb || Math.abs(st.len - target) < Math.abs(cb.len - target)) cb = st;
        if (Math.abs(st.len / target - 1) < 0.025) break;
        h *= Math.pow(target / st.len, 1.3);
      }
      if (cb) { cb.score = score(cb, target, opt); cands.push(cb); }
      if (onProgress) onProgress((c + 1) / NC);
      await tick();
    }
    return pickAlts(cands, target) || (bst.alts = [bst], bst);
  }

  // A → free arrival: one-way routes of the requested length in different directions
  async function oneWay(A, target, opt, onProgress) {
    const rng = mulberry(opt.seed || 1);
    const NC = opt.candidates || (opt.endNodes ? 16 : 12), cands = [], endSet = opt.endNodes ? new Set(opt.endNodes.map(q => q.n)) : null;
    const ax = G.NX[A], ay = G.NY[A], off = rng() * 2 * Math.PI;
    for (let c = 0; c < NC; c++) {
      let theta = off + c * 2 * Math.PI / NC + (rng() - 0.5) * 0.3;
      if (opt.hill) theta = hillTheta(ax, ay, target / 2.6, rng, theta);
      let D = target / 1.3, cb = null;
      const legs = Math.max(1, Math.ceil(D / 6000)); // Paris is ~12 km wide: long one-ways zigzag through waypoints
      const turns = Array.from({ length: legs }, (_, k) => k ? (k % 2 ? 1 : -1) * (0.9 + rng() * 0.4) : 0);
      for (let it = 0; it < 4; it++) {
        const pts = [A]; let x = ax, y = ay, th = theta;
        for (let k = 0; k < legs; k++) {
          th += turns[k]; const step = D / legs;
          x = Math.max(300, Math.min(G.maxX - 300, x + step * Math.cos(th))); y = Math.max(300, Math.min(G.maxY - 300, y + step * Math.sin(th)));
          let n = nearest(x, y, opt.hill && k === legs - 1 ? { hillRadius: 400 } : {});
          if (k === legs - 1 && opt.endNodes && opt.endNodes.length) { // finish at a metro / RER station near the planned end
            let bd = 1e9, bn = -1; for (const q of opt.endNodes) { const dd = Math.hypot(q.x - x, q.y - y); if (dd < bd) { bd = dd; bn = q.n; } }
            if (bn >= 0 && bd < 1500) n = bn;
          }
          if (n >= 0 && n !== pts[pts.length - 1]) pts.push(n);
        }
        const w = pts[pts.length - 1];
        if (w < 0 || w === A) break;
        const r = routeThrough(pts); if (!r) break;
        const st = stats(r, A); st.kind = 'aller-simple'; st.end = w;
        if (!cb || Math.abs(st.len - target) < Math.abs(cb.len - target)) cb = st;
        if (Math.abs(st.len / target - 1) < 0.025) break;
        D *= target / st.len;
      }
      if (cb) { cb.score = score(cb, target, opt); if (endSet && !endSet.has(cb.end)) cb.score += 600; cands.push(cb); }
      if (onProgress) onProgress((c + 1) / NC);
      await tick();
    }
    if (endSet) { const at = cands.filter(c => endSet.has(c.end) && Math.abs(c.len - target) / target <= 0.05); if (at.length >= 2) return pickAlts(at, target); }
    return pickAlts(cands, target);
  }


  // ---------- through places (via points) ----------
  function orderVias(start, vias, end) {
    // brute-force order (<= 6 vias) on straight-line distance
    if (vias.length < 2) return vias.slice();
    const d = (a, b) => Math.hypot(G.NX[a] - G.NX[b], G.NY[a] - G.NY[b]);
    let best = null, bl = Infinity;
    const perm = (arr, l) => { if (l === arr.length) { let L = 0, p = start; for (const v of arr) { L += d(p, v); p = v; } if (end != null) L += d(p, end); if (L < bl) { bl = L; best = arr.slice(); } return; }
      for (let i = l; i < arr.length; i++) { [arr[l], arr[i]] = [arr[i], arr[l]]; perm(arr, l + 1); [arr[l], arr[i]] = [arr[i], arr[l]]; } };
    perm(vias.slice(), 0); return best;
  }
  // pts: ordered nodes; end: node or 'free'. Adds one detour point to reach the target length.
  async function through(pts, end, target, opt, onProgress) {
    const rng = mulberry(opt.seed || 1);
    const free = end === 'free', full = free ? pts.slice() : pts.concat([end]);
    const base = routeThrough(full); if (!base) return null;
    const bst = stats(base, pts[0]); bst.kind = free ? 'aller-simple' : end === pts[0] ? 'boucle' : 'a-b'; bst.score = score(bst, target, opt);
    if (bst.len >= target * 0.97) { bst.shortest = bst.len > target * 1.03; bst.alts = [bst]; return bst; }
    const NC = opt.candidates || 10, cands = [bst];
    for (let c = 0; c < NC; c++) {
      let cb = null;
      if (free) {
        // extend beyond the last place
        const last = pts[pts.length - 1], prev = pts.length > 1 ? pts[pts.length - 2] : last;
        let th = Math.atan2(G.NY[last] - G.NY[prev], G.NX[last] - G.NX[prev]); if (pts.length < 2) th = 0;
        th += (c - NC / 2) * 0.45 + (rng() - 0.5) * 0.2;
        let D = (target - bst.len) / 1.3;
        for (let it = 0; it < 4; it++) {
          const w = nearest(G.NX[last] + D * Math.cos(th), G.NY[last] + D * Math.sin(th)); if (w < 0 || w === last) break;
          const r = routeThrough(pts.concat([w])); if (!r) break;
          const st = stats(r, pts[0]); st.kind = 'aller-simple'; st.end = w;
          if (!cb || Math.abs(st.len - target) < Math.abs(cb.len - target)) cb = st;
          if (Math.abs(st.len / target - 1) < 0.025) break; D *= Math.pow(target / st.len, 1.2);
        }
      } else {
        // detour on one leg of the chain, alternating legs and sides
        const legs = full.length - 1, i = c % legs, side = (c >> 0) % 2 ? 1 : -1;
        const a = full[i], b = full[i + 1];
        const ax = G.NX[a], ay = G.NY[a], bx = G.NX[b], by = G.NY[b];
        const d = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / d, uy = (by - ay) / d;
        const along = 0.3 + rng() * 0.4;
        let h = Math.max(150, (target - bst.len) / 2.4);
        for (let it = 0; it < 4; it++) {
          const mx = ax + (bx - ax) * along, my = ay + (by - ay) * along;
          const px = d > 1 ? mx - uy * h * side : ax + h * Math.cos(c), py = d > 1 ? my + ux * h * side : ay + h * Math.sin(c);
          const w = nearest(px, py, opt.hill ? { hillRadius: 400 } : opt.green ? { greenRadius: 450 } : {});
          const seq = full.slice(0, i + 1).concat([w], full.slice(i + 1));
          const r = routeThrough(seq); if (!r) break;
          const st = stats(r, pts[0]); st.kind = bst.kind;
          if (!cb || Math.abs(st.len - target) < Math.abs(cb.len - target)) cb = st;
          if (Math.abs(st.len / target - 1) < 0.025) break; h *= Math.pow(target / st.len, 1.3);
        }
      }
      if (cb) { cb.score = score(cb, target, opt); cands.push(cb); }
      if (onProgress) onProgress((c + 1) / NC);
      await tick();
    }
    return pickAlts(cands, target);
  }
  async function viaRoute(A, vias, end, target, opt, onProgress) {
    const ord = orderVias(A, vias, end === 'free' ? null : end);
    return through([A, ...ord], end, target, opt, onProgress);
  }
  // ---------- discovery: pass by famous places ----------
  function sightsOn(st, sights, R = 70) {
    const hit = [];
    const v0 = st.nodes[0];
    for (const s of sights) { if (s._n == null || Math.hypot(G.NX[v0] - s.x, G.NY[v0] - s.y) < 250) continue; for (const v of st.nodes) if (Math.hypot(G.NX[v] - s.x, G.NY[v] - s.y) < R) { hit.push(s.name); break; } }
    st.sights = hit; st.sightsN = hit.length; return st;
  }
  async function discover(A, end, target, sights, opt, onProgress) {
    for (const s of sights) { if (s.x == null) { const [x, y] = toXY(s.lat, s.lon); s.x = x; s.y = y; } s._n = nearest(s.x, s.y); if (s._n >= 0 && Math.hypot(G.NX[s._n] - s.x, G.NY[s._n] - s.y) > 250) s._n = null; }
    const ok = sights.filter(s => s._n != null && s._n >= 0);
    const rng = mulberry(opt.seed || 1), NC = 8, cands = [];
    const ax = G.NX[A], ay = G.NY[A], off = rng() * 2 * Math.PI;
    const o2 = Object.assign({}, opt, { candidates: 4, sights: true });
    for (let c = 0; c < NC; c++) {
      const th = off + c * 2 * Math.PI / NC + (rng() - 0.5) * 0.3;
      let pick = [];
      if (end === 'free' || end === A) {
        const loop = end === A, R = loop ? target / (2 * Math.PI) * 0.95 : target / 1.35;
        const cx = loop ? ax + R * Math.cos(th) : ax, cy = loop ? ay + R * Math.sin(th) : ay;
        const cand = ok.map(s => { const dd = Math.hypot(s.x - cx, s.y - cy); const ang = Math.atan2(s.y - cy, s.x - cx);
          const fit = loop ? Math.abs(dd - R) / R : (dd > R * 1.05 ? 9 : Math.abs(((ang - th + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) > 0.9 ? 9 : 0);
          return { s, fit, ang, dd }; }).filter(o => o.fit < (loop ? 0.45 : 1)).sort((a, b) => a.fit - b.fit || b.s.w - a.s.w);
        for (const o of cand) { if (pick.length >= 4) break; if (pick.every(p => Math.hypot(p.s.x - o.s.x, p.s.y - o.s.y) > Math.max(400, target / 12))) pick.push(o); }
        pick = pick.map(o => o.s._n);
      } else {
        const bx = G.NX[end], by = G.NY[end], d = Math.hypot(bx - ax, by - ay) || 1, slack = Math.max(300, (target - d * 1.25) / 2.2);
        const cand = ok.map(s => { const t = ((s.x - ax) * (bx - ax) + (s.y - ay) * (by - ay)) / (d * d); const off2 = Math.abs((s.x - ax) * (by - ay) - (s.y - ay) * (bx - ax)) / d; return { s, t, off2 }; })
          .filter(o => o.t > 0.05 && o.t < 0.95 && o.off2 < slack * (0.6 + 0.8 * rng())).sort((a, b) => b.s.w - a.s.w);
        for (const o of cand) { if (pick.length >= 4) break; if (pick.every(p => Math.hypot(p.s.x - o.s.x, p.s.y - o.s.y) > 400)) pick.push(o); }
        pick = pick.sort((a, b) => a.t - b.t).map(o => o.s._n);
      }
      if (!pick.length) { if (onProgress) onProgress((c + 1) / NC); continue; }
      let r = await viaRoute(A, pick, end, target, o2);
      // too long: drop the farthest place until it fits
      while (r && r.len > target * 1.05 && pick.length > 1) { pick.pop(); r = await viaRoute(A, pick, end, target, o2); }
      if (r) for (const a of (r.alts || [r])) { sightsOn(a, ok); a.score = score(a, target, Object.assign({}, opt, { sights: true })); cands.push(a); }
      if (onProgress) onProgress((c + 1) / NC);
      await tick();
    }
    const best = pickAlts(cands, target);
    if (best) for (const a of best.alts) sightsOn(a, ok);
    return best;
  }
  function statsOf(edges, start) { return stats(edges, start); }

  return { init, setConstraints, nearest, setWeights, setGreen, loop, aToB, oneWay, viaRoute, discover, sightsOn, statsOf, routeThrough, smoothClimb, similarity, toXY, toLL, edgePts, get G() { return G; }, get M() { return M; } };
})();
if (typeof module !== 'undefined') module.exports = Engine;
