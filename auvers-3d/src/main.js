import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
const stepEl = document.getElementById('step');
const tick = (msg) => new Promise(r => { stepEl.textContent = msg; setTimeout(r, 16); });

/* ------------------------------------------------------------------ outils */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = mulberry32(1890);
const rr = (a, b) => a + (b - a) * R();
const pick = (a) => a[Math.floor(R() * a.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (e0, e1, x) => { let t = (x - e0) / (e1 - e0); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
function hash2(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y, p = 0) {
  const xi = Math.floor(x), yi = Math.floor(y); const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  let x0 = xi, y0 = yi, x1 = xi + 1, y1 = yi + 1;
  if (p) { x0 = ((x0 % p) + p) % p; x1 = ((x1 % p) + p) % p; y0 = ((y0 % p) + p) % p; y1 = ((y1 % p) + p) % p; }
  const a = hash2(x0, y0), b = hash2(x1, y0), c = hash2(x0, y1), d = hash2(x1, y1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o = 4, p = 0) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f, p ? p * f : 0); n += a; f *= 2; a *= 0.5; } return s / n; }

/* ------------------------------------------------------------------ rendu */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const small = Math.min(innerWidth, innerHeight) < 700;
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.62;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('scene').appendChild(renderer.domElement);
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 14000);
camera.position.set(330, 150, 320);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 4;
controls.maxDistance = 1100;
controls.target.set(-90, 10, -70);

/* ------------------------------------------------------------------ textures procédurales */
function mkCanvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, srgb = true) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAX_ANISO; return t; }
function grain(c, amt, P = 8, oct = 4, speck = 0.35) {
  const ctx = c.getContext('2d'); const w = c.width, h = c.height;
  const im = ctx.getImageData(0, 0, w, h), d = im.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = fbm(x / w * P, y / h * P, oct, P);
    const k = 1 + (n - 0.5) * amt + (Math.random() - 0.5) * amt * speck;
    const i = (y * w + x) * 4; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
  }
  ctx.putImageData(im, 0, 0);
}
function rrect(ctx, x, y, w, h, r) { if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); } else ctx.fillRect(x, y, w, h); }
function pixels(w, h, fn, srgb = true) {
  const c = mkCanvas(w, h); const ctx = c.getContext('2d'); const im = ctx.createImageData(w, h); const d = im.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const col = fn(x, y); const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; }
  ctx.putImageData(im, 0, 0); return c;
}

function plasterCanvas() {
  const S = 512;
  const c = pixels(S, S, (x, y) => {
    const n = fbm(x / S * 6, y / S * 6, 5, 6), m = fbm(x / S * 40, y / S * 40, 2, 40);
    const v = 214 + (n - 0.5) * 52 + (m - 0.5) * 16;
    return [v, v * 0.985, v * 0.955];
  });
  // quelques moellons apparents sous l'enduit
  const ctx = c.getContext('2d');
  for (let k = 0; k < 7; k++) {
    const cx = R() * S, cy = R() * S;
    for (let j = 0; j < 9; j++) {
      ctx.fillStyle = `hsla(${rr(32, 42)},${rr(10, 20)}%,${rr(52, 66)}%,0.55)`;
      const x = cx + rr(-30, 30), y = cy + rr(-18, 18);
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) rrect(ctx, x + ox, y + oy, rr(14, 30), rr(9, 16), 4);
    }
  }
  return c;
}
function rubbleCanvas() {
  const S = 512, c = mkCanvas(S), ctx = c.getContext('2d');
  ctx.fillStyle = '#7f7666'; ctx.fillRect(0, 0, S, S);
  let y = 0;
  while (y < S) {
    let rh = Math.min(S - y, rr(22, 44)); if (S - y - rh < 18) rh = S - y;
    let x = -R() * 60;
    while (x < S) {
      const sw = rr(30, 86);
      ctx.fillStyle = `hsl(${rr(30, 44)},${rr(9, 22)}%,${rr(50, 72)}%)`;
      const jx = rr(-2, 2), jy = rr(-2, 2);
      for (const ox of [-S, 0, S]) rrect(ctx, x + ox + 2.5 + jx, y + 2.5 + jy, sw - 5, rh - 5, rr(4, 10));
      x += sw;
    }
    y += rh;
  }
  grain(c, 0.35, 16, 3, 0.5);
  return c;
}
function ashlarCanvas() {
  const S = 512, c = mkCanvas(S), ctx = c.getContext('2d');
  ctx.fillStyle = '#b9ae9a'; ctx.fillRect(0, 0, S, S);
  const rows = 11, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = -R() * 150;
    while (x < S) {
      const bw = rr(78, 150);
      ctx.fillStyle = `hsl(${rr(36, 44)},${rr(10, 20)}%,${rr(73, 84)}%)`;
      for (const ox of [-S, 0, S]) ctx.fillRect(x + ox + 1.2, r * rh + 1.2, bw - 2.4, rh - 2.4);
      x += bw;
    }
  }
  grain(c, 0.28, 8, 4, 0.4);
  return c;
}
function tileCanvas() {
  const S = 512, c = mkCanvas(S), ctx = c.getContext('2d');
  ctx.fillStyle = '#3a2219'; ctx.fillRect(0, 0, S, S);
  const rows = 20, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * 21;
    for (let x = -off; x < S; x += 42) {
      const burnt = R() < 0.12;
      ctx.fillStyle = burnt ? `hsl(${rr(10, 18)},${rr(30, 45)}%,${rr(20, 27)}%)` : `hsl(${rr(12, 24)},${rr(40, 58)}%,${rr(30, 45)}%)`;
      for (const ox of [0, S]) {
        ctx.fillRect(x + ox + 1, r * rh, 40, rh - 1);
        ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(x + ox + 1, r * rh + rh - 4, 40, 3);
        ctx.fillStyle = burnt ? `hsl(14,38%,24%)` : `hsl(${rr(12, 24)},${rr(40, 58)}%,${rr(30, 45)}%)`;
      }
    }
  }
  // lichens
  for (let k = 0; k < 160; k++) { ctx.fillStyle = `hsla(${rr(55, 75)},${rr(15, 30)}%,${rr(48, 62)}%,${rr(0.25, 0.55)})`; ctx.beginPath(); ctx.arc(R() * S, R() * S, rr(1.5, 5), 0, Math.PI * 2); ctx.fill(); }
  grain(c, 0.3, 8, 3, 0.3);
  return c;
}
function slateCanvas() {
  const S = 512, c = mkCanvas(S), ctx = c.getContext('2d');
  ctx.fillStyle = '#1b1f24'; ctx.fillRect(0, 0, S, S);
  const rows = 18, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * 32;
    for (let x = -off; x < S; x += 64) {
      const col = `hsl(${rr(205, 222)},${rr(6, 13)}%,${rr(26, 37)}%)`;
      for (const ox of [0, S]) {
        ctx.fillStyle = col; ctx.fillRect(x + ox + 1, r * rh, 62, rh - 1);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + ox + 1, r * rh + rh - 3, 62, 2);
      }
    }
  }
  grain(c, 0.22, 8, 3, 0.3);
  return c;
}
function hedgeCanvas() {
  const S = 256;
  return pixels(S, S, (x, y) => {
    const n = fbm(x / S * 24, y / S * 24, 3, 24), m = Math.random();
    const k = 0.55 + n * 0.8 + (m - 0.5) * 0.25;
    return [52 * k, 74 * k, 36 * k];
  });
}
function detailCanvas() {
  const S = 256;
  return pixels(S, S, (x, y) => {
    const v = 0.5 + (fbm(x / S * 12, y / S * 12, 4, 12) - 0.5) * 0.45 + (Math.random() - 0.5) * 0.14;
    const g = v * 255; return [g, g, g];
  }, false);
}
function roadCanvas(kind) {
  const W = 256, H = 1024;
  const c = pixels(W, H, (x, y) => {
    const n = fbm(x / W * 4, y / H * 16, 4, 4), m = fbm(x / W * 32, y / H * 128, 2, 32);
    let v = 104 + (n - 0.5) * 26 + (m - 0.5) * 14;
    if (kind === 'rail') { const g = 96 + (m - 0.5) * 60 + (Math.random() - 0.5) * 40; return [g * 1.02, g * 0.95, g * 0.86]; }
    return [v, v * 0.99, v * 0.96];
  });
  const ctx = c.getContext('2d');
  if (kind === 'rail') {
    for (let y = 0; y < H; y += H / 10) { ctx.fillStyle = `hsl(25,${rr(18, 28)}%,${rr(20, 27)}%)`; ctx.fillRect(W * 0.14, y + 6, W * 0.72, 30); }
    return c;
  }
  // caniveaux pavés
  const gw = kind === 'main' ? 16 : 22;
  for (const side of [0, W - gw]) {
    for (let y = 0; y < H; y += 11) for (let x = side; x < side + gw; x += 11) {
      ctx.fillStyle = `hsl(${rr(30, 40)},${rr(5, 12)}%,${rr(46, 60)}%)`;
      ctx.fillRect(x + 1, y + 1, 9.5, 9.5);
    }
  }
  if (kind === 'main') { ctx.fillStyle = 'rgba(235,232,222,0.85)'; ctx.fillRect(W / 2 - 3, 60, 6, 110); }
  // rapiéçages
  for (let k = 0; k < 6; k++) { ctx.fillStyle = `rgba(40,40,40,${rr(0.12, 0.25)})`; ctx.fillRect(rr(30, W - 90), rr(0, H - 80), rr(30, 70), rr(30, 80)); }
  return c;
}
function waterNormalCanvas() {
  const S = 256, P = 8;
  const hgt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) hgt[y * S + x] = fbm(x / S * P, y / S * P, 4, P) + 0.3 * fbm(x / S * P * 4, y / S * P * 2, 2, P * 2);
  return pixels(S, S, (x, y) => {
    const hx = hgt[y * S + (x + 1) % S] - hgt[y * S + (x + S - 1) % S];
    const hy = hgt[((y + 1) % S) * S + x] - hgt[((y + S - 1) % S) * S + x];
    const nx = -hx * 6, ny = -hy * 6, nz = 1; const l = Math.hypot(nx, ny, nz);
    return [(nx / l * 0.5 + 0.5) * 255, (ny / l * 0.5 + 0.5) * 255, (nz / l * 0.5 + 0.5) * 255];
  }, false);
}
function textCanvas(w, h, draw) { const c = mkCanvas(w, h); draw(c.getContext('2d'), w, h); return c; }

/* ------------------------------------------------------------------ terrain */
function H0(x, z) {
  let h = 38 * sstep(20, -240, z);
  h += (fbm(x * 0.005 + 11, z * 0.005 + 7, 4) - 0.5) * 9 * sstep(40, -40, z);
  h += (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 0.8;
  h -= 4.2 * sstep(116, 130, z) * sstep(194, 180, z);   // lit de l'Oise
  h += 5 * sstep(215, 520, z);                          // rive de Méry
  return h;
}
const H_EGLISE = H0(-15, -40);
const H_GACHET = H0(590, -34);
const ZONES = [
  { x0: -47, x1: 17, z0: -60, z1: -22.5, h: H_EGLISE, fx: 8, fzN: 8, fzS: 0.01 },
  { x0: -72, x1: -8, z0: -266, z1: -214, h: H0(-40, -240), fx: 6, fzN: 6, fzS: 6 },
  { x0: -322, x1: -238, z0: -50, z1: -27.5, h: 5.5, fx: 6, fzN: 0.01, fzS: 0.01 },
  { x0: -322, x1: -238, z0: -75, z1: -50, h: 10, fx: 6, fzN: 0.01, fzS: 0.01 },
  { x0: -322, x1: -238, z0: -100, z1: -75, h: 15.5, fx: 6, fzN: 0.01, fzS: 0.01 },
  { x0: -335, x1: -225, z0: -150, z1: -100, h: 21, fx: 10, fzN: 10, fzS: 0.01 },
  { x0: 576, x1: 604, z0: -50, z1: -40, h: H_GACHET + 1.6, fx: 5, fzN: 0.01, fzS: 0.01 },
  { x0: 574, x1: 606, z0: -66, z1: -50, h: H_GACHET + 3.2, fx: 5, fzN: 0.01, fzS: 0.01 },
];
function Hz(x, z) {
  let h = H0(x, z);
  for (const Z of ZONES) {
    const w = sstep(Z.x0 - Z.fx, Z.x0, x) * sstep(Z.x1 + Z.fx, Z.x1, x) * sstep(Z.z0 - Z.fzN, Z.z0, z) * sstep(Z.z1 + Z.fzS, Z.z1, z);
    if (w > 0) h = lerp(h, Z.h, w);
  }
  return h;
}

/* ------------------------------------------------------------------ rues */
const ROADS = [
  { id: 'gaulle', hw: 4.2, sw: 1.8, tex: 'main', lift: 0.2, houses: 'dense', pts: [[-645, 60], [-450, 52], [-250, 44], [-80, 40], [60, 36], [250, 30], [450, 34], [645, 42]] },
  { id: 'vh', hw: 3.1, sw: 1.3, tex: 'lane', lift: 0.23, houses: 'dense', pts: [[149, -8], [200, -12], [260, -6], [330, -14], [400, -18], [430, -20], [470, -23], [530, -26], [596, -30]] },
  { id: 'zundert', hw: 3, sw: 1.2, tex: 'lane', lift: 0.22, houses: 'some', pts: [[140, 33.4], [146, 0], [152, -35], [162, -75], [168, -120]] },
  { id: 'chemin', hw: 2.2, tex: 'lane', lift: 0.24, houses: 'none', pts: [[25, -60], [70, -40], [110, -20], [146, -8]] },
  { id: 'montee', hw: 3.2, tex: 'lane', lift: 0.23, houses: 'dense', pts: [[55, 36.5], [58, 15], [52, -8], [38, -32], [22, -62], [4, -92], [-12, -125], [-18, -170], [-4, -221]] },
  { id: 'lery', hw: 2.8, tex: 'lane', lift: 0.23, houses: 'some', pts: [[-195, 44.5], [-208, 15], [-212, -20], [-214, -60], [-218, -110], [-236, -138]] },
  { id: 'ouest', hw: 2.8, tex: 'lane', lift: 0.23, houses: 'some', pts: [[-430, 50.5], [-425, 0], [-400, -70], [-385, -150], [-370, -240]] },
  { id: 'quai', hw: 3, tex: 'lane', lift: 0.2, houses: 'none', pts: [[-645, 109], [-200, 106], [200, 105], [645, 110]] },
  { id: 'rail', hw: 2.6, tex: 'rail', lift: 0.25, houses: 'none', pts: [[-645, 88], [645, 86]] },
];
const road = (id) => ROADS.find(r => r.id === id);
function prepRoads() {
  for (const r of ROADS) {
    const curve = new THREE.CatmullRomCurve3(r.pts.map(p => new V3(p[0], 0, p[1])), false, 'centripetal');
    const len = curve.getLength(); const n = Math.max(2, Math.ceil(len / 3));
    const P = curve.getSpacedPoints(n);
    r.len = len; r.step = len / n;
    r.S = P.map((p, i) => ({ x: p.x, z: p.z, s: i * r.step, h: Hz(p.x, p.z) }));
    for (let pass = 0; pass < 4; pass++) {
      const hs = r.S.map(p => p.h);
      for (let i = 0; i < hs.length; i++) { let s = 0, c = 0; for (let k = -3; k <= 3; k++) { const j = i + k; if (j >= 0 && j < hs.length) { s += hs[j]; c++; } } r.S[i].h = s / c; }
    }
    r.texLen = r.tex === 'rail' ? 6 : 28;
  }
}
const RG = new Map(), CELL = 16;
const rgKey = (cx, cz) => (cx + 1000) * 4000 + (cz + 1000);
function buildRoadGrid() {
  ROADS.forEach((r, ri) => {
    for (let i = 0; i < r.S.length - 1; i++) {
      const a = r.S[i], b = r.S[i + 1], m = r.hw + 14;
      const cx0 = Math.floor((Math.min(a.x, b.x) - m) / CELL), cx1 = Math.floor((Math.max(a.x, b.x) + m) / CELL);
      const cz0 = Math.floor((Math.min(a.z, b.z) - m) / CELL), cz1 = Math.floor((Math.max(a.z, b.z) + m) / CELL);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) { const k = rgKey(cx, cz); let l = RG.get(k); if (!l) RG.set(k, l = []); l.push(ri, i); }
    }
  });
}
function roadQuery(x, z) {
  const l = RG.get(rgKey(Math.floor(x / CELL), Math.floor(z / CELL)));
  let bd = 1e9, bh = 0, bri = -1;
  if (l) for (let k = 0; k < l.length; k += 2) {
    const r = ROADS[l[k]], i = l[k + 1], a = r.S[i], b = r.S[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz); t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + abx * t - x, pz = a.z + abz * t - z;
    const d = Math.sqrt(px * px + pz * pz) - r.hw;
    if (d < bd) { bd = d; bh = a.h + (b.h - a.h) * t; bri = l[k]; }
  }
  return { dEdge: bd, h: bh, ri: bri };
}
function frameAt(r, s) {
  s = Math.max(0, Math.min(r.len - 1e-3, s));
  const i = Math.min(r.S.length - 2, Math.floor(s / r.step)); const t = s / r.step - i;
  const a = r.S[i], b = r.S[i + 1]; const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), h: lerp(a.h, b.h, t), tx: dx / l, tz: dz / l };
}
function sNear(r, x, z) { let best = 0, bd = 1e9; for (const p of r.S) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p.s; } } return best; }

