// 地圖以「挖空」方式定義：先整張填滿牆，再挖出房間與通道，最後擺箱子。
// 格子代號：# 牆、. 地板、c 矮箱（可跳上去）、C 高箱／貨櫃、= 矮牆
// 全部是原創配置。

function build(def) {
  const { W, H } = def;
  const g = Array.from({ length: H }, () => Array(W).fill('#'));
  const site = Array.from({ length: H }, () => Array(W).fill(0));
  const roof = [];
  const zone = { T: [], D: [] };
  const rect = (x0, y0, x1, y1, fn) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(x, y);
  };
  for (const [op, x0, y0, x1 = x0, y1 = y0] of def.ops) {
    if (op === 'carve') rect(x0, y0, x1, y1, (x, y) => (g[y][x] = '.'));
    else if (op === 'T' || op === 'D') rect(x0, y0, x1, y1, (x, y) => { g[y][x] = '.'; zone[op].push([x, y]); });
    else if (op === 'A' || op === 'B') rect(x0, y0, x1, y1, (x, y) => { g[y][x] = '.'; site[y][x] = op === 'A' ? 1 : 2; });
    else if (op === 'roof') rect(x0, y0, x1, y1, (x, y) => roof.push([x, y]));
    else rect(x0, y0, x1, y1, (x, y) => (g[y][x] = op));
  }
  const free = ([x, y]) => g[y][x] === '.';
  const sites = {};
  for (const [k, id] of [['A', 1], ['B', 2]]) {
    const cells = [];
    rect(0, 0, W - 1, H - 1, (x, y) => { if (site[y][x] === id && g[y][x] === '.') cells.push([x, y]); });
    const cx = Math.round(cells.reduce((s, c) => s + c[0], 0) / cells.length);
    const cy = Math.round(cells.reduce((s, c) => s + c[1], 0) / cells.length);
    sites[k] = { cells, cx, cy };
  }
  return {
    id: def.id, name: def.name, desc: def.desc, theme: def.theme, W, H,
    grid: g.map(r => r.join('')), site, roof,
    spawn: { T: zone.T.filter(free), D: zone.D.filter(free) }, sites,
  };
}

const sandtown = {
  id: 'sandtown', name: '沙城', desc: '三路進攻的沙漠小鎮，左側有隧道', W: 44, H: 36,
  theme: {
    sky: 0x9fd3ff, fog: 0xe9d9b0, ground: 0xe3c98f, sun: 0xfff1d0,
    walls: [0xe8cf9a, 0xdcc089, 0xf0d9a8, 0xd4b47a], crate: 0xc08a45,
    containers: [0xb5713a, 0xa0622f, 0xc98c4e],
  },
  ops: [
    ['T', 18, 30, 26, 34], ['D', 18, 2, 26, 5],
    ['carve', 32, 3, 41, 11], ['A', 35, 6, 38, 9],
    ['carve', 2, 3, 10, 12], ['B', 4, 7, 7, 10],
    ['carve', 20, 6, 24, 29],
    ['#', 20, 17, 22, 17], ['#', 22, 9, 24, 9],
    ['carve', 27, 31, 40, 33], ['carve', 37, 12, 40, 30],
    ['carve', 4, 31, 17, 33], ['carve', 4, 13, 7, 30], ['roof', 4, 15, 7, 29],
    ['carve', 25, 14, 36, 16], ['carve', 8, 18, 19, 20],
    ['carve', 27, 3, 31, 5], ['carve', 11, 3, 17, 5],
    ['c', 33, 8, 34, 8], ['C', 39, 5, 39, 6], ['c', 36, 10], ['c', 40, 9],
    ['c', 8, 6], ['C', 3, 11, 4, 11], ['c', 6, 11], ['c', 9, 9],
    ['c', 22, 24], ['c', 21, 14], ['C', 24, 20],
    ['c', 38, 22, 39, 22], ['=', 37, 17, 38, 17], ['C', 40, 27],
    ['c', 30, 14], ['c', 13, 20], ['c', 5, 24], ['c', 6, 14],
    ['=', 29, 5], ['=', 14, 3], ['c', 12, 32], ['c', 33, 31],
  ],
};

