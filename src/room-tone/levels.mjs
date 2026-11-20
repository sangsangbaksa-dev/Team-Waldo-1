export const chapters = [
  {
    title: "끊어진 전원",
    location: "전원 정비동",
    item: "퓨즈",
    station: "분전반",
    goal: "분전반에 맞는 퓨즈 세 개를 찾으세요.",
    story:
      "비상등만 살아 있다. 출입문을 열려면 세 회로에 전력을 돌려줘야 한다.",
    names: ["환기 회로", "조명 회로", "녹음 회로"],
    labels: ["5 A", "10 A", "15 A"],
    kind: "fuse",
    size: 21,
  },
  {
    title: "주파수의 방",
    location: "송신 제어동",
    item: "주파수표",
    station: "단파 수신기",
    goal: "세 송신기의 주파수표를 회수하세요.",
    story:
      "잡음 사이로 같은 호흡이 겹친다. 송신기 세 대의 주파수를 복원하면 방음문이 열린다.",
    names: ["송신기 A", "송신기 B", "송신기 C"],
    labels: ["72.4 MHz", "83.6 MHz", "91.8 MHz"],
    kind: "tune",
    size: 23,
  },
  {
    title: "거꾸로 감긴 테이프",
    location: "자기 테이프 보관동",
    item: "테이프",
    station: "릴 편집기",
    goal: "흩어진 세 개의 릴을 찾아 녹음 시각을 확인하세요.",
    story:
      "릴에 남은 시각은 다르다. 편집기는 마지막으로 녹음된 소리부터 거꾸로 읽는다.",
    names: ["유리 울림", "문 두드림", "들숨"],
    labels: ["01:48", "03:12", "02:26"],
    kind: "order",
    size: 25,
  },
  {
    title: "마지막 무음",
    location: "마스터 녹음실",
    item: "위상 카드",
    station: "마스터 콘솔",
    goal: "세 마이크의 위상 카드를 찾아 잔향을 상쇄하세요.",
    story:
      "출구 앞에서 소리가 되감긴다. 마스터 채널의 파형을 반대로 겹치면, 잠시 완전한 무음이 찾아온다.",
    names: ["바닥 마이크", "벽면 마이크", "천장 마이크"],
    labels: ["0°", "270°", "180°"],
    kind: "phase",
    size: 27,
  },
];
function random(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
export function walkable(map, id) {
  const w = map[0]?.length ?? 0;
  return Number.isInteger(id) && w > 0 && id >= 0 && id < w * map.length &&
    map[Math.floor(id / w)]?.[id % w] === ".";
}
export function neighbors(map, id) {
  if (!walkable(map, id)) return [];
  const w = map[0].length,
    x = id % w,
    z = Math.floor(id / w);
  return [
    [x + 1, z],
    [x - 1, z],
    [x, z + 1],
    [x, z - 1],
  ]
    .filter(([a, b]) => map[b]?.[a] === ".")
    .map(([a, b]) => b * w + a);
}
export function paths(map, start) {
  const prev = new Int32Array(map.length * (map[0]?.length ?? 0)).fill(-2),
    dist = new Int32Array(prev.length).fill(-1),
    q = [];
  if (!walkable(map, start)) return { prev, dist, q };
  q.push(start);
  prev[start] = -1;
  dist[start] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    for (const k of neighbors(map, c)) {
      if (prev[k] !== -2) continue;
      prev[k] = c;
      dist[k] = dist[c] + 1;
      q.push(k);
    }
  }
  return { prev, dist, q };
}
export function routeFrom(tree, a, b) {
  const { prev, dist } = tree;
  if (!Number.isInteger(a) || !Number.isInteger(b) ||
      a < 0 || b < 0 || a >= prev.length || b >= prev.length ||
      dist[a] !== 0 || dist[b] < 0) return [];
  const out = [];
  let c = b;
  for (let remaining = prev.length; c !== a && remaining > 0; remaining--) {
    if (c < 0 || c >= prev.length || dist[c] <= 0) return [];
    out.push(c);
    const parent = prev[c];
    if (parent < 0 || parent >= prev.length || dist[parent] !== dist[c] - 1) return [];
    c = parent;
  }
  return c === a ? out.reverse() : [];
}
export function route(map, a, b) {
  if (!walkable(map, a) || !walkable(map, b) || a === b) return [];
  return routeFrom(paths(map, a), a, b);
}