/* terrain grid */
const X0 = -650, X1 = 650, Z0 = -450, Z1 = 350, DX = 2.5;
const NX = (X1 - X0) / DX, NZ = (Z1 - Z0) / DX;
const HG = new Float32Array((NX + 1) * (NZ + 1));
function heightAt(x, z) {
  if (x < X0 || x > X1 || z < Z0 || z > Z1) return H0(x, z);
  const fx = (x - X0) / DX, fz = (z - Z0) / DX;
  let ix = Math.floor(fx), iz = Math.floor(fz); if (ix >= NX) ix = NX - 1; if (iz >= NZ) iz = NZ - 1;
  const tx = fx - ix, tz = fz - iz, i = iz * (NX + 1) + ix;
  const a = HG[i], b = HG[i + 1], c = HG[i + NX + 1], d = HG[i + NX + 2];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

function groundColor(x, z) {
  const n = fbm(x * 0.008 + 5, z * 0.008 - 3, 4), m = fbm(x * 0.06, z * 0.06, 2);
  let r = 88 + (n - 0.5) * 42 + (m - 0.5) * 16, g = 108 + (n - 0.5) * 34 + (m - 0.5) * 14, b = 54 + (n - 0.5) * 16;
  const hill = sstep(10, -60, z) * sstep(-260, -200, z);
  r -= 9 * hill; g -= 5 * hill; b -= 5 * hill;
  const pl = sstep(-222, -240, z + (fbm(x * 0.01, z * 0.01) - 0.5) * 30);
  if (pl > 0) {
    const a = 0.2, u = x * Math.cos(a) + z * Math.sin(a), v = -x * Math.sin(a) + z * Math.cos(a);
    const pu = Math.floor(u / 120), pv = Math.floor(v / 80); const t = hash2(pu + 71, pv + 913);
    const eu = Math.min(u - pu * 120, (pu + 1) * 120 - u), ev = Math.min(v - pv * 80, (pv + 1) * 80 - v);
    let fc;
    if (t < 0.45) { const s = Math.sin(u * 1.1) * 0.035; fc = [202 * (1 + s), 168 * (1 + s), 86]; }
    else if (t < 0.65) fc = [186, 162, 112];
    else if (t < 0.8) fc = [116, 130, 60];
    else fc = [124, 100, 76];
    const k = 0.9 + 0.2 * m; fc = fc.map(c => c * k);
    if (Math.min(eu, ev) < 2.2) fc = [r, g, b];
    r = lerp(r, fc[0], pl); g = lerp(g, fc[1], pl); b = lerp(b, fc[2], pl);
  }
  const bank = sstep(108, 119, z) * sstep(202, 190, z);
  r = lerp(r, 100, bank * 0.55); g = lerp(g, 104, bank * 0.55); b = lerp(b, 72, bank * 0.55);
  return [r, g, b];
}

/* ------------------------------------------------------------------ géométrie */
const _a = new V3(), _b = new V3(), _c = new V3(), _n = new V3(), _t = new V3(), _bt = new V3();
function faceUV(g, scale) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    _a.fromBufferAttribute(p, i); _b.fromBufferAttribute(p, i + 1); _c.fromBufferAttribute(p, i + 2);
    _n.subVectors(_c, _b).cross(_t.subVectors(_a, _b)).normalize();
    _t.crossVectors(UP, _n); if (_t.lengthSq() < 0.01) _t.set(1, 0, 0); _t.normalize();
    _bt.crossVectors(_n, _t);
    for (let k = 0; k < 3; k++) { _a.fromBufferAttribute(p, i + k); uv[(i + k) * 2] = _a.dot(_t) / scale; uv[(i + k) * 2 + 1] = _a.dot(_bt) / scale; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
const tmpC = new THREE.Color();
function clean(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  if (g.attributes.normal) out.setAttribute('normal', g.attributes.normal); else out.computeVertexNormals();
  if (!out.attributes.normal) out.computeVertexNormals();
  return out;
}
const B = { plaster: [], rubble: [], ashlar: [], church: [], tile: [], slate: [], hedge: [], dark: [], metal: [], paint: [], lawn: [] };
const UVS = { plaster: 4, rubble: 3, ashlar: 4, church: 4, tile: 2, slate: 2, hedge: 2, dark: 2, metal: 2, paint: 2, lawn: 4 };
function push(bucket, geo, M, color = '#ffffff', jitter = 0) {
  const g = clean(geo);
  faceUV(g, UVS[bucket]);
  tmpC.set(color); if (jitter) tmpC.multiplyScalar(1 + (R() - 0.5) * jitter);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (M) g.applyMatrix4(M);
  B[bucket].push(g);
}
function boxMM(x0, y0, z0, x1, y1, z1) { return new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); }
function tris(arr) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); return g; }
function gableRoofGeo(L, S, rise, ov) {
  const s = S / 2, k = rise / s, ez = s + ov, ey = -ov * k, x0 = -L / 2 - ov, x1 = L / 2 + ov;
  const P = [], quad = (a, b, c, d) => P.push(...a, ...b, ...c, ...a, ...c, ...d);
  quad([x0, ey, ez], [x1, ey, ez], [x1, rise, 0], [x0, rise, 0]);
  quad([x1, ey, -ez], [x0, ey, -ez], [x0, rise, 0], [x1, rise, 0]);
  return tris(P);
}
function hipRoofGeo(W, D, rise, ov) {
  if (W < D) return hipRoofGeo(D, W, rise, ov).rotateY(Math.PI / 2);
  const a = W / 2 + ov, b = D / 2 + ov, ey = -ov * rise / (D / 2), r = (W - D) / 2;
  const P = [], quad = (p, q, s, t) => P.push(...p, ...q, ...s, ...p, ...s, ...t);
  quad([-a, ey, b], [a, ey, b], [r, rise, 0], [-r, rise, 0]);
  quad([a, ey, -b], [-a, ey, -b], [-r, rise, 0], [r, rise, 0]);
  P.push(a, ey, b, a, ey, -b, r, rise, 0);
  P.push(-a, ey, -b, -a, ey, b, -r, rise, 0);
  return tris(P);
}
function prismX(pts, x0, x1) {
  const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
  return new THREE.ExtrudeGeometry(sh, { depth: x1 - x0, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(x1, 0, 0);
}
function gablePrism(x0, x1, S, rise) { return prismX([[-S / 2, 0], [S / 2, 0], [0, rise]], x0, x1); }
const mat4 = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, ry), new V3(s, s, s));

/* instances : fenêtres, volets, portes, baies d'église, tombes */
const INST = { glass: [], frame: [], shutter: [], mull: [], door: [], lancet: [], lancetFrame: [], belfry: [], tomb: [], topiary: [], trunk: [], crown0: [], crown1: [], crown2: [], flower: [], lampGlass: [] };
const _q = new THREE.Quaternion();
function inst(list, M, pos, ry, scale, color) {
  const m = new THREE.Matrix4().compose(pos, _q.setFromAxisAngle(UP, ry), scale);
  if (M) m.premultiply(M);
  list.push({ m, c: color });
}
function onWall(x, y, z, nx, nz, off, dx = 0) { const ry = Math.atan2(nx, nz); return new V3(x + nx * off + Math.cos(ry) * dx, y, z + nz * off - Math.sin(ry) * dx); }
function windowAt(M, x, y, z, nx, nz, w, h, o = {}) {
  const ry = Math.atan2(nx, nz);
  inst(INST.frame, M, onWall(x, y - 0.02, z, nx, nz, 0), ry, new V3(w + 0.3, h + 0.34, 0.1), o.frame || '#e6dfcf');
  inst(INST.glass, M, onWall(x, y, z, nx, nz, 0.02), ry, new V3(w, h, 0.1));
  inst(INST.mull, M, onWall(x, y, z, nx, nz, 0.075), ry, new V3(0.06, h, 0.04));
  inst(INST.mull, M, onWall(x, y + h / 6, z, nx, nz, 0.075), ry, new V3(w, 0.05, 0.04));
  if (h > 1.2) inst(INST.mull, M, onWall(x, y - h / 6, z, nx, nz, 0.075), ry, new V3(w, 0.05, 0.04));
  if (o.shutter) for (const s of [-1, 1]) inst(INST.shutter, M, onWall(x, y, z, nx, nz, 0.05, s * (w / 2 + w / 4 + 0.2)), ry, new V3(w / 2 + 0.02, h + 0.06, 0.06), o.shutter);
}
function doorAt(M, x, y0, z, nx, nz, w, h, color, frame = '#d9cfbb') {
  const ry = Math.atan2(nx, nz);
  inst(INST.frame, M, onWall(x, y0 + h / 2 + 0.05, z, nx, nz, 0), ry, new V3(w + 0.34, h + 0.2, 0.1), frame);
  inst(INST.door, M, onWall(x, y0 + h / 2, z, nx, nz, 0.03), ry, new V3(w, h, 0.1), color);
}
function lancetAt(M, x, y, z, nx, nz, w, h, kind = 'lancet') {
  const ry = Math.atan2(nx, nz);
  inst(INST.lancetFrame, M, onWall(x, y - 0.1, z, nx, nz, 0.03), ry, new V3(w + 0.4, h + 0.35, 1));
  inst(kind === 'belfry' ? INST.belfry : INST.lancet, M, onWall(x, y, z, nx, nz, 0.06), ry, new V3(w, h, 1));
}

/* ------------------------------------------------------------------ maisons */
const WALL_PLASTER = ['#e7dcc5', '#ddd0b4', '#efe6d3', '#d8c8a8', '#e3d3b3', '#cdbfa3', '#e9dfcc', '#d4c09a', '#e0d6c8'];
const WALL_RUBBLE = ['#ffffff', '#f2ece2', '#e8e0d2', '#fff6e8'];
const ROOF_TILE = ['#ffffff', '#eadcd2', '#f3e3d6', '#d8c8bd', '#fff1e6'];
const ROOF_SLATE = ['#ffffff', '#e6e9ee', '#d5d9df'];
const SHUTTERS = ['#6f8b6a', '#7c989b', '#9aa7ad', '#e9e4d6', '#86684c', '#56717a', '#a3a88c', '#5e6f58', '#b9b6aa'];
const DOORS = ['#5a3b28', '#3e4a3b', '#6b2e24', '#2f3d4d', '#7a6a55', '#4d5a4a'];

