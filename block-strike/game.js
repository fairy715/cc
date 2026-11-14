import * as THREE from './vendor/three.module.min.js';
import { MAPS } from './maps.js';

const $ = id => document.getElementById(id);
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const pick = arr => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TEST = new URLSearchParams(location.search).has('test');

// ───────── 常數 ─────────
const CELL = 2.5, EYE = 1.75, EYE_C = 1.15, R = 0.38, GRAV = 20, JUMP = 7.3;
const CELL_H = { '#': 6, C: 2.5, c: 1.25, '=': 1.0 };
const WIN_ROUNDS = 7, FREEZE = 4, ROUND_T = 105, BOMB_T = 38, PLANT_T = 3, DEFUSE_T = 5, BUY_T = 20;
const TEAM_NAME = { T: '進攻方', D: '防守方' };
const WEAPONS = {
  knife: { name: '小刀', dmg: 55, rate: 0.45, melee: true, range: 2.4, auto: true },
  pistol: { name: '手槍', dmg: 27, mag: 12, res: 48, rate: 0.15, spread: 0.01, kick: 0.018, reload: 1.4 },
  smg: { name: '衝鋒槍', dmg: 21, mag: 30, res: 90, rate: 0.075, spread: 0.02, kick: 0.011, auto: true, reload: 1.9, price: 1500 },
  rifle: { name: '突擊步槍', dmg: 34, mag: 30, res: 90, rate: 0.1, spread: 0.012, kick: 0.016, auto: true, reload: 2.2, price: 2800 },
  sniper: { name: '狙擊槍', dmg: 115, mag: 5, res: 20, rate: 1.25, spread: 0.07, kick: 0.06, reload: 3, price: 4500, scope: true },
};
const SHOP = [['smg', 1500], ['rifle', 2800], ['sniper', 4500], ['armor', 650]];
const DIFF = [{ acc: 0.42, react: 0.7 }, { acc: 0.58, react: 0.45 }, { acc: 0.75, react: 0.25 }];
const BOT_NAMES = ['阿土', '小磚', '方塊哥', '沙包', '豆腐', '積木王', '像素仔', '磚頭', '麻糬', '芋圓', '阿方', '板凳'];

const cfg = { map: 0, team: 'T', diff: 1 };

// ───────── 繪圖基礎 ─────────
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 400);
camera.rotation.order = 'YXZ';
const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xffffff, 0x998877, 2.2));
const vmSun = new THREE.DirectionalLight(0xffffff, 1.5); vmSun.position.set(1, 2, 1); vmScene.add(vmSun);
const vm = new THREE.Group(); vm.scale.setScalar(0.72); vmScene.add(vm);
let vmFlash = null;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = vmCam.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