// Supercover traversal prevents sight and interactions through wall corners.
export function lineOpen(map, a, b, tile) {
  if (!(tile > 0) || ![a.x, a.z, b.x, b.z, tile].every(Number.isFinite)) return false;
  const ax = a.x / tile + .5, az = a.z / tile + .5;
  const bx = b.x / tile + .5, bz = b.z / tile + .5;
  let x = Math.floor(ax), z = Math.floor(az);
  const endX = Math.floor(bx), endZ = Math.floor(bz);
  const dx = bx - ax, dz = bz - az;
  const sx = Math.sign(dx), sz = Math.sign(dz);
  const tx = sx ? 1 / Math.abs(dx) : Infinity;
  const tz = sz ? 1 / Math.abs(dz) : Infinity;
  let mx = sx ? (sx > 0 ? x + 1 - ax : ax - x) * tx : Infinity;
  let mz = sz ? (sz > 0 ? z + 1 - az : az - z) * tz : Infinity;
  const open = (u, v) => map[v]?.[u] === ".";
  if (!open(x, z) || !open(endX, endZ)) return false;
  while (x !== endX || z !== endZ) {
    const nextX = x === endX ? Infinity : mx;
    const nextZ = z === endZ ? Infinity : mz;
    if (Math.abs(nextX - nextZ) < 1e-10) {
      if (!open(x + sx, z) || !open(x, z + sz)) return false;
      x += sx; z += sz; mx += tx; mz += tz;
    } else if (nextX < nextZ) {
      x += sx; mx += tx;
    } else {
      z += sz; mz += tz;
    }
    if (!open(x, z)) return false;
  }
  return true;
}
export function normalizeSave(s) {
  if (s?.v !== 1 || !Number.isInteger(s.ch) || s.ch < 0 || s.ch >= chapters.length ||
      !Array.isArray(s.found) || s.found.length !== 3) return null;
  const found = s.found.map(v => v === true);
  const w = chapters[s.ch].size;
  const visited = Array.isArray(s.seen) ? s.seen.filter(v =>
    Number.isInteger(v) && v >= 0 && v < w * w) : [];
  return { v: 1, ch: s.ch, found, solved: s.solved === true && found.every(Boolean),
    seen: [...new Set(visited)], elapsed: Number.isFinite(s.elapsed) && s.elapsed >= 0 ? s.elapsed : 0 };
}
export function makeLevel(ch) {
  const w = chapters[ch].size,
    r = random(19831 + ch * 923),
    g = Array.from({ length: w }, () => Array(w).fill("#")),
    stack = [[1, 1]];
  g[1][1] = ".";
  while (stack.length) {
    const [x, z] = stack[stack.length - 1];
    const ns = [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ].filter(
      ([dx, dz]) =>
        x + dx > 0 &&
        x + dx < w - 1 &&
        z + dz > 0 &&
        z + dz < w - 1 &&
        g[z + dz][x + dx] === "#",
    );
    if (!ns.length) {
      stack.pop();
      continue;
    }
    const [dx, dz] = ns[Math.floor(r() * ns.length)];
    g[z + dz / 2][x + dx / 2] = ".";
    g[z + dz][x + dx] = ".";
    stack.push([x + dx, z + dz]);
  }
  for (let i = 0; i < Math.floor(w * 0.76); i++) {
    const x = 2 + Math.floor(r() * (w - 4)),
      z = 2 + Math.floor(r() * (w - 4));
    if (
      g[z][x] === "#" &&
      ((g[z - 1][x] === "." && g[z + 1][x] === ".") ||
        (g[z][x - 1] === "." && g[z][x + 1] === "."))
    )
      g[z][x] = ".";
  }
  for (let i = 0; i < 4; i++) {
    const x = 1 + 2 * Math.floor((r() * (w - 5)) / 2),
      z = 1 + 2 * Math.floor((r() * (w - 5)) / 2);
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) g[z + j][x + k] = ".";
  }
  const map = g.map((row) => row.join(""));
  const start = w + 1;
  const base = paths(map, start);
  const selected = [start],
    ds = [base.dist];
  function far() {
    let best = -1,
      score = -1;
    for (const cell of base.q) {
      const v =
        Math.min(...ds.map((d) => d[cell])) +
        0.012 * (neighbors(map, cell).length === 1 ? 1 : 0);
      if (v > score) {
        score = v;
        best = cell;
      }
    }
    selected.push(best);
    ds.push(paths(map, best).dist);
    return best;
  }
  const first = far(),
    second = far(),
    third = far(),
    exit = far(),
    nest = far();
  return {
    map,
    w,
    start,
    station: start,
    items: [second, first, third],
    exit,
    nest,
    reachable: base.q,
  };
}