const houses = [];
const EXCL = [[-47, 17, -62, -18], [16, 62, -64, -26], [-340, -222, -160, 24], [-74, -6, -268, -212], [568, 640, -76, -35]];
function rectOf(x, z, a, W, D) {
  const ux = [Math.cos(a), -Math.sin(a)], uz = [Math.sin(a), Math.cos(a)];
  const C = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) C.push([x + ux[0] * sx * W / 2 + uz[0] * sz * D / 2, z + ux[1] * sx * W / 2 + uz[1] * sz * D / 2]);
  return { x, z, a, W, D, ux, uz, C, rad: Math.hypot(W, D) / 2 };
}
function overlap(A, Bb) {
  if (Math.hypot(A.x - Bb.x, A.z - Bb.z) > A.rad + Bb.rad) return false;
  for (const ax of [A.ux, A.uz, Bb.ux, Bb.uz]) {
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (const c of A.C) { const p = c[0] * ax[0] + c[1] * ax[1]; a0 = Math.min(a0, p); a1 = Math.max(a1, p); }
    for (const c of Bb.C) { const p = c[0] * ax[0] + c[1] * ax[1]; b0 = Math.min(b0, p); b1 = Math.max(b1, p); }
    if (a1 < b0 + 0.05 || b1 < a0 + 0.05) return false;
  }
  return true;
}
function inRects(x, z, rects, m = 0) { for (const e of rects) if (x > e[0] - m && x < e[1] + m && z > e[2] - m && z < e[3] + m) return true; return false; }
function pointInHouse(x, z, m = 0.3) {
  for (const h of houses) {
    const dx = x - h.x, dz = z - h.z; if (dx * dx + dz * dz > (h.rad + m) ** 2) continue;
    const u = dx * h.ux[0] + dz * h.ux[1], v = dx * h.uz[0] + dz * h.uz[1];
    if (Math.abs(u) < h.W / 2 + m && Math.abs(v) < h.D / 2 + m) return true;
  }
  return false;
}
function canPlace(rect) {
  if (rect.z > 76 || rect.x < X0 + 20 || rect.x > X1 - 20 || rect.z < Z0 + 20) return false;
  if (inRects(rect.x, rect.z, EXCL, rect.rad * 0.8)) return false;
  for (const c of rect.C) { const q = roadQuery(c[0], c[1]); if (q.ri >= 0 && q.dEdge < (ROADS[q.ri].sw || 0) + 0.2) return false; }
  const q = roadQuery(rect.x, rect.z); if (q.dEdge < Math.min(rect.W, rect.D) / 2 + 0.3) return false;
  let hmin = 1e9, hmax = -1e9; for (const c of rect.C) { const h = heightAt(c[0], c[1]); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
  if (hmax - hmin > 3.6) return false;
  for (const h of houses) if (overlap(rect, h)) return false;
  return true;
}

function buildHouse(o) {
  const { x, z, a, W, D, floors, baseY } = o;
  const wall = o.wall || 'plaster', roofB = o.roof || 'tile';
  const wallColor = o.wallColor || (wall === 'plaster' ? pick(WALL_PLASTER) : pick(WALL_RUBBLE));
  const roofColor = o.roofColor || (roofB === 'tile' ? pick(ROOF_TILE) : pick(ROOF_SLATE));
  const M = mat4(x, baseY, z, a);
  const Hw = floors * 2.85 + 0.45;
  const pitch = roofB === 'slate' ? 1.05 : 0.9;
  push(wall, boxMM(-W / 2, -4.5, -D / 2, W / 2, Hw, D / 2), M, wallColor);
  push('rubble', boxMM(-W / 2 - 0.05, -4.5, -D / 2 - 0.05, W / 2 + 0.05, 0.45, D / 2 + 0.05), M, '#d9d0bf'); // soubassement
  let rise, ridgeTop;
  if (o.hip) {
    rise = Math.min(W, D) / 2 * pitch;
    push(roofB, hipRoofGeo(W, D, rise, 0.45).translate(0, Hw, 0), M, roofColor);
  } else if (!o.gableFront) {
    rise = D / 2 * pitch;
    push(roofB, gableRoofGeo(W, D, rise, 0.45).translate(0, Hw, 0), M, roofColor);
    push(wall, gablePrism(-W / 2, W / 2, D, rise).translate(0, Hw, 0), M, wallColor);
  } else {
    rise = W / 2 * pitch;
    push(roofB, gableRoofGeo(D, W, rise, 0.45).rotateY(Math.PI / 2).translate(0, Hw, 0), M, roofColor);
    push(wall, gablePrism(-D / 2, D / 2, W, rise).rotateY(Math.PI / 2).translate(0, Hw, 0), M, wallColor);
  }
  ridgeTop = Hw + rise;
  // gouttières et descentes en zinc
  {
    const k = rise / ((o.gableFront ? W : D) / 2), ey = Hw - 0.45 * k - 0.08, zinc = '#8e9391';
    const gut = (L, px, pz, alongZ) => { const g = new THREE.CylinderGeometry(0.08, 0.08, L, 6).rotateZ(Math.PI / 2); if (alongZ) g.rotateY(Math.PI / 2); push('metal', g.translate(px, ey, pz), M, zinc); };
    if (o.hip || !o.gableFront) { for (const sz of [-1, 1]) gut(W + 0.9, 0, sz * (D / 2 + 0.5), false); }
    else { for (const sx of [-1, 1]) gut(D + 0.9, sx * (W / 2 + 0.5), 0, true); }
    const dpx = (R() < 0.5 ? -1 : 1) * (W / 2 - 0.25);
    push('metal', new THREE.CylinderGeometry(0.055, 0.055, ey + 0.2, 6).translate(dpx, (ey - 0.2) / 2, D / 2 + 0.14), M, zinc);
  }
  // cheminées
  if (!o.noChimney) {
    const cx = o.gableFront ? 0 : (R() < 0.5 ? -1 : 1) * W * 0.32, cz = o.gableFront ? -D * 0.3 : 0;
    const chimC = R() < 0.5 ? '#a0705a' : wallColor;
    push('plaster', boxMM(cx - 0.4, Hw, cz - 0.5, cx + 0.4, ridgeTop + 1.0, cz + 0.5), M, chimC);
    push('dark', boxMM(cx - 0.47, ridgeTop + 1.0, cz - 0.57, cx + 0.47, ridgeTop + 1.14, cz + 0.57), M, '#6b6258');
  }
  // façades
  const shutter = o.shutter === undefined ? pick(SHUTTERS) : o.shutter;
  const frame = wall === 'rubble' ? '#d8cdb5' : '#e9e3d5';
  const nb = Math.max(1, Math.floor((W - 1.2) / 2.7));
  const bay = i => -W / 2 + W * (i + 0.5) / nb;
  const doorI = o.doorI ?? Math.floor(R() * nb);
  const ww = rr(0.85, 1.05);
  const flowers = o.flowers ?? R() < 0.35, fcol = pick(['#c8283a', '#d94b6a', '#e8e0e6', '#c43b2a', '#e07aa0']);
  for (let f = 0; f < floors; f++) {
    const y = f * 2.85 + (f === 0 ? 1.6 : 1.55);
    for (let i = 0; i < nb; i++) {
      if (f === 0 && o.shopfront) continue;
      if (f === 0 && i === doorI) doorAt(M, bay(i), 0.45, D / 2, 0, 1, 1.05, 2.15, o.door || pick(DOORS), frame);
      else {
        windowAt(M, bay(i), y, D / 2, 0, 1, ww, f === 0 ? 1.3 : 1.45, { frame, shutter });
        if (flowers && f === 1) {   // jardinière de géraniums
          const yb = y - 0.9;
          push('paint', boxMM(bay(i) - ww / 2, yb - 0.12, D / 2 + 0.06, bay(i) + ww / 2, yb + 0.1, D / 2 + 0.32), M, '#5b4636');
          for (let k = 0; k < 6; k++) inst(INST.flower, M, new V3(bay(i) - ww / 2 + 0.1 + k * (ww - 0.2) / 5, yb + 0.17 + R() * 0.08, D / 2 + 0.18 + (R() - 0.5) * 0.1), R() * 6, new V3(0.13, 0.11, 0.13), R() < 0.8 ? fcol : '#4d6b32');
        }
      }
      if (R() < 0.7) windowAt(M, bay(i), y, -D / 2, 0, -1, ww, f === 0 ? 1.2 : 1.35, { frame, shutter });
    }
  }
  if (o.gableFront) windowAt(M, 0, Hw + rise * 0.35, D / 2, 0, 1, 0.7, 0.9, { frame, shutter });
  // lucarnes
  if (!o.gableFront && !o.hip && floors >= 2 && R() < 0.3) {
    const zf = D / 2 - 0.6, yb = Hw + 0.3, yt = Hw + 0.6 * pitch + 1.6;
    for (let i = 0; i < nb; i += 2) {
      const dx = bay(i);
      push(wall, boxMM(dx - 0.75, yb, zf - 2.2, dx + 0.75, yt, zf), M, wallColor);
      push(roofB, gableRoofGeo(2.2, 1.5, 0.8, 0.12).rotateY(Math.PI / 2).translate(dx, yt, zf - 1.1), M, roofColor);
      push(wall, gablePrism(-1.1, 1.1, 1.5, 0.8).rotateY(Math.PI / 2).translate(dx, yt, zf - 1.1), M, wallColor);
      windowAt(M, dx, (yb + yt) / 2, zf, 0, 1, 0.7, 0.9, { frame, shutter: null });
    }
  }
  if (o.shopfront) {
    inst(INST.door, M, new V3(0, 1.55, D / 2 + 0.05), 0, new V3(W - 1.6, 2.3, 0.12), o.shopfront);
    for (let i = 0; i < 3; i++) inst(INST.glass, M, new V3(-W / 2 + 2 + i * (W - 4) / 2, 1.7, D / 2 + 0.12), 0, new V3(1.6, 1.5, 0.05));
  }
  // lierre ou vigne vierge sur un angle de façade
  if (o.vine ?? R() < 0.22) {
    const vx = (R() < 0.5 ? -1 : 1) * (W / 2 - rr(0.6, 1.4)), vw = rr(1.2, 2.6), vh = rr(2.5, Math.max(2.6, Hw - 0.3));
    push('hedge', boxMM(vx - vw / 2, 0.3, D / 2, vx + vw / 2, vh, D / 2 + 0.18), M, R() < 0.7 ? '#ffffff' : '#e6a47a', 0.2);
  }
  const rect = rectOf(x, z, a, W, D); houses.push(rect);
  return { M, Hw, rise, doorX: o.shopfront ? 0 : bay(doorI), W, D };
}

function roadWall(r, side, s0, s1, setback) {
  const hgt = rr(1.7, 2.3);
  for (let s = s0; s < s1 - 0.5; s += 3) {
    const e = Math.min(s + 3, s1);
    const f0 = frameAt(r, s), f1 = frameAt(r, e);
    const o = r.hw + setback;
    const p0 = [f0.x - f0.tz * side * o, f0.z + f0.tx * side * o], p1 = [f1.x - f1.tz * side * o, f1.z + f1.tx * side * o];
    const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2;
    if (inRects(mx, mz, EXCL, 2) || pointInHouse(mx, mz, 0.6)) continue;
    const q = roadQuery(mx, mz); if (q.dEdge < setback - 0.2) continue;
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + 0.12;
    const ry = Math.atan2(-(p1[1] - p0[1]), p1[0] - p0[0]);
    const M = mat4(mx, heightAt(mx, mz), mz, ry);
    if (len > 2.6 && R() < 0.14) {   // portail en fer forgé entre deux piliers
      for (const sx of [-1, 1]) {
        push('ashlar', boxMM(sx * len / 2 - 0.3, -2, -0.32, sx * len / 2 + 0.3, hgt + 0.5, 0.32), M, '#e8e0cf');
        push('ashlar', boxMM(sx * len / 2 - 0.38, hgt + 0.5, -0.4, sx * len / 2 + 0.38, hgt + 0.66, 0.4), M, '#e8e0cf');
      }
      const gc = pick(['#2f4a3a', '#26303a', '#4b5a52', '#1f2522']), gl = len - 0.6;
      for (let gx = -gl / 2 + 0.06; gx <= gl / 2; gx += 0.13) push('metal', boxMM(gx - 0.018, 0, -0.02, gx + 0.018, hgt - 0.1 + Math.cos(gx / gl * Math.PI) * 0.35, 0.02), M, gc);
      for (const gy of [0.25, hgt - 0.45]) push('metal', boxMM(-gl / 2, gy, -0.03, gl / 2, gy + 0.06, 0.03), M, gc);
      continue;
    }
    push('rubble', boxMM(-len / 2, -2, -0.25, len / 2, hgt, 0.25), M, pick(WALL_RUBBLE));
    push('ashlar', boxMM(-len / 2, hgt, -0.32, len / 2, hgt + 0.14, 0.32), M, '#e5dccb');
    if (R() < 0.18) push('hedge', boxMM(-len / 2, hgt - rr(0.6, 1.4), 0.2, len / 2 - rr(0, 1), hgt + 0.35, 0.45), M, '#ffffff', 0.2);
  }
}

/* ------------------------------------------------------------------ détails de rue */
// jardinet en terrasse devant une maison du coteau : mur de soutènement, marches, allée, pelouse
function frontGarden(hs, D, depth, roadTopL, terrace) {
  const { M, doorX, W } = hs, zPL = D / 2 + depth, top = 0.45;
  const lo = Math.min(roadTopL, 0) - 1.2;
  const n = terrace ? Math.max(1, Math.round((top - roadTopL) / 0.17)) : 0;
  const run = n ? Math.min(0.32, Math.max(0.2, (depth - 0.8) / n)) : 0, rise = n ? (top - roadTopL) / n : 0;
  const wTop = terrace ? top + 0.55 : Math.max(roadTopL + 1.1, top - 0.2);
  for (const [x0, x1] of [[-W / 2 - 0.3, doorX - 0.7], [doorX + 0.7, W / 2 + 0.3]]) {
    if (x1 - x0 < 0.2) continue;
    push('rubble', boxMM(x0, lo, zPL - 0.5, x1, wTop, zPL), M, pick(WALL_RUBBLE));
    push('ashlar', boxMM(x0, wTop, zPL - 0.56, x1, wTop + 0.12, zPL + 0.06), M, '#e6ddcc');
    push('lawn', boxMM(x0 + 0.1, lo, D / 2, x1 - 0.1, terrace ? top - 0.08 : Math.max(roadTopL, -0.2) + 0.25, zPL - 0.5), M, '#ffffff', 0.15);
    for (let k = 0; k < 2; k++) if (R() < 0.7) {
      const bx = rr(x0 + 0.8, x1 - 0.8), bz = rr(D / 2 + 0.8, zPL - 1.1); if (x1 - x0 < 1.8) break;
      const sc = rr(0.5, 0.9), by = terrace ? top : Math.max(roadTopL, -0.2) + 0.25;
      inst(INST['crown' + Math.floor(R() * 3)], M, new V3(bx, by + sc * 0.7, bz), R() * 6, new V3(sc, sc * 0.8, sc), treeColor(false));
    }
  }
  for (const sx of [-1, 1]) push('ashlar', boxMM(doorX + sx * 0.7 - 0.25, lo, zPL - 0.55, doorX + sx * 0.7 + 0.25, wTop + 0.45, zPL + 0.05), M, '#ebe3d3');
  for (let i = 0; i < n; i++) push('ashlar', boxMM(doorX - 0.6, lo, zPL - (i + 1) * run, doorX + 0.6, roadTopL + (i + 1) * rise, zPL - i * run), M, '#e3dac8');
  push('ashlar', boxMM(doorX - 0.6, lo, D / 2, doorX + 0.6, terrace ? top : Math.max(roadTopL, -0.2) + 0.28, zPL - n * run), M, '#d9cfbc');
}
function terraceWall(x0, x1, zw, hu, hl, g0, g1) {
  for (const [a0, a1] of [[x0, g0 - 0.4], [g1 + 0.4, x1]]) {
    push('rubble', boxMM(a0, hl - 1.5, zw, a1, hu, zw + 2.5), null, '#f4ede2');
    push('rubble', boxMM(a0, hu, zw + 2.0, a1, hu + 0.85, zw + 2.5), null, '#f4ede2');
    push('ashlar', boxMM(a0, hu + 0.85, zw + 1.95, a1, hu + 1.0, zw + 2.55), null, '#e8e0cf');
  }
  stairs(g0, g1, zw, hu, hl);
}
function buildGachet(plates) {
  const h1 = ZONES.at(-2).h, h2 = ZONES.at(-1).h, hl = heightAt(590, -36);
  terraceWall(576, 604, -40, h1, hl, 588.4, 591.6);
  terraceWall(574, 606, -50, h2, h1, 588.4, 591.6);
  for (const sx of [587.9, 592.1]) {
    push('ashlar', boxMM(sx - 0.35, hl - 0.5, -37.9, sx + 0.35, hl + 2.6, -37.2), null, '#ebe3d3');
    push('ashlar', boxMM(sx - 0.45, hl + 2.6, -38.0, sx + 0.45, hl + 2.78, -37.1), null, '#ebe3d3');
  }
  plates.push({ M: null, x: 592.1, y: hl + 1.9, z: -37.17, n: 78 });
  const hs = buildHouse({ x: 590, z: -58, a: 0, W: 9, D: 8, floors: 3, baseY: h2, wall: 'plaster', wallColor: '#eee4cf', roof: 'slate', shutter: '#8f9c93', doorI: 0, flowers: false, vine: false });
  push('ashlar', boxMM(585.8, h2 - 0.5, -54, 588.2, h2 + 0.45, -52.6), null, '#e3dac8');
  // falaise calcaire et atelier troglodyte
  const top = Math.max(heightAt(590, -72), h2 + 3) + 0.3;
  push('rubble', boxMM(573, h2 - 0.5, -67.6, 607, top, -66), null, '#e9e0cc');
  lancetAt(null, 600.5, h2 + 1.3, -66, 0, 1, 2.2, 2.6, 'belfry');
  lancetAt(null, 603.5, h2 + 1.1, -66, 0, 1, 0.9, 1.3, 'belfry');
  // jardin : buis centenaires, vivaces, lierre
  const fl = ['#b34a8c', '#e0c24a', '#e8e3ee', '#8a5cc7', '#d2553a', '#f0a3b8', '#6c8e3b'];
  for (const [bx0, bx1] of [[577.5, 587.5], [592.5, 602.5]]) {
    push('hedge', boxMM(bx0, h1 - 0.3, -49.2, bx1, h1 + 0.6, -48.7), null, '#ffffff', 0.15);
    push('hedge', boxMM(bx0, h1 - 0.3, -41.8, bx1, h1 + 0.6, -41.3), null, '#ffffff', 0.15);
    for (let k = 0; k < 110; k++) inst(INST.flower, null, new V3(rr(bx0 + 0.3, bx1 - 0.3), h1 + rr(0.15, 0.6), rr(-48.4, -42.1)), R() * 6, new V3(rr(0.12, 0.22), rr(0.12, 0.3), rr(0.12, 0.22)), pick(fl));
    for (const bz of [-47, -43.5]) inst(INST.topiary, null, new V3((bx0 + bx1) / 2, h1, bz), 0, new V3(1.1, 2.2, 1.1), '#3f5a2c');
  }
  push('hedge', boxMM(574.2, h2 - 0.2, -49.9, 576, h2 + 1.6, -46), null, '#ffffff', 0.2);
  for (const [tx, tz] of [[579, -60], [602, -57], [577, -45.5]]) addTree(tx, tz, 'leaf', 0.8);
  return hs;
}
function crossing(r, s) {
  const f = frameAt(r, s), M = mat4(f.x, f.h + r.lift + 0.004, f.z, Math.atan2(-f.tz, f.tx));
  for (let k = -r.hw + 0.35; k < r.hw - 0.6; k += 1.0) push('paint', boxMM(-1.3, 0, k, 1.3, 0.02, k + 0.5), M, '#eceae4');
}
function lamp(x, y, z, ry) {
  const M = mat4(x, y, z, ry), c = '#27352f';
  push('metal', new THREE.CylinderGeometry(0.16, 0.2, 0.7, 10).translate(0, 0.35, 0), M, c);
  push('metal', new THREE.CylinderGeometry(0.055, 0.075, 3.9, 8).translate(0, 2.3, 0), M, c);
  push('metal', new THREE.CylinderGeometry(0.1, 0.07, 0.25, 8).translate(0, 4.3, 0), M, c);
  push('metal', new THREE.ConeGeometry(0.34, 0.32, 4).rotateY(Math.PI / 4).translate(0, 5.06, 0), M, c);
  push('metal', boxMM(-0.2, 4.42, -0.2, 0.2, 4.47, 0.2), M, c);
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) push('metal', boxMM(sx * 0.2 - 0.02, 4.45, sz * 0.2 - 0.02, sx * 0.2 + 0.02, 4.92, sz * 0.2 + 0.02), M, c);
  inst(INST.lampGlass, M, new V3(0, 4.68, 0), 0, new V3(0.38, 0.46, 0.38));
}
function car(x, y, z, ry, color) {
  const M = mat4(x, y, z, ry);
  push('paint', boxMM(-2.05, 0.3, -0.86, 2.05, 1.0, 0.86), M, color);
  push('paint', boxMM(-2.1, 0.3, -0.8, 2.1, 0.55, 0.8), M, color);
  const sh = new THREE.Shape([new THREE.Vector2(-1.55, 0), new THREE.Vector2(1.05, 0), new THREE.Vector2(0.45, 0.55), new THREE.Vector2(-1.2, 0.55)]);
  push('dark', new THREE.ExtrudeGeometry(sh, { depth: 1.58, bevelEnabled: false }).translate(0, 1.0, -0.79), M, '#20282e');
  push('paint', boxMM(-1.2, 1.55, -0.72, 0.45, 1.6, 0.72), M, color);
  for (const [wx, wz] of [[-1.3, -0.8], [-1.3, 0.8], [1.3, -0.8], [1.3, 0.8]]) push('dark', new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12).rotateX(Math.PI / 2).translate(wx, 0.33, wz), M, '#161616');
  for (const sz of [-1, 1]) push('metal', boxMM(1.95, 0.72, sz * 0.62 - 0.14, 2.07, 0.86, sz * 0.62 + 0.14), M, '#f4f1e6');
}
function numberPlates(plates) {
  const cell = 64, cols = 10;
  const atlas = textCanvas(cell * cols, cell * cols, (c) => {
    for (let n = 1; n <= 100; n++) {
      const cx = ((n - 1) % cols) * cell, cy = Math.floor((n - 1) / cols) * cell;
      c.fillStyle = '#1d3e78'; rrect(c, cx + 2, cy + 8, cell - 4, cell - 16, 6);
      c.strokeStyle = '#f2f2ee'; c.lineWidth = 3; c.strokeRect(cx + 6, cy + 12, cell - 12, cell - 24);
      c.fillStyle = '#f2f2ee'; c.font = 'bold 26px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), cx + cell / 2, cy + cell / 2 + 1);
    }
  });
  const pos = [], uv = [], v = new V3();
  for (const p of plates) {
    if (!p.n || p.n > 100) continue;
    const cx = ((p.n - 1) % cols) / cols, cy = Math.floor((p.n - 1) / cols) / cols, du = 1 / cols;
    const u0 = cx + 0.004, u1 = cx + du - 0.004, v1 = 1 - cy - du * 0.12, v0 = 1 - cy - du * 0.88;
    const corners = [[-0.17, -0.11, u0, v0], [0.17, -0.11, u1, v0], [0.17, 0.11, u1, v1], [-0.17, -0.11, u0, v0], [0.17, 0.11, u1, v1], [-0.17, 0.11, u0, v1]];
    for (const [dx, dy, uu, vv] of corners) { v.set(p.x + dx, p.y + dy, p.z); if (p.M) v.applyMatrix4(p.M); pos.push(v.x, v.y, v.z); uv.push(uu, vv); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  const t = new THREE.CanvasTexture(atlas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAX_ANISO;
  scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 })));
}
function sidewalkCanvas() {
  const S = 256, c = pixels(S, S, (x, y) => { const n = fbm(x / S * 6, y / S * 6, 4, 6); const v = 176 + (n - 0.5) * 36 + (Math.random() - 0.5) * 14; return [v, v * 0.985, v * 0.96]; });
  const g = c.getContext('2d'); g.fillStyle = 'rgba(70,66,60,0.55)';
  for (let k = 0; k <= 2; k++) { g.fillRect(k * S / 2 - 1, 0, 2, S); g.fillRect(0, k * S / 2 - 1, S, 2); }
  return c;
}