function canvasTex(draw, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}
const speckle = (g, s, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${rand(a)})`; g.fillRect(rand(s) | 0, rand(s) | 0, 2, 2); } };
const brickTex = canvasTex((g, s) => {
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, s, s); speckle(g, s, 500, 0.08);
  g.fillStyle = 'rgba(0,0,0,.16)';
  for (let r = 0; r < 4; r++) { g.fillRect(0, r * 32, s, 2); for (let c = 0; c < 2; c++) g.fillRect(c * 64 + (r % 2) * 32, r * 32, 2, 32); }
});
brickTex.repeat.set(1.25, 2);
const crateTex = canvasTex((g, s) => {
  g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, s, s); speckle(g, s, 300, 0.1);
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 10; g.strokeRect(5, 5, s - 10, s - 10);
  g.lineWidth = 8; g.beginPath(); g.moveTo(8, 8); g.lineTo(s - 8, s - 8); g.moveTo(s - 8, 8); g.lineTo(8, s - 8); g.stroke();
});
const contTex = canvasTex((g, s) => {
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(0,0,0,.14)'; for (let x = 0; x < s; x += 16) g.fillRect(x, 0, 6, s);
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, 0, s, 5); g.fillRect(0, s - 5, s, 5);
});
const groundTex = canvasTex((g, s) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, s, s); speckle(g, s, 900, 0.07);
  g.strokeStyle = 'rgba(0,0,0,.05)'; g.strokeRect(0, 0, s, s);
});
function faceTex(skin) {
  const t = canvasTex((g, s) => {
    g.fillStyle = skin; g.fillRect(0, 0, s, s);
    g.fillStyle = '#111'; g.fillRect(16, 22, 9, 12); g.fillRect(39, 22, 9, 12);
    g.fillRect(20, 44, 24, 5); g.fillRect(16, 40, 5, 5); g.fillRect(43, 40, 5, 5);
  }, 64);
  return t;
}
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const FACE = SKINS.map(faceTex);

// ───────── 地圖 ─────────
let M = null;
const world = new THREE.Group(); scene.add(world);
const fx = new THREE.Group(); scene.add(fx);
const hash = (x, y) => { let h = Math.imul(x * 374761393 + y * 668265263, 1274126177); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
const cellOf = v => Math.floor(v / CELL);
const ctr = c => (c + 0.5) * CELL;
function hAt(x, z) {
  const cx = Math.floor(x / CELL), cy = Math.floor(z / CELL);
  if (cx < 0 || cy < 0 || cx >= M.W || cy >= M.H) return 99;
  return M.h[cy * M.W + cx];
}
const walk = (cx, cy) => cx >= 0 && cy >= 0 && cx < M.W && cy < M.H && M.h[cy * M.W + cx] === 0;

function loadMap(def) {
  world.clear(); fx.clear();
  const { W, H, theme } = def;
  M = { ...def, h: new Float32Array(W * H) };
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.fog, 60, 220);
  world.add(new THREE.HemisphereLight(theme.sky, theme.ground, 1.5));
  const sun = new THREE.DirectionalLight(theme.sun, 2.4);
  const mx = W * CELL / 2, mz = H * CELL / 2, ext = Math.max(W, H) * CELL * 0.62;
  sun.position.set(mx + 45, 80, mz + 30); sun.target.position.set(mx, 0, mz);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 220 });
  world.add(sun, sun.target);

  groundTex.repeat.set(W / 2, H / 2);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, H * CELL), new THREE.MeshLambertMaterial({ map: groundTex, color: theme.ground }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(mx, 0, mz); ground.receiveShadow = true; world.add(ground);

  const lists = { '#': [], C: [], c: [], '=': [] };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = def.grid[y][x];
    if (ch === '.') continue;
    let h = CELL_H[ch];
    if (ch === '#') {
      let edge = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const c = def.grid[y + dy]?.[x + dx]; if (c && c !== '#') edge = true; }
      h = 5.5 + hash(x >> 1, y >> 1) * 2.5;
      if (!edge) { M.h[y * W + x] = h; continue; }
    }
    M.h[y * W + x] = h;
    lists[ch].push([x, y, h]);
  }
  const unit = new THREE.BoxGeometry(CELL, 1, CELL); unit.translate(0, 0.5, 0);
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const inst = (cells, map, colors, shade = 0.12) => {
    if (!cells.length) return;
    const mesh = new THREE.InstancedMesh(unit, new THREE.MeshLambertMaterial({ map }), cells.length);
    cells.forEach(([x, y, h], i) => {
      dummy.position.set(ctr(x), 0, ctr(y)); dummy.scale.set(1, h, 1); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      col.set(colors[(hash(x >> 1, y >> 1) * colors.length) | 0]).multiplyScalar(1 - hash(x, y) * shade);
      mesh.setColorAt(i, col);
    });
    mesh.castShadow = mesh.receiveShadow = true; world.add(mesh);
  };
  inst(lists['#'], brickTex, theme.walls);
  inst(lists['='], brickTex, theme.walls, 0.25);
  inst(lists.c, crateTex, [theme.crate]);
  inst(lists.C, def.id === 'depot' ? contTex : crateTex, theme.containers, 0.05);

  if (def.roof.length) {
    const rg = new THREE.BoxGeometry(CELL, 0.4, CELL);
    const rm = new THREE.InstancedMesh(rg, new THREE.MeshLambertMaterial({ color: theme.walls[1] }), def.roof.length);
    def.roof.forEach(([x, y], i) => { dummy.position.set(ctr(x), 4.2, ctr(y)); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); rm.setMatrixAt(i, dummy.matrix); });
    rm.castShadow = rm.receiveShadow = true; world.add(rm);
  }
  for (const k of ['A', 'B']) {
    const s = def.sites[k];
    const xs = s.cells.map(c => c[0]), ys = s.cells.map(c => c[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
    const t = canvasTex((g, sz) => {
      g.fillStyle = 'rgba(210,40,30,.28)'; g.fillRect(0, 0, sz, sz);
      g.strokeStyle = '#c0281e'; g.lineWidth = 10; g.strokeRect(5, 5, sz - 10, sz - 10);
      g.fillStyle = '#c0281e'; g.font = 'bold 150px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(k, sz / 2, sz / 2 + 8);
    }, 256);
    t.magFilter = THREE.LinearFilter;
    const p = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0) * CELL, (y1 - y0) * CELL), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    p.rotation.x = -Math.PI / 2; p.position.set((x0 + x1) / 2 * CELL, 0.03, (y0 + y1) / 2 * CELL); world.add(p);
  }
  drawMiniBase();
}

// 小地圖
const mini = $('mini'), mg = mini.getContext('2d');
let miniBase = null, miniS = 1, miniOx = 0, miniOy = 0;
function drawMiniBase() {
  miniS = Math.min(mini.width / M.W, mini.height / M.H);
  miniOx = (mini.width - M.W * miniS) / 2; miniOy = (mini.height - M.H * miniS) / 2;
  miniBase = document.createElement('canvas'); miniBase.width = mini.width; miniBase.height = mini.height;
  const g = miniBase.getContext('2d');
  for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) {
    const ch = M.grid[y][x]; if (ch === '#') continue;
    g.fillStyle = M.site[y][x] ? '#b9605a' : ch === '.' ? '#c9c2ad' : '#7d705a';
    g.fillRect(miniOx + x * miniS, miniOy + y * miniS, miniS + 0.5, miniS + 0.5);
  }
}

// ───────── 角色 ─────────
function buildChar(team, skin) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const shirt = team === 'T' ? 0xe2552f : 0x2f7be0, pants = team === 'T' ? 0x5a4632 : 0x26324f;
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, m, x, y, z, parent = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const skinM = mat(SKINS[skin]);
  box(0.8, 0.8, 0.42, mat(shirt), 0, 1.2, 0);
  const faceM = new THREE.MeshLambertMaterial({ map: FACE[skin] });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), [skinM, skinM, skinM, skinM, faceM, skinM]);
  head.position.y = 1.87; head.castShadow = true; g.add(head);
  box(0.58, 0.14, 0.58, mat(team === 'T' ? 0x8a2a14 : 0x173f7a), 0, 2.17, 0);
  const limb = (x, y, w, h, m, rx = 0) => { const p = new THREE.Group(); p.position.set(x, y, 0); p.rotation.x = rx; box(w, h, w, m, 0, -h / 2, 0, p); g.add(p); return p; };
  const legL = limb(-0.2, 0.8, 0.37, 0.8, mat(pants)), legR = limb(0.2, 0.8, 0.37, 0.8, mat(pants));
  limb(-0.53, 1.52, 0.25, 0.7, skinM, -1.1); limb(0.53, 1.52, 0.25, 0.7, skinM, -Math.PI / 2);
  box(0.12, 0.17, 0.95, mat(0x25282d), 0.4, 1.47, 0.75);
  const flash = box(0.25, 0.25, 0.25, new THREE.MeshBasicMaterial({ color: 0xffe066 }), 0.4, 1.47, 1.3); flash.visible = false; flash.castShadow = false;
  return { g, legL, legR, flash };
}

const P = { isPlayer: true, name: '你', team: 'T', x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, hp: 100, armor: 0, alive: true,
  crouch: false, ground: true, money: 800, primary: null, cur: 'pistol', last: 'knife', ammo: {}, fireCd: 0, reloadT: 0, bloom: 0, kickOff: 0,
  scoped: false, kills: 0, deaths: 0, eye: EYE, vmKick: 0, bob: 0 };
let chars = [], bots = [];

function makeBot(team, i) {
  const m = buildChar(team, (Math.random() * SKINS.length) | 0);
  scene.add(m.g);
  return { name: BOT_NAMES[i % BOT_NAMES.length], team, x: 0, y: 0, z: 0, dir: 0, hp: 100, armor: 0, alive: true, crouch: false, mesh: m,
    seed: (Math.random() * 1e6) | 0, path: [], pi: 0, goal: null, goalKind: '', repath: 0, target: null, seen: false, react: 0, fireCd: 0, burst: 0,
    senseT: rand(0.15), strafe: 0, strafeT: 0, work: 0, weapon: 'pistol', site: 'A', walkT: 0, deadT: 0, flashT: 0, kills: 0, deaths: 0 };
}

// ───────── 碰撞與射線 ─────────
function blocked(x, z, y, r) {
  const x0 = cellOf(x - r), x1 = cellOf(x + r), z0 = cellOf(z - r), z1 = cellOf(z + r);
  for (let cy = z0; cy <= z1; cy++) for (let cx = x0; cx <= x1; cx++) {
    if (cx < 0 || cy < 0 || cx >= M.W || cy >= M.H) return true;
    if (M.h[cy * M.W + cx] > y + 0.3) return true;
  }
  return false;
}
function groundAt(x, z, y, r) {
  let g = 0;
  const x0 = cellOf(x - r), x1 = cellOf(x + r), z0 = cellOf(z - r), z1 = cellOf(z + r);
  for (let cy = z0; cy <= z1; cy++) for (let cx = x0; cx <= x1; cx++) {
    if (cx < 0 || cy < 0 || cx >= M.W || cy >= M.H) continue;
    const h = M.h[cy * M.W + cx]; if (h <= y + 0.3 && h > g) g = h;
  }
  return g;
}
function rayWall(o, d, max) {
  for (let t = 0; t < max; t += 0.12) {
    const y = o.y + d.y * t;
    if (y < 0 || y < hAt(o.x + d.x * t, o.z + d.z * t)) return t;
  }
  return max;
}
function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = 1e9;
  for (const [oo, dd, a, b] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
    if (Math.abs(dd) < 1e-8) { if (oo < a || oo > b) return Infinity; continue; }
    let t1 = (a - oo) / dd, t2 = (b - oo) / dd; if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return Infinity;
  }
  return tmin;
}
function rayChar(e, o, d) {
  const y = e.y;
  let t = rayBox(o, d, e.x - 0.28, y + 1.6, e.z - 0.28, e.x + 0.28, y + 2.15, e.z + 0.28);
  if (t < Infinity) return { t, part: 'head' };
  t = rayBox(o, d, e.x - 0.5, y + 0.78, e.z - 0.5, e.x + 0.5, y + 1.6, e.z + 0.5);
  if (t < Infinity) return { t, part: 'body' };
  t = rayBox(o, d, e.x - 0.33, y, e.z - 0.33, e.x + 0.33, y + 0.78, e.z + 0.33);
  return t < Infinity ? { t, part: 'legs' } : null;
}
function canSee(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, dist = Math.hypot(dx, dz);
  if (dist > 75) return false;
  const y0 = a.y + 1.7, y1 = b.y + (b.crouch ? 0.9 : 1.4), n = Math.ceil(dist / 0.4);
  for (let i = 1; i < n; i++) { const f = i / n; if (hAt(a.x + dx * f, a.z + dz * f) > y0 + (y1 - y0) * f) return false; }
  return true;
}

// ───────── 尋路（A*，每個機器人有自己的路線偏好）─────────
function findPath(sx, sy, gx, gy, seed) {
  const W = M.W, N = W * M.H, g = new Float32Array(N).fill(Infinity), f = new Float32Array(N), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const s = sy * W + sx, goal = gy * W + gx, open = [s]; g[s] = 0;
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue; closed[cur] = 1;
    const cx = cur % W, cy = (cur / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (!walk(nx, ny) || (dx && dy && (!walk(cx + dx, cy) || !walk(cx, cy + dy)))) continue;
      const n = ny * W + nx; if (closed[n]) continue;
      const noise = ((Math.imul(n + 1, 2654435761) ^ Math.imul(seed, 40503)) >>> 0) % 1000 / 1000;
      const c = g[cur] + (dx && dy ? 1.414 : 1) * (1 + noise * 0.9);
      if (c < g[n]) { g[n] = c; from[n] = cur; f[n] = c + Math.hypot(gx - nx, gy - ny); open.push(n); }
    }
  }
  if (from[goal] < 0 && goal !== s) return [];
  const out = []; for (let c = goal; c !== s && c >= 0; c = from[c]) out.push([ctr(c % W), ctr((c / W) | 0)]);
  return out.reverse();
}
function randomNear(cx, cy, r) {
  for (let i = 0; i < 40; i++) { const x = cx + ((rand(-r, r + 1)) | 0), y = cy + ((rand(-r, r + 1)) | 0); if (walk(x, y)) return [x, y]; }
  return [cx, cy];
}
function setGoal(b, cell, kind) {
  let sx = cellOf(b.x), sy = cellOf(b.z);
  if (!walk(sx, sy)) [sx, sy] = randomNear(sx, sy, 1);
  b.goal = cell; b.goalKind = kind; b.path = findPath(sx, sy, cell[0], cell[1], b.seed); b.pi = 0;
}

// ───────── 回合狀態 ─────────
const G = { state: 'menu', round: 0, score: { T: 0, D: 0 }, timer: 0, buyT: 0, bomb: null, atkSite: 'A', worker: null, plant: 0, defuse: 0,
  msgT: 0, hitT: 0, hurt: 0, spec: null, buyOpen: false, time: 0 };
let bombMesh = null;
const alive = team => chars.filter(c => c.team === team && c.alive);
function msg(t, sec = 3) { $('msg').textContent = t; G.msgT = sec; }
function feed(html) {
  const d = document.createElement('div'); d.innerHTML = html; $('feed').prepend(d);
  setTimeout(() => d.remove(), 6000);
  while ($('feed').children.length > 5) $('feed').lastChild.remove();
}
const tag = c => `<span class="${c.team === 'T' ? 'ct' : 'cd'}">${c.name}</span>`;

function startMatch() {
  loadMap(MAPS[cfg.map]);
  for (const b of bots) scene.remove(b.mesh.g);
  bots = []; chars = [P];
  Object.assign(P, { team: cfg.team, money: 800, primary: null, cur: 'pistol', last: 'knife', armor: 0, kills: 0, deaths: 0 });
  let n = 0;
  for (const team of ['T', 'D']) for (let i = 0; i < (team === cfg.team ? 4 : 5); i++) { const b = makeBot(team, n++); bots.push(b); chars.push(b); }
  G.round = 0; G.score = { T: 0, D: 0 };
  $('menu').classList.add('hide'); $('hud').classList.remove('hide'); $('over').classList.add('hide');
  startRound();
}

function startRound() {
  G.round++; G.state = 'freeze'; G.timer = FREEZE; G.buyT = BUY_T + FREEZE; G.bomb = null; G.worker = null; G.plant = 0; G.defuse = 0; G.spec = null; G.spotted = false;
  if (bombMesh) { scene.remove(bombMesh); bombMesh = null; }
  fx.clear(); tracers.length = 0; booms.length = 0;
  G.atkSite = pick(['A', 'B']);
  const mx = M.W * CELL / 2, mz = M.H * CELL / 2, flip = Math.random() < 0.5 ? 0 : 1;
  for (const team of ['T', 'D']) {
    const cells = [...M.spawn[team]].sort(() => Math.random() - 0.5);
    chars.filter(c => c.team === team).forEach((c, i) => {
      const [cx, cy] = cells[i % cells.length];
      Object.assign(c, { x: ctr(cx), z: ctr(cy), y: 0, hp: 100, crouch: false });
      const dx = mx - c.x, dz = mz - c.z;
      if (c.isPlayer) {
        if (!c.alive) { c.primary = null; c.armor = 0; if (!WEAPONS[c.cur] || c.cur !== 'knife') c.cur = 'pistol'; }
        Object.assign(c, { vx: 0, vz: 0, vy: 0, yaw: Math.atan2(-dx, -dz), pitch: 0, reloadT: 0, fireCd: 0, scoped: false, kickOff: 0, bloom: 0 });
        for (const k of ['pistol', c.primary]) if (k) c.ammo[k] = { mag: WEAPONS[k].mag, res: WEAPONS[k].res };
        if (c.cur !== 'knife' && c.cur !== 'pistol' && c.cur !== c.primary) c.cur = 'pistol';
        buildVM();
      } else {
        Object.assign(c, { dir: Math.atan2(dx, dz), path: [], pi: 0, goal: null, goalKind: '', target: null, seen: false, work: 0, burst: 0, fireCd: 0,
          site: (i + flip) % 2 ? 'A' : 'B', weapon: G.round === 1 ? 'pistol' : pick(['smg', 'rifle', 'rifle']), deadT: 0 });
        c.mesh.g.visible = true; c.mesh.g.rotation.set(0, c.dir, 0); c.mesh.g.position.set(c.x, 0, c.z);
      }
      c.alive = true;
    });
  }
  msg(`第 ${G.round} 回合`, 3);
}

function endRound(winner, why) {
  if (G.state !== 'live') return;
  G.state = 'post'; G.timer = 5; G.score[winner]++;
  const won = winner === P.team;
  P.money = Math.min(16000, P.money + (won ? 3000 : 1800));
  msg(`${TEAM_NAME[winner]}獲勝 — ${why}`, 5);
  beep(won ? 660 : 220, 0.35, 0.25); setTimeout(() => beep(won ? 880 : 165, 0.5, 0.25), 180);
}

function finishMatch() {
  G.state = 'over';
  const won = G.score[P.team] >= WIN_ROUNDS;
  $('over').innerHTML = `${won ? '🏆 勝利' : '戰敗'}　${G.score.T} : ${G.score.D}<small>你的戰績：${P.kills} 殺 / ${P.deaths} 死<br><br>點一下回主選單</small>`;
  $('over').classList.remove('hide');
  document.exitPointerLock?.();
}

function plantBomb(x, z, who) {
  G.bomb = { x, z, t: BOMB_T, beep: 0 }; G.worker = null; G.plant = 0; G.defuse = 0;
  bombMesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.35), new THREE.MeshLambertMaterial({ color: 0x33373d }));
  body.position.y = 0.125; body.castShadow = true;
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); led.position.y = 0.29;
  bombMesh.add(body, led); bombMesh.userData.led = led; bombMesh.position.set(x, 0, z); scene.add(bombMesh);
  msg('炸彈已安裝！', 3); feed(`${tag(who)} 安裝了炸彈`);
  if (who.isPlayer) P.money = Math.min(16000, P.money + 300);
  for (const b of bots) { b.goalKind = ''; b.work = 0; }
}

// ───────── 傷害 ─────────
function damage(v, dmg, from, head) {
  if (!v.alive || G.state !== 'live') return;
  if (v.armor > 0) { const abs = dmg * 0.45; v.armor = Math.max(0, v.armor - abs * 0.6); dmg -= abs; }
  v.hp -= dmg;
  if (v.isPlayer) { G.hurt = 1; } else if (from && from.team !== v.team && (!v.target || !v.seen)) { v.target = from; v.react = Math.min(v.react, 0.25); }
  if (v.hp > 0) return;
  v.hp = 0; v.alive = false; v.deaths++;
  if (from) { from.kills++; feed(`${tag(from)} ${head ? '☠' : '➤'} ${tag(v)}`); if (from.isPlayer) P.money = Math.min(16000, P.money + 300); }
  if (G.worker === v) { G.worker = null; }
  if (v.isPlayer) { P.scoped = false; G.buyOpen = false; msg('你陣亡了', 2.5); }
}

// ───────── 音效（WebAudio 合成）─────────
let AC = null, noiseBuf = null;
function ac() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.4, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return AC;
}
function shotSound(vol, freq = 1800, dur = 0.16) {
  if (vol <= 0.01) return; const a = ac(), s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  s.connect(f).connect(g).connect(a.destination); s.start(); s.stop(a.currentTime + dur);
}
function beep(freq, dur, vol = 0.15, type = 'square') {
  const a = ac(), o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur);
}
const distVol = (x, z) => clamp(1 - Math.hypot(x - P.x, z - P.z) / 90, 0, 1) ** 2;

// ───────── 特效 ─────────
const tracers = [], booms = [];
const tracerMat = new THREE.LineBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.8 });
const markGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09), markMat = new THREE.MeshBasicMaterial({ color: 0x2a2520 });
const marks = [];
function tracer(a, b) {
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), tracerMat);
  l.userData.t = 0.06; fx.add(l); tracers.push(l);
}
function mark(p) {
  const m = new THREE.Mesh(markGeo, markMat); m.position.copy(p); fx.add(m); marks.push(m);
  if (marks.length > 80) fx.remove(marks.shift());
}

// ───────── 第一人稱武器模型 ─────────
function buildVM() {
  vm.clear();
  const k = P.cur, box = (w, h, d, c, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c })); o.position.set(x, y, z); vm.add(o); return o; };
  box(0.11, 0.11, 0.42, 0xe0ac69, 0.03, -0.09, 0.2);
  let tip = -0.4;
  if (k === 'knife') { box(0.03, 0.09, 0.3, 0xd8dde2, 0, 0.02, -0.2); box(0.05, 0.06, 0.14, 0x3a2a1a, 0, 0, 0.02); }
  else if (k === 'pistol') { box(0.055, 0.08, 0.28, 0x2c2f35, 0, 0.03, -0.12); box(0.05, 0.14, 0.07, 0x1d1f23, 0, -0.06, -0.02); tip = -0.3; }
  else if (k === 'smg') { box(0.065, 0.1, 0.45, 0x30343a, 0, 0.02, -0.15); box(0.045, 0.2, 0.06, 0x1d1f23, 0, -0.12, -0.15); box(0.03, 0.03, 0.14, 0x111, 0, 0.03, -0.44); tip = -0.54; }
  else if (k === 'rifle') { box(0.07, 0.1, 0.6, 0x3a3d42, 0, 0.02, -0.2); box(0.06, 0.09, 0.24, 0x8a5a2b, 0, 0, 0.2); box(0.05, 0.17, 0.09, 0x8a5a2b, 0, -0.12, -0.2); box(0.03, 0.03, 0.28, 0x111, 0, 0.04, -0.62); tip = -0.78; }
  else { box(0.07, 0.1, 0.7, 0x2e4a34, 0, 0.02, -0.2); box(0.06, 0.09, 0.26, 0x2e4a34, 0, 0, 0.26); box(0.03, 0.03, 0.45, 0x111, 0, 0.04, -0.75); box(0.05, 0.05, 0.3, 0x111, 0, 0.11, -0.15); tip = -1; }
  vmFlash = box(0.14, 0.14, 0.14, 0xffe066, 0, 0.04, tip); vmFlash.material = new THREE.MeshBasicMaterial({ color: 0xffe066 }); vmFlash.visible = false;
}

// ───────── 玩家操作 ─────────
const keys = {};
let locked = false, mouseDown = false, trigger = false;
addEventListener('keydown', e => {
  if (G.state === 'menu' || G.state === 'over') return;
  if (['Space', 'Tab', 'KeyB'].includes(e.code)) e.preventDefault();
  if (keys[e.code]) return; keys[e.code] = true;
  if (G.buyOpen && /^Digit[1-4]$/.test(e.code)) { buy(+e.code[5] - 1); return; }
  if (e.code === 'KeyB') { G.buyOpen = !G.buyOpen && P.alive && G.buyT > 0; renderBuy(); }
  if (!P.alive) return;
  if (e.code === 'Digit1' && P.primary) switchTo(P.primary);
  if (e.code === 'Digit2') switchTo('pistol');
  if (e.code === 'Digit3') switchTo('knife');
  if (e.code === 'KeyQ') switchTo(P.last);
  if (e.code === 'KeyR') reload();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; });
addEventListener('mousemove', e => {
  if (!locked || G.state === 'menu') return;
  const s = 0.0022 * (P.scoped ? 0.3 : 1);
  P.yaw -= e.movementX * s; P.pitch = clamp(P.pitch - e.movementY * s, -1.5, 1.5);
});
addEventListener('mousedown', e => {
  if (!locked) return;
  if (e.button === 0) { mouseDown = true; trigger = true; }
  if (e.button === 2 && P.alive && WEAPONS[P.cur].scope && P.reloadT <= 0) P.scoped = !P.scoped;
});
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('wheel', () => { if (locked && P.alive) switchTo(P.last); });
const lock = () => { if (!TEST) $('c').requestPointerLock?.(); ac().resume?.(); };
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === $('c');
  $('pause').classList.toggle('hide', locked || G.state === 'menu' || G.state === 'over');
});
$('pause').addEventListener('click', lock);
$('c').addEventListener('click', () => { if (!locked && G.state !== 'menu') lock(); });
$('over').addEventListener('click', () => location.reload());

function switchTo(k) {
  if (k === P.cur || (k !== 'knife' && k !== 'pistol' && k !== P.primary)) return;
  P.last = P.cur; P.cur = k; P.reloadT = 0; P.scoped = false; P.fireCd = Math.max(P.fireCd, 0.25); buildVM();
}
function reload() {
  const w = WEAPONS[P.cur], a = P.ammo[P.cur];
  if (w.melee || P.reloadT > 0 || !a || a.mag >= w.mag || a.res <= 0) return;
  P.reloadT = w.reload; P.scoped = false; beep(300, 0.05, 0.08);
}
function buy(i) {
  const [k, price] = SHOP[i];
  if (P.money < price || G.buyT <= 0) return beep(140, 0.12, 0.1);
  if (k === 'armor') { if (P.armor >= 100) return; P.armor = 100; }
  else { P.primary = k; P.ammo[k] = { mag: WEAPONS[k].mag, res: WEAPONS[k].res }; P.last = P.cur; P.cur = k; P.reloadT = 0; P.scoped = false; buildVM(); }
  P.money -= price; beep(720, 0.08, 0.1); renderBuy();
}
function renderBuy() {
  const el = $('buy'); el.classList.toggle('hide', !G.buyOpen);
  if (!G.buyOpen) return;
  el.innerHTML = '<h3>購買（按數字鍵，B 關閉）</h3>' + SHOP.map(([k, p], i) =>
    `<p class="${P.money < p ? 'no' : ''}"><span>${i + 1}. ${k === 'armor' ? '護甲' : WEAPONS[k].name}</span><span>$${p}</span></p>`).join('');
}

const vF = new THREE.Vector3(), vR = new THREE.Vector3(), vU = new THREE.Vector3(), vD = new THREE.Vector3();
function fire() {
  const w = WEAPONS[P.cur];
  if (P.fireCd > 0 || P.reloadT > 0) return;
  camera.getWorldDirection(vF);
  const o = camera.position;
  const enemies = chars.filter(c => c.alive && c.team !== P.team);
  if (w.melee) {
    P.fireCd = w.rate; P.vmKick = -0.25; shotSound(0.12, 5000, 0.07);
    for (const e of enemies) { const h = rayChar(e, o, vF); if (h && h.t < w.range) { hitFx(); damage(e, w.dmg, P, false); break; } }
    return;
  }
  const a = P.ammo[P.cur];
  if (a.mag <= 0) { beep(900, 0.03, 0.06); P.fireCd = 0.2; reload(); return; }
  a.mag--; P.fireCd = w.rate;
  const speed = Math.hypot(P.vx, P.vz) / 5.6;
  let sp = w.spread + P.bloom + speed * 0.035 + (P.ground ? 0 : 0.07);
  if (P.crouch) sp *= 0.6;
  if (w.scope) sp = P.scoped ? speed * 0.03 + (P.ground ? 0 : 0.07) : 0.07;
  vR.crossVectors(vF, camera.up).normalize(); vU.crossVectors(vR, vF);
  const ang = rand(Math.PI * 2), rad = sp * Math.sqrt(Math.random());
  vD.copy(vF).addScaledVector(vR, Math.cos(ang) * rad).addScaledVector(vU, Math.sin(ang) * rad).normalize();
  let best = null, bt = rayWall(o, vD, 200);
  const wallT = bt;
  for (const e of enemies) { const h = rayChar(e, o, vD); if (h && h.t < bt) { bt = h.t; best = { e, part: h.part }; } }
  const end = o.clone().addScaledVector(vD, bt);
  if (best) {
    const mul = best.part === 'head' ? 4 : best.part === 'legs' ? 0.75 : 1;
    hitFx(best.part === 'head'); damage(best.e, w.dmg * mul * (bt > 40 && !w.scope ? 0.85 : 1), P, best.part === 'head');
  } else if (wallT < 200) mark(end);
  const start = o.clone().addScaledVector(vF, 0.9).addScaledVector(vR, 0.2).addScaledVector(vU, -0.15);
  tracer(start, end);
  P.bloom = Math.min(0.05, P.bloom + w.kick * 0.45);
  P.kickOff += w.kick * rand(0.7, 1); P.yaw += rand(-0.5, 0.5) * w.kick * 0.5; P.vmKick = 0.07;
  if (vmFlash) { vmFlash.visible = true; vmFlash.userData.t = 0.045; vmFlash.rotation.z = rand(3); }
  shotSound(0.3, w.scope ? 900 : P.cur === 'pistol' ? 2600 : 1700, w.scope ? 0.4 : 0.15);
  if (w.scope) P.scoped = false;
  if (a.mag === 0) reload();
}
function hitFx(head) { G.hitT = 0.15; beep(head ? 1500 : 1000, 0.05, 0.08, 'sine'); }

function playerUpdate(dt) {
  P.fireCd -= dt; P.bloom = Math.max(0, P.bloom - dt * 0.09); P.kickOff *= Math.exp(-dt * 7);
  if (P.reloadT > 0) {
    P.reloadT -= dt;
    if (P.reloadT <= 0) { const w = WEAPONS[P.cur], a = P.ammo[P.cur], n = Math.min(w.mag - a.mag, a.res); a.mag += n; a.res -= n; beep(520, 0.05, 0.08); }
  }
  const frozen = G.state === 'freeze';
  P.crouch = !!keys.KeyC;
  let fw = 0, st = 0;
  if (!frozen && !G.buyOpen) { fw = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0); st = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0); }
  const working = !!keys.KeyE && (G.plant > 0 || G.defuse > 0) && G.worker === P;
  if (working) fw = st = 0;
  const len = Math.hypot(fw, st) || 1, sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
  let speed = P.crouch ? 2.4 : keys.ShiftLeft ? 2.8 : 5.6;
  if (P.scoped) speed *= 0.5; if (P.cur === 'knife') speed *= 1.12;
  const wx = (-sin * fw + cos * st) / len * speed, wz = (-cos * fw - sin * st) / len * speed;
  const acc = 1 - Math.exp(-dt * (P.ground ? 14 : 2.5));
  P.vx += (wx - P.vx) * acc; P.vz += (wz - P.vz) * acc;
  if (keys.Space && P.ground && !frozen) { P.vy = JUMP; P.ground = false; }
  const nx = P.x + P.vx * dt; if (!blocked(nx, P.z, P.y, R)) P.x = nx; else P.vx = 0;
  const nz = P.z + P.vz * dt; if (!blocked(P.x, nz, P.y, R)) P.z = nz; else P.vz = 0;
  P.vy -= GRAV * dt; P.y += P.vy * dt;
  const g = groundAt(P.x, P.z, P.y, R);
  if (P.y <= g) { P.y = g; P.vy = 0; P.ground = true; } else if (P.y > g + 0.02) P.ground = false;
  P.eye += ((P.crouch ? EYE_C : EYE) - P.eye) * (1 - Math.exp(-dt * 14));
  P.bob += Math.hypot(P.vx, P.vz) * dt * (P.ground ? 1 : 0);

  if (G.state === 'live' && !G.buyOpen) {
    const w = WEAPONS[P.cur];
    if ((w.auto && mouseDown) || trigger) fire();
  }
  trigger = false;

  // 安裝／拆除
  let hint = '';
  if (G.state === 'live') {
    const cx = cellOf(P.x), cy = cellOf(P.z);
    if (P.team === 'T' && !G.bomb && M.site[cy]?.[cx] && P.y < 0.1) {
      hint = '按住 E 安裝炸彈';
      if (keys.KeyE && (!G.worker || G.worker === P)) { if (G.worker !== P) G.plant = 0; G.worker = P; G.plant += dt; hint = '安裝中…'; if (G.plant >= PLANT_T) plantBomb(P.x, P.z, P); }
      else if (G.worker === P) { G.worker = null; G.plant = 0; }
    } else if (P.team === 'D' && G.bomb && Math.hypot(G.bomb.x - P.x, G.bomb.z - P.z) < 2.3) {
      hint = '按住 E 拆除炸彈';
      if (keys.KeyE && (!G.worker || G.worker === P)) { if (G.worker !== P) G.defuse = 0; G.worker = P; G.defuse += dt; hint = '拆除中…'; if (G.defuse >= DEFUSE_T) { feed(`${tag(P)} 拆除了炸彈`); endRound('D', '炸彈已拆除'); } }
      else if (G.worker === P) { G.worker = null; G.defuse = 0; }
    } else if (G.worker === P) { G.worker = null; G.plant = G.defuse = 0; }
  }
  G.hint = hint;
}

// ───────── 機器人 ─────────
function botShoot(b, t) {
  const w = WEAPONS[b.weapon], d = DIFF[cfg.diff], dist = Math.hypot(t.x - b.x, t.z - b.z);
  b.fireCd = w.rate * 1.7 + rand(0.05);
  if (--b.burst <= 0) { b.burst = 3 + ((rand(4)) | 0); b.fireCd += rand(0.3, 0.7); }
  let p = clamp(d.acc - dist * 0.011, 0.1, 0.8);
  if (t.isPlayer) { if (Math.hypot(P.vx, P.vz) > 3) p *= 0.75; if (P.crouch) p *= 0.85; } else p *= 0.8;
  if (!b.strafe) p *= 1.15;
  const hit = Math.random() < p, head = hit && Math.random() < 0.1;
  const from = new THREE.Vector3(b.x + Math.sin(b.dir) * 1.2, 1.47, b.z + Math.cos(b.dir) * 1.2);
  const to = new THREE.Vector3(t.x, t.y + (t.crouch ? 0.8 : 1.3), t.z);
  if (!hit) { to.x += rand(-1.2, 1.2); to.y += rand(-0.4, 0.9); to.z += rand(-1.2, 1.2); to.sub(from).multiplyScalar(1.6).add(from); }
  tracer(from, to);
  b.mesh.flash.visible = true; b.flashT = 0.05;
  shotSound(0.3 * distVol(b.x, b.z), b.weapon === 'pistol' ? 2400 : 1500, 0.14);
  if (hit) damage(t, w.dmg * (head ? 2.5 : 1) * (dist > 35 ? 0.8 : 1), b, head);
}
function botMove(b, dx, dz, speed, dt) {
  const l = Math.hypot(dx, dz); if (l < 1e-4) return;
  const sx = dx / l * speed * dt, sz = dz / l * speed * dt;
  if (!blocked(b.x + sx, b.z, 0, 0.3)) b.x += sx;
  if (!blocked(b.x, b.z + sz, 0, 0.3)) b.z += sz;
  b.walkT += speed * dt;
}
function turn(b, want, dt, rate = 9) {
  let d = want - b.dir; d = Math.atan2(Math.sin(d), Math.cos(d)); b.dir += d * Math.min(1, dt * rate);
}
function botUpdate(b, dt) {
  const m = b.mesh;
  if (!b.alive) {
    if (b.deadT < 1) { b.deadT = Math.min(1, b.deadT + dt * 3); m.g.rotation.x = -b.deadT * Math.PI / 2; m.g.position.y = b.deadT * 0.2; m.flash.visible = false; }
    return;
  }
  if (b.flashT > 0 && (b.flashT -= dt) <= 0) m.flash.visible = false;
  if (G.state === 'live') {
    // 感知
    if ((b.senseT -= dt) <= 0) {
      b.senseT = 0.15;
      let best = null, bd = 1e9; const fx_ = Math.sin(b.dir), fz = Math.cos(b.dir);
      for (const e of chars) {
        if (!e.alive || e.team === b.team) continue;
        const dx = e.x - b.x, dz = e.z - b.z, d = Math.hypot(dx, dz);
        if (d >= bd || (d > 7 && e !== b.target && (dx * fx_ + dz * fz) / d < -0.2) || !canSee(b, e)) continue;
        best = e; bd = d;
      }
      const was = b.seen;
      if (best) { if (best !== b.target || !was) b.react = DIFF[cfg.diff].react * rand(0.7, 1.4); b.target = best; b.seen = true; if (b.team === 'D' && !G.spotted) rotateDefenders(); }
      else { b.seen = false; if (was && b.goal) setGoal(b, b.goal, b.goalKind); if (b.target && !b.target.alive) b.target = null; }
    }
    if (b.seen && b.target?.alive) {
      const t = b.target, dx = t.x - b.x, dz = t.z - b.z;
      turn(b, Math.atan2(dx, dz), dt, 12);
      b.work = 0; if (G.worker === b) { G.worker = null; G.plant = G.defuse = 0; }
      if ((b.react -= dt) <= 0 && (b.fireCd -= dt) <= 0) botShoot(b, t);
      if ((b.strafeT -= dt) <= 0) { b.strafe = pick([-1, 0, 1]); b.strafeT = rand(0.4, 1.1); }
      if (b.strafe) botMove(b, dz * b.strafe, -dx * b.strafe, 2.4, dt);
    } else {
      botGoal(b, dt);
      if (b.pi < b.path.length) {
        const [tx, tz] = b.path[b.pi], dx = tx - b.x, dz = tz - b.z;
        if (Math.hypot(dx, dz) < 0.45) b.pi++;
        else { turn(b, Math.atan2(dx, dz), dt); botMove(b, dx, dz, 4.7, dt); }
      } else if (b.target?.alive) turn(b, Math.atan2(b.target.x - b.x, b.target.z - b.z), dt, 3);
    }
  }
  m.g.position.set(b.x, 0, b.z); m.g.rotation.y = b.dir;
  const sw = Math.sin(b.walkT * 2.2) * 0.7; m.legL.rotation.x = sw; m.legR.rotation.x = -sw;
}
// 防守方一發現敵人，另一個包點的人就回防
function rotateDefenders() {
  G.spotted = true;
  for (const o of bots) if (o.team === 'D' && o.site !== G.atkSite) { o.site = G.atkSite; if (!G.bomb) o.goalKind = ''; }
}
function botGoal(b, dt) {
  b.repath -= dt;
  const arrived = b.pi >= b.path.length, bomb = G.bomb;
  if (b.team === 'T') {
    if (!bomb) {
      if (b.goalKind !== 'site') setGoal(b, pick(M.sites[G.atkSite].cells), 'site');
      else if (arrived && M.site[cellOf(b.z)]?.[cellOf(b.x)]) {
        if (!G.worker || G.worker === b) {
          G.worker = b; b.work += dt; G.plant = b.work;
          if (b.work >= PLANT_T + 0.3) plantBomb(b.x, b.z, b);
        }
      } else if (arrived) b.goalKind = '';
    } else if (b.goalKind !== 'guard' || (arrived && b.repath <= 0)) {
      setGoal(b, randomNear(cellOf(bomb.x), cellOf(bomb.z), 5), 'guard'); b.repath = rand(4, 10);
    }
  } else if (!bomb) {
    if (b.goalKind !== 'hold' || (arrived && b.repath <= 0)) {
      const s = M.sites[b.site]; setGoal(b, randomNear(s.cx, s.cy, 4), 'hold'); b.repath = rand(5, 13);
    }
  } else {
    if (b.goalKind !== 'defuse') setGoal(b, [cellOf(bomb.x), cellOf(bomb.z)], 'defuse');
    if (Math.hypot(bomb.x - b.x, bomb.z - b.z) < 2.2) {
      b.pi = b.path.length;
      if (!G.worker || G.worker === b) {
        G.worker = b; b.work += dt; G.defuse = b.work;
        if (b.work >= DEFUSE_T) { feed(`${tag(b)} 拆除了炸彈`); endRound('D', '炸彈已拆除'); }
      }
    } else if (arrived) b.goalKind = '';
  }
}

// ───────── 主迴圈 ─────────
function update(dt) {
  G.time += dt;
  if (G.buyT > 0 && (G.buyT -= dt) <= 0 && G.buyOpen) { G.buyOpen = false; renderBuy(); }
  if (G.state === 'freeze') { if ((G.timer -= dt) <= 0) { G.state = 'live'; G.timer = ROUND_T; msg(P.team === 'T' ? `隊友進攻 ${G.atkSite} 點` : '守住包點！', 3); } }
  else if (G.state === 'post') {
    if ((G.timer -= dt) <= 0) { if (G.score.T >= WIN_ROUNDS || G.score.D >= WIN_ROUNDS) return finishMatch(); startRound(); }
  } else if (G.state === 'live') {
    if (G.bomb) {
      const b = G.bomb; b.t -= dt;
      if ((b.beep -= dt) <= 0) { b.beep = clamp(b.t / 30, 0.12, 1); beep(1250, 0.06, 0.12 * Math.max(0.15, distVol(b.x, b.z))); bombMesh.userData.led.visible = true; bombMesh.userData.ledT = 0.08; }
      if (bombMesh.userData.ledT > 0 && (bombMesh.userData.ledT -= dt) <= 0) bombMesh.userData.led.visible = false;
      if (b.t <= 0) explode();
    } else if ((G.timer -= dt) <= 0) endRound('D', '時間到');
    if (G.state === 'live') {
      if (!alive('D').length) endRound('T', '防守方全滅');
      else if (!alive('T').length && !G.bomb) endRound('D', '進攻方全滅');
    }
  }
  if (P.alive) playerUpdate(dt); else { trigger = false; G.hint = ''; }
  for (const b of bots) botUpdate(b, dt);

  for (let i = tracers.length - 1; i >= 0; i--) { const t = tracers[i]; if ((t.userData.t -= dt) <= 0) { fx.remove(t); t.geometry.dispose(); tracers.splice(i, 1); } }
  for (let i = booms.length - 1; i >= 0; i--) {
    const s = booms[i]; s.userData.t += dt; const k = s.userData.t / 1.2;
    s.scale.setScalar(1 + k * 16); s.material.opacity = 1 - k;
    if (k >= 1) { fx.remove(s); booms.splice(i, 1); }
  }
  if (vmFlash?.visible && (vmFlash.userData.t -= dt) <= 0) vmFlash.visible = false;
  G.hitT -= dt; G.hurt = Math.max(0, G.hurt - dt * 1.8); if (G.msgT > 0 && (G.msgT -= dt) <= 0) $('msg').textContent = '';
  updateCamera(dt); updateHud();
}

function explode() {
  const b = G.bomb;
  const s = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true }));
  s.position.set(b.x, 1, b.z); s.userData.t = 0; fx.add(s); booms.push(s);
  shotSound(0.9, 400, 1.4);
  for (const c of chars) { const d = Math.hypot(c.x - b.x, c.z - b.z); if (c.alive && d < 14) damage(c, 220 * (1 - d / 14), null, false); }
  if (bombMesh) { scene.remove(bombMesh); bombMesh = null; }
  endRound('T', '炸彈引爆'); G.bomb = null;
}

function updateCamera(dt) {
  const wantFov = P.scoped && P.alive ? 18 : 75;
  if (Math.abs(camera.fov - wantFov) > 0.1) { camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 18); camera.updateProjectionMatrix(); }
  if (P.alive) {
    camera.position.set(P.x, P.y + P.eye + Math.sin(P.bob * 1.9) * 0.035, P.z);
    camera.rotation.set(clamp(P.pitch + P.kickOff, -1.55, 1.55), P.yaw, 0);
    P.vmKick *= Math.exp(-dt * 14);
    const rl = P.reloadT > 0 ? Math.sin(Math.min(1, P.reloadT * 3) * Math.PI / 2) : 0;
    vm.position.set(0.2 + Math.cos(P.bob * 0.95) * 0.008, -0.19 - Math.abs(Math.sin(P.bob * 0.95)) * 0.012 - rl * 0.16, -0.42 + P.vmKick);
    vm.rotation.set(P.vmKick * 0.9 - rl * 0.7, 0, 0);
  } else {
    if (!G.spec?.alive) G.spec = alive(P.team)[0] || alive(P.team === 'T' ? 'D' : 'T')[0] || null;
    const s = G.spec;
    if (s) { camera.position.lerp(vF.set(s.x - Math.sin(s.dir) * 4.5, 4.2, s.z - Math.cos(s.dir) * 4.5), Math.min(1, dt * 5)); camera.lookAt(s.x, 1.5, s.z); }
  }
}

let hudCache = '';
function updateHud() {
  const fmt = t => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;
  const w = WEAPONS[P.cur], a = P.ammo[P.cur];
  const timer = G.bomb ? '💣 ' + Math.ceil(G.bomb.t) : G.state === 'freeze' ? fmt(G.timer + 1) : G.state === 'live' ? fmt(G.timer) : '—';
  const sub = !P.alive ? (G.spec ? `觀戰中：${G.spec.name}` : '') : G.hint || (G.state === 'freeze' ? '準備中… 按 B 購買裝備' : P.reloadT > 0 ? '換彈中…' : '');
  const prog = G.worker === P ? (G.plant > 0 ? G.plant / PLANT_T : G.defuse / DEFUSE_T) : 0;
  const key = [timer, G.score.T, G.score.D, alive('T').length, alive('D').length, Math.ceil(P.hp), Math.ceil(P.armor), P.money, P.cur, a?.mag, a?.res, sub, (prog * 50) | 0, P.scoped, G.hitT > 0, P.alive].join('|');
  if (key !== hudCache) {
    hudCache = key;
    $('timer').textContent = timer; $('timer').classList.toggle('bomb', !!G.bomb);
    $('sT').firstChild.textContent = G.score.T; $('sD').firstChild.textContent = G.score.D;
    $('sT').lastChild.textContent = `進攻 ${alive('T').length} 人`; $('sD').lastChild.textContent = `防守 ${alive('D').length} 人`;
    $('hp').textContent = Math.ceil(P.hp); $('ar').textContent = Math.ceil(P.armor); $('money').textContent = '$' + P.money;
    $('wname').textContent = w.name; $('ammo').textContent = w.melee ? '—' : `${a.mag} / ${a.res}`;
    $('sub').textContent = sub;
    $('prog').classList.toggle('hide', prog <= 0); $('prog').firstChild.style.width = prog * 100 + '%';
    $('scope').classList.toggle('hide', !(P.scoped && P.alive));
    $('cross').classList.toggle('hide', !P.alive || P.scoped || (w.scope && !P.scoped));
    $('cross').classList.toggle('hit', G.hitT > 0);
  }
  $('hurt').style.opacity = G.hurt * 0.8;
  // 小地圖
  mg.clearRect(0, 0, mini.width, mini.height); mg.drawImage(miniBase, 0, 0);
  const px = v => miniOx + v / CELL * miniS, py = v => miniOy + v / CELL * miniS;
  for (const c of chars) {
    if (!c.alive || c.team !== P.team || c.isPlayer) continue;
    mg.fillStyle = c.team === 'T' ? '#ff6a3d' : '#3d8bff'; mg.fillRect(px(c.x) - 2.5, py(c.z) - 2.5, 5, 5);
  }
  if (G.bomb && (P.team === 'T' || Math.floor(G.time * 2) % 2)) { mg.fillStyle = '#ff2020'; mg.beginPath(); mg.arc(px(G.bomb.x), py(G.bomb.z), 4, 0, 7); mg.fill(); }
  if (P.alive) {
    mg.save(); mg.translate(px(P.x), py(P.z)); mg.rotate(-P.yaw);
    mg.fillStyle = '#fff'; mg.strokeStyle = '#000'; mg.beginPath(); mg.moveTo(0, -7); mg.lineTo(5, 5); mg.lineTo(-5, 5); mg.closePath(); mg.fill(); mg.stroke(); mg.restore();
  }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.state === 'menu') { menuCam(now / 1000); }
  else if (G.state !== 'over' && (locked || TEST)) update(dt);
  renderer.clear(); renderer.render(scene, camera);
  if (G.state !== 'menu' && P.alive && !P.scoped) { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
}
function menuCam(t) {
  if (!M) return;
  const mx = M.W * CELL / 2, mz = M.H * CELL / 2, r = Math.max(M.W, M.H) * CELL * 0.55;
  camera.position.set(mx + Math.cos(t * 0.1) * r, 38, mz + Math.sin(t * 0.1) * r); camera.lookAt(mx, 0, mz);
}

// ───────── 主選單 ─────────
function options(id, key, onChange) {
  const el = $(id);
  el.addEventListener('click', e => {
    const b = e.target.closest('.opt'); if (!b) return;
    el.querySelectorAll('.opt').forEach(o => o.classList.toggle('on', o === b));
    cfg[key] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v; onChange?.();
  });
}
$('optMap').innerHTML = MAPS.map((m, i) => `<button class="opt${i ? '' : ' on'}" data-v="${i}">${m.name}<span>${m.desc}</span></button>`).join('');
options('optMap', 'map', () => loadMap(MAPS[cfg.map]));
options('optTeam', 'team'); options('optDiff', 'diff');
$('start').addEventListener('click', () => { startMatch(); lock(); });
loadMap(MAPS[0]);
requestAnimationFrame(frame);
if (TEST) window.__g = { G, P, cfg, get bots() { return bots; }, get M() { return M; }, startMatch, keys, fire, damage, update };