const bazaar = {
  id: 'bazaar', name: '綠洲市集', desc: '對稱的中央廣場，兩個拱門通往包點', W: 40, H: 34,
  theme: {
    sky: 0xffc98a, fog: 0xf3c9a0, ground: 0xd9b27c, sun: 0xffd9a8,
    walls: [0xe9b48a, 0xd99f77, 0xf2c79f, 0xc98f6a, 0x8fc7c2], crate: 0xa8703a,
    containers: [0x3f8f8a, 0xc75b4a, 0xd9a13f],
  },
  ops: [
    ['T', 2, 13, 7, 20], ['D', 32, 13, 37, 20],
    ['carve', 12, 10, 27, 23],
    ['carve', 14, 2, 25, 7], ['A', 18, 3, 21, 6],
    ['carve', 14, 26, 25, 31], ['B', 18, 27, 21, 30],
    ['carve', 8, 15, 11, 18], ['carve', 28, 15, 31, 18],
    ['carve', 3, 3, 6, 12], ['carve', 3, 3, 13, 5],
    ['carve', 3, 21, 6, 30], ['carve', 3, 28, 13, 30],
    ['carve', 33, 3, 36, 12], ['carve', 26, 3, 36, 5],
    ['carve', 33, 21, 36, 30], ['carve', 26, 28, 36, 30],
    ['carve', 18, 8, 21, 9], ['roof', 18, 8, 21, 9],
    ['carve', 18, 24, 21, 25], ['roof', 18, 24, 21, 25],
    ['#', 18, 15, 21, 18],
    ['=', 14, 12, 15, 12], ['=', 24, 21, 25, 21], ['=', 14, 21, 15, 21], ['=', 24, 12, 25, 12],
    ['c', 16, 19], ['c', 23, 14], ['C', 13, 16, 13, 17], ['C', 26, 16, 26, 17],
    ['C', 16, 4], ['C', 23, 5], ['c', 17, 6], ['c', 22, 3],
    ['C', 16, 29], ['C', 23, 28], ['c', 22, 30], ['c', 17, 27],
    ['c', 4, 8], ['c', 5, 25], ['c', 35, 8], ['c', 34, 25], ['c', 9, 4], ['c', 30, 29], ['c', 9, 29], ['c', 30, 4],
  ],
};

const depot = {
  id: 'depot', name: '貨運站', desc: '小而快的近戰圖，貨櫃之間到處是轉角', W: 30, H: 24,
  theme: {
    sky: 0xa9c4d6, fog: 0xbfcfd6, ground: 0x9aa39a, sun: 0xffffff,
    walls: [0x7f8c8d, 0x8d9a9b, 0x6f7c7d], crate: 0xb58a4a,
    containers: [0xc0453a, 0x2f7fbf, 0x3f9a5a, 0xd9a13f, 0x7a5cc0],
  },
  ops: [
    ['carve', 2, 2, 27, 21],
    ['T', 11, 19, 18, 21], ['D', 11, 2, 18, 3],
    ['A', 22, 9, 25, 12], ['B', 4, 9, 7, 12],
    ['C', 9, 5, 10, 9], ['C', 9, 13, 10, 17], ['C', 19, 5, 20, 9], ['C', 19, 13, 20, 17],
    ['C', 13, 6, 16, 7], ['C', 13, 15, 16, 16], ['C', 14, 10, 15, 12],
    ['c', 23, 7], ['c', 24, 14], ['c', 5, 7], ['c', 6, 14], ['c', 12, 12], ['c', 17, 10],
    ['c', 3, 17], ['c', 26, 5], ['C', 3, 4], ['C', 26, 18],
    ['=', 22, 16, 23, 16], ['=', 6, 5, 7, 5], ['=', 12, 9], ['=', 17, 13],
  ],
};

export const MAPS = [sandtown, bazaar, depot].map(build);