/* ------------------------------------------------------------------ l'église */
function buildChurch() {
  const M = mat4(-15, H_EGLISE, -40, 0);
  const C = '#d9d0bf', S = 'church';
  push(S, boxMM(-20, -3, -3.5, 4, 12, 3.5), M, C);                  // nef
  push(S, boxMM(-20, -3, 3.5, 4, 6.5, 7.5), M, C);                  // bas-côtés
  push(S, boxMM(-20, -3, -7.5, 4, 6.5, -3.5), M, C);
  push(S, prismX([[3.5, 6.5], [7.5, 6.5], [3.5, 9.2]], -20, -19.6), M, C);
  push(S, prismX([[-3.5, 6.5], [-7.5, 6.5], [-3.5, 9.2]], -20, -19.6), M, C);
  push(S, boxMM(4, -3, -4, 12, 13, 4), M, C);                       // croisée
  push(S, boxMM(4, -3, 4, 12, 11.5, 12), M, C);                     // transept
  push(S, boxMM(4, -3, -12, 12, 11.5, -4), M, C);
  push(S, boxMM(12, -3, -3.8, 22, 12, 3.8), M, C);                  // chœur
  push(S, new THREE.CylinderGeometry(3.8, 3.8, 15, 10, 1, false, 0, Math.PI).translate(22, 4.5, 0), M, C); // abside
  for (const sz of [-1, 1]) push(S, new THREE.CylinderGeometry(2.4, 2.4, 10, 8, 1, false, 0, Math.PI).translate(12, 2, sz * 8), M, C); // absidioles
  push(S, boxMM(4.8, 13, -3.2, 11.2, 24.5, 3.2), M, C);             // clocher
  push(S, boxMM(4.5, 18, -3.5, 11.5, 18.4, 3.5), M, '#cfc5b2');
  push(S, boxMM(4.4, 24.2, -3.6, 11.6, 24.8, 3.6), M, '#cfc5b2');
  push(S, boxMM(4.6, 13, -3.4, 11.4, 13.5, 3.4), M, '#cfc5b2');
  // contreforts
  for (const x of [-18, -13, -8, -3, 2]) for (const sz of [-1, 1]) {
    push(S, boxMM(x - 0.45, -3, sz > 0 ? 7.5 : -8.4, x + 0.45, 4.5, sz > 0 ? 8.4 : -7.5), M, C);
    push(S, boxMM(x - 0.4, 4.5, sz > 0 ? 7.5 : -7.95, x + 0.4, 5.9, sz > 0 ? 7.95 : -7.5), M, C);
  }
  for (const x of [14.3, 18.3]) for (const sz of [-1, 1]) push(S, boxMM(x - 0.45, -3, sz > 0 ? 3.8 : -4.9, x + 0.45, 10, sz > 0 ? 4.9 : -3.8), M, C);
  for (const sz of [-1, 1]) {
    push(S, boxMM(-21, -3, sz * 3.5 - 0.5, -20, 10, sz * 3.5 + 0.5), M, C);
    for (const x of [4, 12]) push(S, boxMM(x - 0.5, -3, sz > 0 ? 12 : -13, x + 0.5, 9, sz > 0 ? 13 : -12), M, C);
  }
  for (const ph of [-0.9, 0, 0.9]) {
    const nx = Math.cos(ph), nz = Math.sin(ph); const ang = Math.atan2(nx, nz);
    push(S, new THREE.BoxGeometry(0.9, 13, 1.1).translate(0, 3.5, 0).applyMatrix4(mat4(22 + nx * 4.1, 0, nz * 4.1, ang)), M, C);
  }
  // toitures
  push('slate', gableRoofGeo(24, 7, 5.5, 0.4).translate(-8, 12, 0), M, '#ffffff');
  push(S, gablePrism(-20, 4, 7, 5.5).translate(0, 12, 0), M, C);
  push('tile', tris([-20.3, 6.2, 7.9, 4, 6.2, 7.9, 4, 9.2, 3.5, -20.3, 6.2, 7.9, 4, 9.2, 3.5, -20.3, 9.2, 3.5]), M, '#f0e0d4');
  push('tile', tris([4, 6.2, -7.9, -20.3, 6.2, -7.9, -20.3, 9.2, -3.5, 4, 6.2, -7.9, -20.3, 9.2, -3.5, 4, 9.2, -3.5]), M, '#f0e0d4');
  for (const sz of [-1, 1]) {
    push('slate', gableRoofGeo(8, 8, 5, 0.4).rotateY(Math.PI / 2).translate(8, 11.5, sz * 8), M);
    push(S, gablePrism(-4, 4, 8, 5).rotateY(Math.PI / 2).translate(8, 11.5, sz * 8), M, C);
    push('tile', new THREE.ConeGeometry(2.75, 2.6, 8, 1, true, 0, Math.PI).translate(12, 8.3, sz * 8), M, '#f0e0d4');
  }
  push('slate', gableRoofGeo(10, 7.6, 5.5, 0.4).translate(17, 12, 0), M);
  push(S, gablePrism(12, 22, 7.6, 5.5).translate(0, 12, 0), M, C);
  push('slate', new THREE.ConeGeometry(4.25, 5.5, 10, 1, true, 0, Math.PI).translate(22, 14.75, 0), M);
  push('slate', new THREE.ConeGeometry(5.4, 5.2, 4, 1).rotateY(Math.PI / 4).translate(8, 27.4, 0), M);
  push('metal', boxMM(7.93, 30, -0.07, 8.07, 32.2, 0.07), M, '#3b3a36');
  push('metal', boxMM(7.93, 31.3, -0.6, 8.07, 31.44, 0.6), M, '#3b3a36');
  // baies
  for (const x of [-15.5, -10.5, -5.5, -0.5]) for (const sz of [-1, 1]) {
    lancetAt(M, x, 3.6, sz * 7.5, 0, sz, 1.1, 3.0);
    lancetAt(M, x, 10.4, sz * 3.5, 0, sz, 0.8, 1.5);
  }
  for (const x of [16.3, 20.3]) for (const sz of [-1, 1]) lancetAt(M, x, 7.3, sz * 3.8, 0, sz, 1.2, 4.2);
  for (const ph of [-0.45, 0.45]) lancetAt(M, 22 + Math.cos(ph) * 3.8, 7.3, Math.sin(ph) * 3.8, Math.cos(ph), Math.sin(ph), 1.1, 4.2);
  for (const sz of [-1, 1]) {
    lancetAt(M, 8, 6.2, sz * 12, 0, sz, 1.8, 4.6);
    lancetAt(M, 14.4, 3.2, sz * 8, 1, 0, 0.6, 1.6);
    for (const x of [6.8, 9.2]) lancetAt(M, x, 21.2, sz * 3.2, 0, sz, 0.95, 3.0, 'belfry');
    for (const z of [-1.2, 1.2]) lancetAt(M, sz > 0 ? 11.2 : 4.8, 21.2, z, sz, 0, 0.95, 3.0, 'belfry');
    for (const x of [6.2, 8, 9.8]) lancetAt(M, x, 15.8, sz * 3.2, 0, sz, 0.6, 1.8);
  }
  lancetAt(M, -20, 8.6, 0, -1, 0, 1.4, 3.2);
  lancetAt(M, -21.05, 2.2, 0, -1, 0, 2.4, 4.4, 'belfry');     // portail
  push(S, boxMM(-21.6, -3, -2.2, -21.0, 5.1, -1.6), M, C);
  push(S, boxMM(-21.6, -3, 1.6, -21.0, 5.1, 2.2), M, C);
  // parvis, mur de soutènement et escalier
  const zw = -22.5, hl = heightAt(-15, -18);
  for (const [x0, x1] of [[-55, -18], [-12, 25]]) {
    push('rubble', boxMM(x0, hl - 1.5, zw, x1, H_EGLISE, zw + 2.5), null, '#f4ede2');
    push('rubble', boxMM(x0, H_EGLISE, zw + 2.0, x1, H_EGLISE + 0.85, zw + 2.5), null, '#f4ede2');
    push('ashlar', boxMM(x0, H_EGLISE + 0.85, zw + 1.95, x1, H_EGLISE + 1.0, zw + 2.55), null, '#e8e0cf');
  }
  stairs(-18, -12, zw, H_EGLISE, hl);
}
function stairs(x0, x1, zw, hu, hl) {
  const n = Math.max(1, Math.round((hu - hl) / 0.17)), rise = (hu - hl) / n, run = 0.32;
  for (let i = 0; i < n; i++) {
    const top = hu - (i + 1) * rise;
    push('ashlar', boxMM(x0, hl - 0.8, zw + i * run, x1, top, zw + (i + 1) * run), null, '#e3dac8');
    for (const x of [x0 - 0.4, x1]) push('rubble', boxMM(x, hl - 0.8, zw + i * run, x + 0.4, top + 0.9, zw + (i + 1) * run + 0.01), null, '#f4ede2');
  }
}

