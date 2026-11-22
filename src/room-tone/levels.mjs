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
  return w > 0 && Number.isInteger(id) && id >= 0 && id < w * map.length &&
    map[Math.floor(id / w)]?.[id % w] === ".";
}
export function neighbors(map, id) {
  if (!walkable(map, id)) return [];
  const w = map[0].length;
  const x = id % w;
  const z = Math.floor(id / w);
  const result = [];
  // Preserve the right/left/down/up tie-break order. Avoid creating four
  // coordinate arrays and two intermediary arrays on every BFS expansion.
  if (map[z]?.[x + 1] === ".") result.push(id + 1);
  if (map[z]?.[x - 1] === ".") result.push(id - 1);
  if (map[z + 1]?.[x] === ".") result.push(id + w);
  if (map[z - 1]?.[x] === ".") result.push(id - w);
  return result;
}
export function paths(map, start) {
  const prev = new Int32Array(map.length * (map[0]?.length ?? 0)).fill(-2),
    dist = new Int32Array(prev.length).fill(-1),
    q = [];
  if (!walkable(map, start)) return { prev, dist, q };
  q.push(start);
  prev[start] = -1;
  dist[start] = 0;
  // Inline the four neighbor checks in BFS. Replanning runs frequently while
  // the creature pursues the player: no per-cell neighbor arrays are needed.
  // Keep the existing right, left, down, up tie-breaking order.
  const width = map[0].length;
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    const x = c % width, z = Math.floor(c / width);
    const row = map[z];
    const depth = dist[c] + 1;
    if (row[x + 1] === "." && prev[c + 1] === -2) {
      prev[c + 1] = c; dist[c + 1] = depth; q.push(c + 1);
    }
    if (row[x - 1] === "." && prev[c - 1] === -2) {
      prev[c - 1] = c; dist[c - 1] = depth; q.push(c - 1);
    }
    if (map[z + 1]?.[x] === "." && prev[c + width] === -2) {
      prev[c + width] = c; dist[c + width] = depth; q.push(c + width);
    }
    if (map[z - 1]?.[x] === "." && prev[c - width] === -2) {
      prev[c - width] = c; dist[c - width] = depth; q.push(c - width);
    }
  }
  return { prev, dist, q };
}
export function routeFrom(tree, start, goal) {
  const { prev, dist } = tree;
  if (!Number.isInteger(start) || !Number.isInteger(goal) ||
      start < 0 || goal < 0 || start >= prev.length || goal >= prev.length ||
      dist[start] !== 0 || dist[goal] < 0) return [];
  const out = [];
  let cursor = goal;
  for (let n = prev.length; cursor !== start && n > 0; n--) {
    if (cursor < 0 || cursor >= prev.length) return [];
    out.push(cursor);
    cursor = prev[cursor];
  }
  return cursor === start ? out.reverse() : [];
}
export function route(map, a, b) {
  return routeFrom(paths(map, a), a, b);
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
  const ds = [base.dist];
  function far() {
    let best = -1, score = -1;
    for (const cell of base.q) {
      let nearest = Infinity;
      for (const distances of ds) {
        if (distances[cell] < nearest) nearest = distances[cell];
      }
      const x = cell % w, z = Math.floor(cell / w);
      const degree =
        Number(map[z]?.[x + 1] === ".") +
        Number(map[z]?.[x - 1] === ".") +
        Number(map[z + 1]?.[x] === ".") +
        Number(map[z - 1]?.[x] === ".");
      const v = nearest + 0.012 * (degree === 1 ? 1 : 0);
      if (v > score) {
        score = v;
        best = cell;
      }
    }
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