/* ------------------------------------------------------------------ le château et ses terrasses */
function buildChateau() {
  const cy = 21, M = mat4(-280, cy, -125, 0), A = 'ashlar', C = '#f6f0e5';
  const blocks = [[-15, 15, 6, 11], [-5, 5, 6.8, 11.6], [-24, -15, 7.5, 12], [15, 24, 7.5, 12]];
  for (const [x0, x1, d, h] of blocks) {
    push(A, boxMM(x0, -4, -d, x1, h, d), M, C);
    push(A, boxMM(x0 - 0.06, -4, -d - 0.06, x1 + 0.06, 0.9, d + 0.06), M, '#ddd3c1');
    push(A, boxMM(x0 - 0.1, 5.2, -d - 0.1, x1 + 0.1, 5.5, d + 0.1), M, '#ebe3d4');
    push(A, boxMM(x0 - 0.3, h - 0.5, -d - 0.3, x1 + 0.3, h, d + 0.3), M, '#ebe3d4');
  }
  push('slate', hipRoofGeo(30, 12, 7, 0.5).translate(0, 11, 0), M);
  push('slate', hipRoofGeo(10, 13.6, 7.8, 0.5).translate(0, 11.6, 0), M);
  for (const sx of [-1, 1]) push('slate', hipRoofGeo(9, 15, 7, 0.5).translate(sx * 19.5, 12, 0), M);
  for (const sz of [-1, 1]) {
    const sh = new THREE.Shape([new THREE.Vector2(-5.3, 0), new THREE.Vector2(5.3, 0), new THREE.Vector2(0, 2.5)]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.9, bevelEnabled: false }).translate(0, 11.6, 6.3);
    if (sz < 0) g.rotateY(Math.PI);
    push(A, g, M, '#ebe3d4');
    for (const x of [-11, -7.5, 7.5, 11]) {
      push(A, boxMM(x - 0.6, 14, -1.3, x + 0.6, 20.2, 1.3), M, C);
      push('dark', boxMM(x - 0.7, 20.2, -1.4, x + 0.7, 20.45, 1.4), M, '#8a8174');
    }
    // lucarnes
    for (const x of [-12.4, -8.6, 8.6, 12.4]) {
      const zf = sz * 5.2, zb = sz * 2.6;
      push(A, boxMM(x - 0.9, 11.8, Math.min(zf, zb), x + 0.9, 14.0, Math.max(zf, zb)), M, C);
      push('slate', gableRoofGeo(2.6, 1.8, 1.0, 0.15).rotateY(Math.PI / 2).translate(x, 14.0, (zf + zb) / 2), M);
      push(A, gablePrism(-1.3, 1.3, 1.8, 1.0).rotateY(Math.PI / 2).translate(x, 14.0, (zf + zb) / 2), M, C);
      windowAt(M, x, 12.9, zf, 0, sz, 0.9, 1.3, { frame: '#efe8da' });
    }
  }
  const fr = '#efe8da';
  for (const sz of [-1, 1]) {
    for (const [xs, d] of [[[-13.2, -10, -6.8, 6.8, 10, 13.2], 6], [[-2.8, 0, 2.8], 6.8], [[-21.5, -17.5, 17.5, 21.5], 7.5]]) {
      for (const x of xs) {
        if (x === 0 && sz > 0) doorAt(M, 0, 0.45, d, 0, 1, 1.8, 3.2, '#4a3a2c', fr);
        else windowAt(M, x, 2.6, sz * d, 0, sz, 1.3, 2.6, { frame: fr });
        windowAt(M, x, 8.1, sz * d, 0, sz, 1.3, 2.8, { frame: fr });
      }
    }
  }
  for (const sx of [-1, 1]) for (const z of [-3.5, 0, 3.5]) {
    windowAt(M, sx * 24, 2.6, z, sx, 0, 1.3, 2.6, { frame: fr });
    windowAt(M, sx * 24, 8.1, z, sx, 0, 1.3, 2.8, { frame: fr });
  }
  // perron
  push(A, boxMM(-3.5, -1, 6.8, 3.5, 0.3, 8.9), M, '#e3dac8');
  push(A, boxMM(-3, -1, 6.8, 3, 0.45, 8.3), M, '#e3dac8');

  // terrasses
  const gx0 = -322, gx1 = -238, sx0 = -284, sx1 = -276;
  const walls = [[-100, 21, 15.5], [-75, 15.5, 10], [-50, 10, 5.5], [-27.5, 5.5, null]];
  for (const [zw, hu, hlv] of walls) {
    const hl = hlv ?? Math.min(heightAt(-280, zw + 4), heightAt(gx0, zw + 4), heightAt(gx1, zw + 4));
    for (const [x0, x1] of [[gx0, sx0 - 0.4], [sx1 + 0.4, gx1]]) {
      push('rubble', boxMM(x0, hl - 1.5, zw, x1, hu, zw + 2.5), null, '#f7f1e6');
      push('rubble', boxMM(x0, hu, zw + 2.0, x1, hu + 0.85, zw + 2.5), null, '#f7f1e6');
      push('ashlar', boxMM(x0, hu + 0.85, zw + 1.95, x1, hu + 1.0, zw + 2.55), null, '#efe7d8');
      for (let x = x0 + 4; x < x1 - 2; x += 8) push('ashlar', boxMM(x - 0.35, hu + 0.85, zw + 1.9, x + 0.35, hu + 1.45, zw + 2.6), null, '#efe7d8');
    }
    stairs(sx0, sx1, zw, hu, hl);
  }
  // parterres de buis
  const terr = [[-100, -75, 15.5], [-75, -50, 10], [-50, -27.5, 5.5]];
  const comps = [[-318, -303], [-301, -287], [-273, -259], [-257, -242]];
  for (const [za, zb, h] of terr) {
    for (const [x0, x1] of comps) {
      const z0 = za + 3.5, z1 = zb - 1.5;
      const hb = (a0, b0, a1, b1) => push('hedge', boxMM(a0, h - 0.3, b0, a1, h + 0.55, b1), null, '#ffffff', 0.15);
      hb(x0, z0, x1, z0 + 0.5); hb(x0, z1 - 0.5, x1, z1); hb(x0, z0, x0 + 0.5, z1); hb(x1 - 0.5, z0, x1, z1);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      hb(mx - 3, mz - 0.25, mx + 3, mz + 0.25); hb(mx - 0.25, mz - 3, mx + 0.25, mz + 3);
      for (const [px, pz] of [[x0 + 0.3, z0 + 0.3], [x1 - 0.3, z0 + 0.3], [x0 + 0.3, z1 - 0.3], [x1 - 0.3, z1 - 0.3], [mx, mz]]) {
        const s = px === mx ? 1.5 : 1;
        inst(INST.topiary, null, new V3(px, h, pz), 0, new V3(0.9 * s, 2.6 * s, 0.9 * s), '#3f5a2c');
      }
    }
  }
  // bassin
  const bz = -82, bh = 15.5;
  push('ashlar', new THREE.CylinderGeometry(3.6, 3.6, 0.9, 32, 1, true).translate(-280, bh + 0.2, bz), null, '#eee6d8');
  push('ashlar', new THREE.CylinderGeometry(3.3, 3.3, 0.9, 32, 1, true).translate(-280, bh + 0.2, bz), null, '#eee6d8');
  push('ashlar', new THREE.RingGeometry(3.3, 3.6, 32).rotateX(-Math.PI / 2).translate(-280, bh + 0.65, bz), null, '#eee6d8');
  return { bassin: new V3(-280, bh + 0.4, bz) };
}

/* ------------------------------------------------------------------ cimetière */
function buildCemetery() {
  const x0 = -70, x1 = -10, z0 = -264, z1 = -216, hc = ZONES[1].h;
  const wall = (a0, b0, a1, b1) => {
    push('rubble', boxMM(a0, hc - 1.5, b0, a1, hc + 2.3, b1), null, '#f2ebdf');
    push('ashlar', boxMM(a0 - 0.05, hc + 2.3, b0 - 0.05, a1 + 0.05, hc + 2.42, b1 + 0.05), null, '#e3dac8');
  };
  wall(x0, z0, x1, z0 + 0.5); wall(x0, z1 - 0.5, x1, z1); wall(x0, z0, x0 + 0.5, z1);
  wall(x1 - 0.5, z0, x1, -224); wall(x1 - 0.5, -219, x1, z1);
  const greys = ['#c9c4b8', '#b3aea3', '#9d998f', '#d8d2c4', '#7f7c76', '#bdb3a0'];
  for (let z = z0 + 3; z < z1 - 2; z += 2.3) for (let x = x0 + 2.5; x < x1 - 2; x += 1.7) {
    if (Math.abs(x + 40) < 2.2 || Math.abs(z + 240) < 1.6 || R() < 0.25) continue;
    const c = pick(greys);
    inst(INST.tomb, null, new V3(x, hc + 0.15, z + 0.2), 0, new V3(0.9, 0.35, 1.9), c);
    if (R() < 0.3) { inst(INST.tomb, null, new V3(x, hc + 0.9, z - 0.8), 0, new V3(0.08, 1.3, 0.1), c); inst(INST.tomb, null, new V3(x, hc + 1.2, z - 0.8), 0, new V3(0.6, 0.08, 0.1), c); }
    else inst(INST.tomb, null, new V3(x, hc + 0.7, z - 0.8), 0, new V3(0.75, rr(0.7, 1.1), 0.14), c);
  }
  // les deux tombes jumelles couvertes de lierre, contre le mur
  for (const x of [-29.3, -28.1]) {
    inst(INST.tomb, null, new V3(x, hc + 0.55, z0 + 0.75), 0, new V3(0.62, 0.9, 0.12), '#cfc8b8');
    push('hedge', boxMM(x - 0.55, hc - 0.1, z0 + 0.85, x + 0.55, hc + 0.4, z0 + 2.7), null, '#9fbf7a', 0.1);
  }
}

/* ------------------------------------------------------------------ arbres */
const crownGeos = [0, 1, 2].map(seed => {
  let g = new THREE.IcosahedronGeometry(1, 2); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const p = g.attributes.position, v = new V3(), col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const n = v.clone().normalize();
    const d = 0.78 + 0.5 * fbm(n.x * 1.7 + seed * 3.1 + n.z * 0.9 + 5, n.y * 1.7 + n.z * 1.3 + 2, 3) + (R() - 0.5) * 0.09;
    v.copy(n).multiplyScalar(d); if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.5;
    p.setXYZ(i, v.x, v.y, v.z);
    const sh = (0.42 + 0.58 * (n.y + 1) / 2) * (0.8 + 0.4 * R());
    col[i * 3] = sh; col[i * 3 + 1] = sh; col[i * 3 + 2] = sh;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals(); return g;
});
function treeColor(autumn) {
  const c = new THREE.Color();
  if (autumn) c.setHSL(rr(0.1, 0.15), rr(0.35, 0.5), rr(0.24, 0.32)); else c.setHSL(rr(0.2, 0.28), rr(0.28, 0.45), rr(0.17, 0.26));
  return '#' + c.getHexString();
}
function addTree(x, z, kind = 'leaf', scale = 1) {
  const y = heightAt(x, z);
  if (kind === 'poplar') {
    const h = rr(16, 23), r = rr(1.8, 2.5);
    inst(INST.trunk, null, new V3(x, y - 0.3, z), R() * 6, new V3(0.4, 5, 0.4), '#4a4238');
    inst(INST['crown' + Math.floor(R() * 3)], null, new V3(x, y + 2.5 + h * 0.5, z), R() * 6, new V3(r, h * 0.5, r), treeColor(R() < 0.25));
    return;
  }
  const r = rr(2.8, 5.4) * scale, th = rr(1.8, 3.0), autumn = R() < 0.12;
  const col = treeColor(autumn);
  inst(INST.trunk, null, new V3(x, y - 0.3, z), R() * 6, new V3(0.28 * scale + 0.1, th + r * 0.9, 0.28 * scale + 0.1), '#4d4439');
  inst(INST['crown' + Math.floor(R() * 3)], null, new V3(x, y + th + r * 0.95, z), R() * 6, new V3(r, r * rr(0.85, 1.05), r), col);
  for (let k = 0; k < 2; k++) {
    const an = R() * Math.PI * 2, rad = r * 0.55;
    inst(INST['crown' + Math.floor(R() * 3)], null, new V3(x + Math.cos(an) * rad, y + th + r * rr(0.55, 1.2), z + Math.sin(an) * rad), R() * 6, new V3(r * rr(0.55, 0.75), r * rr(0.5, 0.7), r * rr(0.55, 0.75)), col);
  }
}

/* ================================================================== construction */
let sun, sky, water, envScene, pmrem, envRT, glassMat, lampMat, walkPath;
const labels = [];

async function main() {
  await tick('Modelage du terrain');
  prepRoads(); buildRoadGrid();
  for (let iz = 0; iz <= NZ; iz++) for (let ix = 0; ix <= NX; ix++) {
    const x = X0 + ix * DX, z = Z0 + iz * DX; let h = Hz(x, z);
    const q = roadQuery(x, z);
    if (q.ri >= 0) { const sw = ROADS[q.ri].sw || 0; const w = sstep(4.5 + sw, 1.2 + sw, q.dEdge); if (w > 0) h = lerp(h, q.h - 0.06, w); }
    HG[iz * (NX + 1) + ix] = h;
  }
  const detailTex = toTex(detailCanvas(), false);
  const addDetail = (mat, rep) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: detailTex };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D detailMap;')
        .replace('#include <map_fragment>', `#include <map_fragment>\n diffuseColor.rgb *= texture2D(detailMap, vMapUv * vec2(${rep[0].toFixed(1)}, ${rep[1].toFixed(1)})).rgb * 2.0;`);
    };
  };
  // carte des couleurs du sol
  const CW = 1024, CH = 640;
  const groundC = pixels(CW, CH, (px, py) => groundColor(X0 + (px + 0.5) / CW * (X1 - X0), Z0 + (py + 0.5) / CH * (Z1 - Z0)));
  {
    const g = groundC.getContext('2d');
    const rect = (x0, z0, x1, z1, col) => { g.fillStyle = col; g.fillRect((x0 - X0) / (X1 - X0) * CW, (z0 - Z0) / (Z1 - Z0) * CH, (x1 - x0) / (X1 - X0) * CW, (z1 - z0) / (Z1 - Z0) * CH); };
    rect(-47, -60, 17, -22.5, '#c4b595');
    rect(-335, -150, -225, -100, '#c8bc9f');
    rect(-322, -100, -238, -27.5, '#c6b99c');
    for (const [za, zb] of [[-100, -75], [-75, -50], [-50, -27.5]]) for (const [x0, x1] of [[-318, -303], [-301, -287], [-273, -259], [-257, -242]]) rect(x0, za + 3.5, x1, zb - 1.5, '#6e8c3d');
    rect(-300, -27.5, -260, 22, '#7a9442');
    rect(-72, -266, -8, -214, '#8d9467');
    rect(574, -66, 606, -50, '#c2b597'); rect(576, -50, 604, -40, '#6f8a3e');
    rect(-42, -264, -38, -216, '#b1a78f'); rect(-70, -241.5, -10, -238.5, '#b1a78f');
  }
  const groundTex = toTex(groundC); groundTex.wrapS = groundTex.wrapT = THREE.ClampToEdgeWrapping;
  const tg = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, NX, NZ).rotateX(-Math.PI / 2).translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  { const p = tg.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, HG[i]); tg.computeVertexNormals(); }
  const terrainMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.97 });
  addDetail(terrainMat, [(X1 - X0) / 7, (Z1 - Z0) / 7]);
  const terrain = new THREE.Mesh(tg, terrainMat); terrain.receiveShadow = true; scene.add(terrain);
  // terrain lointain
  {
    const og = new THREE.PlaneGeometry(9000, 9000, 180, 180).rotateX(-Math.PI / 2).translate(0, 0, -50);
    const p = og.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i); const inside = x > X0 && x < X1 && z > Z0 && z < Z1;
      p.setY(i, H0(x, z) - (inside ? 3 : 0) + (Math.abs(z - 155) > 60 ? sstep(700, 2500, Math.hypot(x, z)) * 25 * fbm(x * 0.001, z * 0.001) : 0));
      const gc = groundColor(x, z); c.setRGB(gc[0] / 255, gc[1] / 255, gc[2] / 255, THREE.SRGBColorSpace);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    og.setAttribute('color', new THREE.BufferAttribute(col, 3)); og.computeVertexNormals();
    const om = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    const outer = new THREE.Mesh(og, om); outer.receiveShadow = true; scene.add(outer);
  }
  // l'Oise
  {
    const wn = toTex(waterNormalCanvas(), false); wn.repeat.set(9000 / 14, 90 / 14);
    const wm = new THREE.MeshStandardMaterial({ color: '#27403a', roughness: 0.07, metalness: 0.05, normalMap: wn, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.3 });
    water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 90).rotateX(-Math.PI / 2).translate(0, -1.3, 155), wm);
    water.receiveShadow = true; scene.add(water);
  }

  await tick('Tracé des rues');
  const roadTex = { main: toTex(roadCanvas('main')), lane: toTex(roadCanvas('lane')), rail: toTex(roadCanvas('rail')) };
  const swMat = new THREE.MeshStandardMaterial({ map: toTex(sidewalkCanvas()), roughness: 0.92, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  ROADS.forEach((r, ri) => {
    const S = r.S, n = S.length, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
    for (let i = 0; i < n; i++) {
      const a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)]; const l = Math.hypot(b.x - a.x, b.z - a.z);
      const tx = (b.x - a.x) / l, tz = (b.z - a.z) / l, nx = -tz, nz = tx, y = S[i].h + r.lift;
      pos.set([S[i].x + nx * r.hw, y, S[i].z + nz * r.hw, S[i].x - nx * r.hw, y, S[i].z - nz * r.hw], i * 6);
      uv.set([0, S[i].s / r.texLen, 1, S[i].s / r.texLen], i * 4);
      if (i < n - 1) { const A = 2 * i, Bq = A + 1, Cq = A + 2, Dq = A + 3; idx.push(A, Cq, Bq, Bq, Cq, Dq); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ map: roadTex[r.tex], roughness: r.tex === 'rail' ? 1 : 0.96, envMapIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -1 - ri * 0.2, polygonOffsetUnits: -2 - ri });
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; scene.add(mesh);
    if (r.sw) {   // trottoirs avec bordures, interrompus aux carrefours
      const P = [], UV = [];
      const quad = (a, b, c, d, ua, ub) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); UV.push(...ua[0], ...ub[0], ...ub[1], ...ua[0], ...ub[1], ...ua[1]); };
      for (const side of [1, -1]) for (let i = 0; i < n - 1; i++) {
        const pt = (j, off, dy) => { const a = S[Math.max(0, j - 1)], b = S[Math.min(n - 1, j + 1)], l = Math.hypot(b.x - a.x, b.z - a.z); const nx = -(b.z - a.z) / l * side, nz = (b.x - a.x) / l * side; return [S[j].x + nx * off, S[j].h + r.lift + dy, S[j].z + nz * off]; };
        let ok = true;
        for (const j of [i, i + 1]) { const c = pt(j, r.hw + r.sw / 2, 0); const q = roadQuery(c[0], c[2]); if (q.ri >= 0 && ROADS[q.ri] !== r) ok = false; }
        if (!ok) continue;
        const v0 = S[i].s / 1.5, v1 = S[i + 1].s / 1.5, u = r.sw / 1.5;
        quad(pt(i, r.hw, 0.14), pt(i + 1, r.hw, 0.14), pt(i + 1, r.hw + r.sw, 0.14), pt(i, r.hw + r.sw, 0.14), [[0, v0], [u, v0]], [[0, v1], [u, v1]]);
        quad(pt(i, r.hw, -0.02), pt(i + 1, r.hw, -0.02), pt(i + 1, r.hw, 0.14), pt(i, r.hw, 0.14), [[0, v0], [0.1, v0]], [[0, v1], [0.1, v1]]);
        quad(pt(i, r.hw + r.sw, -0.5), pt(i + 1, r.hw + r.sw, -0.5), pt(i + 1, r.hw + r.sw, 0.14), pt(i, r.hw + r.sw, 0.14), [[0, v0], [0.4, v0]], [[0, v1], [0.4, v1]]);
      }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); sg.computeVertexNormals();
      const sm = new THREE.Mesh(sg, swMat); sm.receiveShadow = true; sm.castShadow = true; scene.add(sm);
    }
    if (r.tex === 'rail') {
      for (let i = 0; i < n - 1; i++) {
        const a = S[i], b = S[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), ry = Math.atan2(-(b.z - a.z), b.x - a.x);
        for (const off of [-0.72, 0.72]) {
          const M = mat4((a.x + b.x) / 2, (a.h + b.h) / 2 + r.lift + 0.08, (a.z + b.z) / 2, ry);
          push('metal', boxMM(-len / 2 - 0.02, 0, off - 0.04, len / 2 + 0.02, 0.15, off + 0.04), M, '#77736d');
        }
      }
    }
  });

  await tick("Construction de l'église");
  buildChurch();
  await tick('Construction du château');
  const ch = buildChateau();
  buildCemetery();

  await tick('Maisons et murs de pierre');
  // bâtiments remarquables
  const G = road('gaulle');
  const special = (sx, side, o) => {
    const f = frameAt(G, sx); const nx = -f.tz * side, nz = f.tx * side; const sb = G.hw + G.sw + 0.3, off = sb + o.D / 2;
    const x = f.x + nx * off, z = f.z + nz * off, a = Math.atan2(-nx, -nz);
    return buildHouse({ ...o, x, z, a, baseY: heightAt(f.x + nx * sb, f.z + nz * sb) });
  };
  const sRav = sNear(G, 12, 38);
  const rav = special(sRav, 1, { W: 12, D: 10, floors: 3, wallColor: '#e8dcc0', roof: 'tile', roofColor: '#fff0e4', shutter: null, shopfront: '#5b2a22', doorI: 0 });
  const mai = special(sRav + 2, -1, { W: 16, D: 11, floors: 2, wall: 'plaster', wallColor: '#ece3cf', roof: 'slate', hip: true, shutter: null, doorI: 2, door: '#3b4755', noChimney: true });
  // décor : enseigne, campanile, drapeau
  const signTex = (txt, bg, fg, w = 1024, h = 128, font = 'bold 76px Georgia, serif') => {
    const t = toTex(textCanvas(w, h, (c, W2, H2) => { c.fillStyle = bg; c.fillRect(0, 0, W2, H2); c.fillStyle = fg; c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, W2 / 2, H2 / 2 + 4); }));
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
  };
  const plane = (tex, w, h, M, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide }));
    m.applyMatrix4(new THREE.Matrix4().multiplyMatrices(M, mat4(x, y, z, ry))); m.castShadow = true; scene.add(m); return m;
  };
  plane(signTex('AUBERGE RAVOUX', '#e8dcc0', '#5b2a22'), 8, 1, rav.M, 0, 3.15, 10 / 2 + 0.03);
  plane(signTex('MAIRIE', '#ece3cf', '#2f3a48', 512, 128, 'bold 80px Georgia, serif'), 3.2, 0.8, mai.M, 0, 3.05, 11 / 2 + 0.03);
  {
    const M = mai.M, top = mai.Hw + mai.rise;
    push('plaster', boxMM(-0.9, top - 1.5, -0.9, 0.9, top + 2.2, 0.9), M, '#ece3cf');
    push('slate', new THREE.ConeGeometry(1.45, 2.0, 4, 1).rotateY(Math.PI / 4).translate(0, top + 3.2, 0), M);
    const clock = toTex(textCanvas(256, 256, (c) => { c.fillStyle = '#ece3cf'; c.fillRect(0, 0, 256, 256); c.fillStyle = '#f7f3ea'; c.beginPath(); c.arc(128, 128, 110, 0, 7); c.fill(); c.strokeStyle = '#222'; c.lineWidth = 6; c.stroke(); for (let k = 0; k < 12; k++) { const an = k / 12 * Math.PI * 2; c.beginPath(); c.moveTo(128 + Math.sin(an) * 92, 128 - Math.cos(an) * 92); c.lineTo(128 + Math.sin(an) * 104, 128 - Math.cos(an) * 104); c.stroke(); } c.lineWidth = 8; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + 55, 128 + 20); c.moveTo(128, 128); c.lineTo(128 - 5, 40); c.stroke(); }));
    plane(clock, 1.3, 1.3, M, 0, top + 0.9, 0.92);
    const flag = toTex(textCanvas(300, 200, (c) => { c.fillStyle = '#1f3f8f'; c.fillRect(0, 0, 100, 200); c.fillStyle = '#f5f5f0'; c.fillRect(100, 0, 100, 200); c.fillStyle = '#d42a2f'; c.fillRect(200, 0, 100, 200); }));
    push('metal', boxMM(-0.03, 5.9, 5.5, 0.03, 5.96, 7.4), M, '#333');
    plane(flag, 1.5, 1.0, M, 0, 5.4, 6.7, Math.PI / 2);
  }
  // plaques de rue
  const plaque = (txt, r, s, side) => {
    const f = frameAt(r, s); const nx = -f.tz * side, nz = f.tx * side, po = r.hw + (r.sw ? r.sw - 0.3 : 0.7); const px = f.x + nx * po, pz = f.z + nz * po;
    const y = heightAt(px, pz); const ry = Math.atan2(-f.tx, -f.tz);
    const M = mat4(px, y, pz, ry);
    push('metal', boxMM(-0.05, 0, -0.05, 0.05, 3.1, 0.05), M, '#2e3a36');
    const t = toTex(textCanvas(640, 200, (c, w, h) => { c.fillStyle = '#1c3b73'; c.fillRect(0, 0, w, h); c.strokeStyle = '#f2f2ee'; c.lineWidth = 8; c.strokeRect(14, 14, w - 28, h - 28); c.fillStyle = '#f2f2ee'; c.textAlign = 'center'; c.font = '500 34px Georgia, serif'; c.fillText(txt[0], w / 2, 70); c.font = 'bold 62px Georgia, serif'; c.fillText(txt[1], w / 2, 140); }));
    plane(t, 1.2, 0.38, M, 0, 2.75, 0.06);
  };
  plaque(['RUE DU', 'GÉNÉRAL DE GAULLE'], G, sNear(G, 38, 40), 1);

  // maisons le long des rues
  const vhR = road('vh'), sSplit = sNear(vhR, 432, -20);
  const vhHouses = [];
  for (const r of ROADS) {
    if (r.houses === 'none') continue;
    const sw = r.sw || 0;
    for (const side of [1, -1]) {
      let s = 3 + R() * 5;
      while (s < r.len - 4) {
        const f0 = frameAt(r, s);
        const villa = r.id === 'vh' && s > sSplit;
        const dense = !villa && ((r.id === 'gaulle' && Math.abs(f0.x) < 330) || r.id === 'vh' || (r.id === 'montee' && f0.z > -160));
        const W = villa ? rr(9, 13) : rr(7, 13), D = rr(7, 10.5);
        const g = frameAt(r, s + W / 2), nx = -g.tz * side, nz = g.tx * side;
        let setback = villa ? sw + rr(4, 8) : dense ? sw + rr(0.1, 0.6) : sw + rr(2, 7);
        // coteau : si le terrain monte derrière le trottoir, maison en retrait sur un jardinet en terrasse
        const edge = r.hw + sw + 0.3;
        const rise0 = heightAt(g.x + nx * (edge + 7), g.z + nz * (edge + 7)) - heightAt(g.x + nx * edge, g.z + nz * edge);
        const terrace = (r.id === 'vh' || r.id === 'montee' || r.id === 'zundert') && rise0 > 0.9;
        if (terrace) setback = Math.max(setback, sw + rr(3.4, 4.6));
        const off = r.hw + setback + D / 2, cx = g.x + nx * off, cz = g.z + nz * off, a = Math.atan2(-nx, -nz);
        const rect = rectOf(cx, cz, a, W, D);
        if (R() < (villa ? 0.6 : dense ? 0.93 : 0.5) && canPlace(rect)) {
          const floors = villa ? pick([2, 2, 3]) : dense ? pick([1, 2, 2, 2, 3]) : pick([1, 1, 2, 2]);
          const roadTop = g.h + r.lift + (sw ? 0.14 : 0);
          const baseY = terrace ? THREE.MathUtils.clamp(heightAt(cx, cz) - 0.3, roadTop + 0.6, roadTop + 2.8)
                                : heightAt(g.x + nx * (r.hw + setback), g.z + nz * (r.hw + setback)) - 0.05;
          const hs = buildHouse({ x: cx, z: cz, a, W, D, floors, baseY, hip: villa && R() < 0.4,
            wall: R() < 0.3 ? 'rubble' : 'plaster', roof: villa || R() < 0.22 ? (villa && R() < 0.5 ? 'tile' : 'slate') : 'tile', gableFront: !villa && R() < 0.18 });
          if (terrace || villa) frontGarden(hs, D, setback - sw, roadTop - baseY, terrace);
          if (r.id === 'vh') vhHouses.push({ side, s: s + W / 2, hs, terrace });
          const gap = villa ? rr(8, 22) : dense ? (R() < 0.55 ? 0 : rr(2, 8)) : rr(8, 30);
          if (gap > 2 && (dense || villa)) roadWall(r, side, s + W + 0.3, s + W + gap - 0.3, sw + 0.3);
          s += W + gap;
        } else {
          const stp = dense ? rr(3, 6) : rr(8, 20);
          if (dense || villa || R() < 0.35) roadWall(r, side, s, s + stp, sw + (dense ? 0.3 : 0.7));
          s += stp;
        }
      }
    }
  }

  // numéros de rue : impairs côté vallée, pairs côté coteau ; la rue du Docteur-Gachet reprend à 1
  const plates = [];
  for (const side of [1, -1]) {
    let prevA = 0, prevB = 0;
    for (const h of vhHouses.filter(h => h.side === side).sort((p, q) => p.s - q.s)) {
      const gach = h.s > sSplit, rel = gach ? h.s - sSplit : h.s;
      const base = 2 * Math.round(rel / (gach ? 4.4 : 5.5)) + (side < 0 ? 2 : 1);
      const n = Math.max((gach ? prevB : prevA) + 2, base);
      if (gach) prevB = n; else prevA = n;
      h.num = n; h.gach = gach;
    }
  }
  // le restaurant du n° 24
  const evens = vhHouses.filter(h => h.side < 0 && !h.gach && !h.terrace);
  if (evens.length) {
    const resto = evens.reduce((p, q) => Math.abs(q.num - 24) < Math.abs(p.num - 24) ? q : p);
    const delta = 24 - resto.num;
    for (const h of vhHouses) if (h.side < 0 && !h.gach) h.num = Math.max(2, h.num + delta);
    const { M, W, D } = resto.hs;
    push('paint', new THREE.BoxGeometry(W - 1.2, 0.05, 1.4).rotateX(0.32).translate(0, 2.62, D / 2 + 0.68), M, '#8c2a24');
    push('paint', boxMM(-(W - 1.2) / 2, 2.2, D / 2 + 1.3, (W - 1.2) / 2, 2.42, D / 2 + 1.36), M, '#7a221d');
    plane(signTex('RESTAURANT', '#8c2a24', '#f3ead8', 1024, 128, 'bold 70px Georgia, serif'), Math.min(4, W - 2), 0.45, M, 0, 3.1, D / 2 + 0.04);
    resto.resto = true;
  }
  for (const h of vhHouses) {
    const { M, doorX, W, D } = h.hs;
    const px = doorX + 0.95 < W / 2 - 0.2 ? doorX + 0.95 : doorX - 0.95;
    plates.push({ M, x: px, y: 2.35, z: D / 2 + 0.03, n: h.num });
  }

  // la maison du docteur Gachet, 78 rue du Docteur-Gachet
  buildGachet(plates);
  numberPlates(plates);

  // plaques de rue, passages piétons, lampadaires, voitures
  plaque(['RUE', 'VICTOR HUGO'], vhR, 5, -1);
  plaque(['RUE DU', 'DOCTEUR GACHET'], vhR, sSplit + 2, -1);
  plaque(['RUE DE', 'ZUNDERT'], road('zundert'), 12, 1);
  crossing(road('zundert'), sNear(road('zundert'), 146.5, -1));
  crossing(G, sRav + 16);
  crossing(G, sNear(G, 58, 36) + 9);
  for (const r of ROADS) {
    if (!r.sw && r.id !== 'montee') continue;
    let side = 1;
    for (let s = 10; s < r.len - 6; s += 24) {
      const f = frameAt(r, s); if (r.id === 'gaulle' && Math.abs(f.x) > 420) continue;
      if (r.id === 'montee' && f.z < -150) break;
      const o = r.hw + (r.sw ? r.sw - 0.35 : 0.6), nx = -f.tz * side, nz = f.tx * side;
      const x = f.x + nx * o, z = f.z + nz * o;
      side = -side;
      if (pointInHouse(x, z, 0.4) || inRects(x, z, EXCL)) continue;
      const q = roadQuery(x, z); if (q.ri >= 0 && ROADS[q.ri] !== r && q.dEdge < 0.5) continue;
      lamp(x, f.h + r.lift + (r.sw ? 0.14 : 0), z, Math.atan2(nx, nz));
    }
  }
  const carCols = ['#8a1f1f', '#e8e6e1', '#2c3e57', '#3b3b3b', '#9aa3a8', '#5b6b4a', '#b9a27a', '#dcdad2', '#1f2a36'];
  for (const [rid, n] of [['gaulle', 14], ['vh', 4], ['zundert', 2]]) {
    const r = road(rid);
    for (let k = 0; k < n; k++) {
      const s = rr(15, Math.min(r.len - 15, rid === 'gaulle' ? 700 : r.len)), f = frameAt(r, rid === 'gaulle' ? s + 260 : s);
      if (rid === 'gaulle' && Math.abs(f.x) > 380) continue;
      const side = R() < 0.5 ? 1 : -1, o = r.hw - 0.95, x = f.x - f.tz * side * o, z = f.z + f.tx * side * o;
      if (roadQuery(x, z).ri >= 0 && ROADS[roadQuery(x, z).ri] !== r) continue;
      car(x, f.h + r.lift, z, Math.atan2(-f.tz, f.tx) + (side > 0 ? 0 : Math.PI), pick(carCols));
    }
  }

  await tick('Plantation des arbres');
  const TREE_EXCL = [[-50, 20, -62, -20], [14, 64, -66, -24], [-336, -224, -152, -98], [-324, -236, -100, 24], [-74, -6, -268, -212], [570, 612, -68, -34]];
  let placed = 0;
  for (let k = 0; k < 16000 && placed < 1250; k++) {
    const x = rr(X0 + 10, X1 - 10), z = rr(Z0 + 10, Z1 - 10);
    if (z > 116 && z < 194) continue;
    const forest = fbm(x * 0.006 + 40, z * 0.006 + 9, 3) > 0.58;
    let p = z > 20 ? 0.16 : z > -235 ? 0.5 : 0.03;
    if (x < -180 && z < -130 && z > -300) p = 0.95;
    if (forest && z < 60) p = Math.max(p, 0.85);
    if (z > 194) p = 0.3;
    if (R() > p) continue;
    if (inRects(x, z, TREE_EXCL)) continue;
    if (z > 78 && z < 98) continue;
    const q = roadQuery(x, z); if (q.ri >= 0 && q.dEdge < 3 + (ROADS[q.ri].sw || 0)) continue;
    if (pointInHouse(x, z, 3)) continue;
    addTree(x, z, 'leaf', rr(0.8, 1.15)); placed++;
  }
  for (let x = X0 + 15; x < X1 - 10; x += rr(8, 13)) {
    if (R() < 0.4) continue;
    addTree(x, rr(112, 115.5), 'poplar');
  }
  for (let x = X0 + 15; x < X1 - 10; x += rr(9, 15)) if (R() < 0.6) addTree(x, rr(196, 200), 'poplar');
  // tilleuls de la cour du château
  for (const sx of [-1, 1]) for (let z = -148; z <= -104; z += 7) addTree(-280 + sx * 44, z, 'leaf', 0.7);

  await tick('Assemblage');
  const mats = {
    plaster: new THREE.MeshStandardMaterial({ map: toTex(plasterCanvas()), vertexColors: true, roughness: 0.93 }),
    rubble: new THREE.MeshStandardMaterial({ map: toTex(rubbleCanvas()), vertexColors: true, roughness: 0.96 }),
    ashlar: null, church: null,
    tile: new THREE.MeshStandardMaterial({ map: toTex(tileCanvas()), vertexColors: true, roughness: 0.82, side: THREE.DoubleSide }),
    slate: new THREE.MeshStandardMaterial({ map: toTex(slateCanvas()), vertexColors: true, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide }),
    hedge: new THREE.MeshStandardMaterial({ map: toTex(hedgeCanvas()), vertexColors: true, roughness: 1 }),
    dark: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6 }),
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.35 }),
    lawn: new THREE.MeshStandardMaterial({ map: toTex(pixels(256, 256, (x, y) => { const k = 0.7 + fbm(x / 256 * 16, y / 256 * 16, 3, 16) * 0.5 + (Math.random() - 0.5) * 0.2; return [96 * k, 124 * k, 58 * k]; })), vertexColors: true, roughness: 1 }),
  };
  const ashTex = toTex(ashlarCanvas());
  mats.ashlar = new THREE.MeshStandardMaterial({ map: ashTex, vertexColors: true, roughness: 0.9 });
  mats.church = new THREE.MeshStandardMaterial({ map: ashTex, vertexColors: true, roughness: 0.92 });
  for (const k of ['rubble', 'ashlar', 'church', 'tile', 'slate']) { mats[k].bumpMap = mats[k].map; mats[k].bumpScale = 1.2; }
  for (const k in B) {
    if (!B[k].length) continue;
    const g = mergeGeometries(B[k], false); B[k].forEach(x => x.dispose());
    const m = new THREE.Mesh(g, mats[k]); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  }
  const unit = new THREE.BoxGeometry(1, 1, 1);
  glassMat = new THREE.MeshStandardMaterial({ color: '#1b242b', roughness: 0.1, metalness: 0.55, emissive: '#ffb35c', emissiveIntensity: 0 });
  const lancetShape = new THREE.Shape(); lancetShape.moveTo(-0.5, 0); lancetShape.lineTo(0.5, 0); lancetShape.lineTo(0.5, 0.68); lancetShape.quadraticCurveTo(0.47, 0.9, 0, 1); lancetShape.quadraticCurveTo(-0.47, 0.9, -0.5, 0.68); lancetShape.closePath();
  const archShape = new THREE.Shape(); archShape.moveTo(-0.5, 0); archShape.lineTo(0.5, 0); archShape.lineTo(0.5, 0.72); archShape.quadraticCurveTo(0.5, 1, 0, 1); archShape.quadraticCurveTo(-0.5, 1, -0.5, 0.72); archShape.closePath();
  const lancetGeo = new THREE.ShapeGeometry(lancetShape, 8).translate(0, -0.5, 0);
  const archGeo = new THREE.ShapeGeometry(archShape, 8).translate(0, -0.5, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 1, 7).translate(0, 0.5, 0);
  const crownMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const mk = (geo, mat, list, cast = true) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => { im.setMatrixAt(i, it.m); if (it.c) im.setColorAt(i, tmpC.set(it.c)); });
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = cast; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); return im;
  };
  mk(unit, glassMat, INST.glass, false);
  lampMat = new THREE.MeshStandardMaterial({ color: '#d9d4c4', roughness: 0.2, metalness: 0.1, emissive: '#ffcf8a', emissiveIntensity: 0, transparent: true, opacity: 0.85 });
  mk(unit, lampMat, INST.lampGlass, false);
  mk(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), INST.flower, false);
  mk(unit, new THREE.MeshStandardMaterial({ roughness: 0.85 }), INST.frame);
  mk(unit, new THREE.MeshStandardMaterial({ color: '#efece4', roughness: 0.6 }), INST.mull, false);
  mk(unit, new THREE.MeshStandardMaterial({ roughness: 0.7 }), INST.shutter);
  mk(unit, new THREE.MeshStandardMaterial({ roughness: 0.75 }), INST.door);
  mk(unit, new THREE.MeshStandardMaterial({ roughness: 0.9 }), INST.tomb);
  mk(lancetGeo, new THREE.MeshStandardMaterial({ color: '#d6ccb9', roughness: 0.9, side: THREE.DoubleSide }), INST.lancetFrame, false);
  mk(lancetGeo, new THREE.MeshStandardMaterial({ color: '#202a36', roughness: 0.25, metalness: 0.4, side: THREE.DoubleSide }), INST.lancet, false);
  mk(archGeo, new THREE.MeshStandardMaterial({ color: '#15120f', roughness: 1, side: THREE.DoubleSide }), INST.belfry, false);
  mk(new THREE.ConeGeometry(0.5, 1, 10), new THREE.MeshStandardMaterial({ roughness: 1, map: mats.hedge.map }), INST.topiary.map(t => { t.m.multiply(new THREE.Matrix4().makeTranslation(0, 0.5, 0)); return t; }));
  mk(trunkGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), INST.trunk);
  crownGeos.forEach((g, i) => mk(g, crownMat, INST['crown' + i]));
  // eau du bassin
  const bw = new THREE.Mesh(new THREE.CircleGeometry(3.3, 32).rotateX(-Math.PI / 2).translate(ch.bassin.x, ch.bassin.y, ch.bassin.z), water.material);
  scene.add(bw);

  /* ciel et lumière */
  sky = new Sky(); sky.scale.setScalar(10000); scene.add(sky);
  const U = sky.material.uniforms; U.turbidity.value = 6.5; U.rayleigh.value = 1.5; U.mieCoefficient.value = 0.005; U.mieDirectionalG.value = 0.82;
  envScene = new THREE.Scene(); const se = new THREE.Mesh(sky.geometry, sky.material); se.scale.setScalar(1000); envScene.add(se);
  pmrem = new THREE.PMREMGenerator(renderer);
  sun = new THREE.DirectionalLight('#fff1dc', 4); sun.castShadow = true;
  sun.shadow.mapSize.set(small ? 2048 : 4096, small ? 2048 : 4096);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.35;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 1400;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#cfdcea', '#4b5236', 0.25));
  scene.fog = new THREE.FogExp2('#b9c6cf', 0.00085);

  /* lieux */
  const vh = road('vh');
  walkPath = { r: vh, s: 0 };
  const fv = frameAt(vh, sNear(vh, 290, -10)), fg = frameAt(vh, sNear(vh, 500, -24)), fz = frameAt(road('zundert'), 30);
  labels.push(
    { t: "Église Notre-Dame-de-l'Assomption", s: 'XIIᵉ–XIIIᵉ s. · peinte par Van Gogh en 1890', p: new V3(-7, H_EGLISE + 34, -40), v: 'eglise' },
    { t: "Château d'Auvers", s: 'XVIIᵉ s. · jardins en terrasses', p: new V3(-280, 44, -125), v: 'chateau' },
    { t: 'Rue Victor-Hugo', s: 'De la rue de Zundert à la rue du Docteur-Gachet', p: new V3(fv.x, fv.h + 13, fv.z), v: 'vh' },
    { t: 'Rue du Docteur-Gachet', s: '', p: new V3(fg.x, fg.h + 12, fg.z), v: 'vh' },
    { t: 'Rue de Zundert', s: '', p: new V3(fz.x, fz.h + 10, fz.z), v: 'vh' },
    { t: 'Maison du Docteur Gachet', s: 'N° 78 · jardin en terrasses, atelier troglodyte', p: new V3(590, ZONES.at(-1).h + 17, -58), v: 'gachet' },
    { t: 'Rue du Général-de-Gaulle', s: 'La grand-rue', p: new V3(-130, 12, 41), v: 'ensemble' },
    { t: 'Auberge Ravoux', s: 'Maison de Van Gogh, 1890', p: new V3(rav.M.elements[12], rav.M.elements[13] + 15, rav.M.elements[14]), v: 'ensemble' },
    { t: 'Mairie', s: '', p: new V3(mai.M.elements[12], mai.M.elements[13] + 16, mai.M.elements[14]), v: 'ensemble' },
    { t: 'Cimetière', s: 'Tombes de Vincent et Théo van Gogh', p: new V3(-40, ZONES[1].h + 8, -240), v: 'plateau' },
    { t: 'Plateau des blés', s: '', p: new V3(110, 48, -320), v: 'plateau' },
    { t: "L'Oise", s: '', p: new V3(240, 4, 155), v: 'oise' },
  );
  const tagsEl = document.getElementById('tags');
  for (const L of labels) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tag';
    b.innerHTML = `<span class="box"><span class="t"></span>${L.s ? '<span class="s"></span>' : ''}</span><span class="stem"></span><span class="dot"></span>`;
    b.querySelector('.t').textContent = L.t; if (L.s) b.querySelector('.s').textContent = L.s;
    b.addEventListener('click', () => go(L.v));
    tagsEl.appendChild(b); L.el = b;
  }

  setTime(17.5, true);
  document.getElementById('loading').hidden = true;
  go('vh', true);
  renderer.setAnimationLoop(frame);
}

/* ------------------------------------------------------------------ heure du jour */
let lastEnv = 0, envTimer = null, sunDir = new V3();
function updateEnv() { if (envRT) envRT.dispose(); envRT = pmrem.fromScene(envScene, 0, 0.1, 3000); scene.environment = envRT.texture; lastEnv = performance.now(); }
function setTime(h, force = false) {
  const df = (h - 7.6) / (19.9 - 7.6);
  const el = THREE.MathUtils.degToRad(41 * Math.sin(Math.PI * df)), az = THREE.MathUtils.degToRad(90 + 180 * df);
  sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  const eld = THREE.MathUtils.radToDeg(el);
  sun.intensity = 4.2 * sstep(-2, 10, eld);
  sun.color.set('#ff9a55').lerp(new THREE.Color('#fff2de'), sstep(0, 28, eld));
  scene.environmentIntensity = 0.3 + 0.5 * sstep(-4, 20, eld);
  const day = new THREE.Color('#b8c6d1'), dusk = new THREE.Color('#d6b596'), night = new THREE.Color('#2b3444');
  scene.fog.color.copy(night).lerp(dusk, sstep(-6, 1, eld)).lerp(day, sstep(4, 22, eld));
  renderer.toneMappingExposure = 0.62 + 0.25 * (1 - sstep(-2, 12, eld));
  glassMat.emissiveIntensity = 1.6 * (1 - sstep(-1, 7, eld));
  lampMat.emissiveIntensity = 4 * (1 - sstep(-2, 5, eld));
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  document.getElementById('hourOut').textContent = `${hh} h ${String(mm).padStart(2, '0')}`;
  clearTimeout(envTimer);
  if (force || performance.now() - lastEnv > 250) updateEnv(); else envTimer = setTimeout(updateEnv, 260);
}

/* ------------------------------------------------------------------ points de vue */
const VIEWS = {
  vh: { pos: [480, 48, 48], tgt: [300, 3, -12] },
  gachet: { pos: [603, 6, -16], tgt: [590, 8, -56], ground: true },
  ensemble: { pos: [330, 150, 320], tgt: [-90, 10, -70] },
  eglise: { pos: [46, 1.8, -50], tgt: [-8, 12.5, -41], ground: true },
  chateau: { pos: [-280, 5, 14], tgt: [-280, 24, -110], ground: true },
  oise: { pos: [150, 6, 156], tgt: [-30, 14, -30], abs: true },
  plateau: { pos: [-160, 30, -330], tgt: [-30, 8, -40], ground: true },
};
let fly = null, walking = false;
function setPressed(v) { document.querySelectorAll('.views button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v))); }
function go(v, instant = false) {
  setPressed(v);
  if (v === 'walk') { startWalk(); return; }
  walking = false;
  const V = VIEWS[v]; if (!V) return;
  const pos = new V3(...V.pos); if (V.ground) pos.y += heightAt(pos.x, pos.z);
  const tgt = new V3(...V.tgt); if (V.ground && v !== 'eglise' && v !== 'chateau') tgt.y += heightAt(tgt.x, tgt.z); if (v === 'gachet') tgt.y = ZONES.at(-1).h + 5; if (v === 'eglise') tgt.y += H_EGLISE;
  if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) { camera.position.copy(pos); controls.target.copy(tgt); controls.update(); fly = null; return; }
  fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt, start: performance.now(), dur: 2600 };
}
function startWalk() {
  walking = true; fly = null; walkPath.s = 4;
  document.querySelector('[data-view="walk"]').textContent = 'Arrêter la promenade';
}
function stopWalk() {
  if (!walking) return; walking = false;
  const b = document.querySelector('[data-view="walk"]'); b.textContent = 'Marcher rue Victor-Hugo'; b.setAttribute('aria-pressed', 'false');
}
document.querySelectorAll('.views button').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.view === 'walk' && walking) { stopWalk(); return; }
  if (walking) stopWalk();
  go(b.dataset.view);
}));
renderer.domElement.addEventListener('pointerdown', () => { fly = null; stopWalk(); });
renderer.domElement.addEventListener('wheel', () => { fly = null; stopWalk(); }, { passive: true });
document.getElementById('hour').addEventListener('input', (e) => setTime(parseFloat(e.target.value)));
document.getElementById('hour').addEventListener('change', (e) => setTime(parseFloat(e.target.value), true));
document.getElementById('showTags').addEventListener('change', (e) => { document.getElementById('tags').hidden = !e.target.checked; });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

/* ------------------------------------------------------------------ boucle */
const clock = new THREE.Clock();
const _v = new V3();
let shadowExt = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (fly) {
    let k = (performance.now() - fly.start) / fly.dur; if (k >= 1) k = 1;
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    const arc = Math.sin(Math.PI * e) * Math.min(120, fly.p0.distanceTo(fly.p1) * 0.25); camera.position.y += arc;
    controls.target.lerpVectors(fly.t0, fly.t1, e); camera.lookAt(controls.target);
    if (k === 1) { fly = null; controls.update(); }
  } else if (walking) {
    const r = walkPath.r; walkPath.s += dt * 3.2;
    if (walkPath.s > r.len - 16) { stopWalk(); controls.update(); }
    else {
      const f = frameAt(r, walkPath.s), g = frameAt(r, walkPath.s + 14);
      camera.position.set(f.x, f.h + 1.9, f.z);
      controls.target.set(g.x, g.h + 2.0, g.z); camera.lookAt(controls.target);
    }
  } else controls.update();
  const gh = heightAt(camera.position.x, camera.position.z) + 1.2; if (camera.position.y < gh) camera.position.y = gh;
  if (water) { water.material.normalMap.offset.x += dt * 0.004; water.material.normalMap.offset.y += dt * 0.0025; }
  // ombres centrées sur la vue
  const dist = camera.position.distanceTo(controls.target);
  const ext = THREE.MathUtils.clamp(dist * 0.75, 70, 360);
  if (Math.abs(ext - shadowExt) > shadowExt * 0.12) {
    shadowExt = ext; const c = sun.shadow.camera; c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext; c.updateProjectionMatrix();
  }
  const focus = walking ? camera.position : controls.target;
  sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(sunDir, 600);
  renderer.render(scene, camera);
  // étiquettes
  if (!document.getElementById('tags').hidden) {
    const w = innerWidth, h = innerHeight;
    for (const L of labels) {
      _v.copy(L.p).project(camera);
      const d = camera.position.distanceTo(L.p);
      const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1 && d < 1400 && d > 12;
      L.el.style.visibility = vis ? 'visible' : 'hidden';
      if (vis) { L.el.style.transform = `translate(${((_v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - _v.y) / 2 * h).toFixed(1)}px) translate(-50%, -100%)`; L.el.style.opacity = String(THREE.MathUtils.clamp(1.4 - d / 1000, 0.35, 1)); L.el.classList.toggle('far', d > 450); }
    }
  }
}

main().catch(err => {
  console.error(err);
  document.getElementById('step').textContent = "Impossible d'afficher la scène 3D : " + (err && err.message ? err.message : err);
});
