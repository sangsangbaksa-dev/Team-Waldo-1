// 노트북 속 전략 게임(FRONTLINE 풍 탑뷰 RTS). 영상 창은 양쪽 AI 가 싸우는 장면, 게임 창은 왼쪽(0번 팀)을 플레이어가 지시한다. sim 과 무관.
export const W = 320, H = 180;
const MAX_DPR = 2;
export function resizeBattleCanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number, dpr: number): void {
  if (!Number.isFinite(cssWidth) || !Number.isFinite(cssHeight) || cssWidth <= 0 || cssHeight <= 0) return;
  const scale = Number.isFinite(dpr) && dpr > 0 ? Math.min(MAX_DPR, dpr) : 1;
  const width = Math.max(1, Math.round(cssWidth * scale));
  const height = Math.max(1, Math.round(cssHeight * scale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}
type K = 'w' | 'i' | 't';
type Team = 0 | 1;
interface T { team: Team; x: number; y: number; hp: number; r: number }
interface U extends T { id: number; k: K; max: number; cd: number; ang: number; dest: { x: number; y: number } | null; tgt: T | null; carry: number; gt: number }
interface B extends T { b: 'hq' | 'bar'; w: number; h: number; max: number }
export type BattleEvent = 'train' | 'order' | 'boom' | 'hq' | 'win' | 'lose';

const S = {
  w: { hp: 30, sp: 22, cost: 20, build: 0.7, rng: 0, dmg: 0, cd: 1, r: 2.6, sight: 0 },
  i: { hp: 40, sp: 17, cost: 30, build: 1, rng: 22, dmg: 7, cd: 0.7, r: 2.4, sight: 46 },
  t: { hp: 150, sp: 20, cost: 90, build: 3, rng: 40, dmg: 24, cd: 1.5, r: 4.2, sight: 58 },
} as const;
export const COST = { w: S.w.cost, i: S.i.cost, t: S.t.cost };
// 지형: 강(세로 띠)과 다리 한 곳, 바위(통행 불가), 숲(느림·엄폐), 언덕(사거리 증가)
const RX0 = 150, RX1 = 170, BY = 90, BH = 15;
const ROCKS: [number, number, number][] = [[122, 56, 7], [122, 124, 7], [198, 56, 7], [198, 124, 7], [88, 92, 5], [232, 88, 5], [62, 98, 6]];
const FORESTS: [number, number, number][] = [[92, 38, 22], [96, 144, 22], [226, 36, 22], [222, 142, 22], [140, 16, 14], [180, 164, 14]];
const HILLS: [number, number, number, number][] = [[112, 90, 24, 18], [208, 90, 24, 18]];
const NODES: [number, number][] = [[52, 50], [52, 130], [268, 50], [268, 130]];
const HQ: [number, number][] = [[30, BY], [290, BY]];
const COL = ['#3f8fe0', '#d9503f'];

const inForest = (x: number, y: number) => FORESTS.some(f => { const dx = x - f[0], dy = y - f[1], rad = f[2] * 0.9; return dx * dx + dy * dy < rad * rad; });
const onHill = (x: number, y: number) => HILLS.some(h => ((x - h[0]) / h[2]) ** 2 + ((y - h[1]) / h[3]) ** 2 < 1);
const inBand = (x: number, r: number) => x + r > RX0 && x - r < RX1;
const isB = (t: T): t is B => 'b' in t;

let terrain: HTMLCanvasElement | null = null, canopy: HTMLCanvasElement | null = null;
function buildMaps() {
  const mk = () => { const c = document.createElement('canvas'); c.width = W * MAX_DPR; c.height = H * MAX_DPR; return c; };
  const ground = mk(), crowns = mk();
  const g = ground.getContext('2d'), c = crowns.getContext('2d');
  if (!g || !c) return;
  terrain = ground; canopy = crowns;
  g.scale(MAX_DPR, MAX_DPR); c.scale(MAX_DPR, MAX_DPR);
  let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.fillStyle = '#5a7a42'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) { g.fillStyle = `hsl(${90 + r() * 25} ${30 + r() * 15}% ${27 + r() * 12}%)`; g.fillRect(r() * W, r() * H, 2 + r() * 3, 1 + r() * 2); }
  g.lineCap = 'round'; g.globalAlpha = 0.7; g.strokeStyle = '#8c7c58'; g.lineWidth = 9;
  g.beginPath(); g.moveTo(40, BY); g.lineTo(RX0, BY); g.moveTo(RX1, BY); g.lineTo(280, BY); g.stroke(); g.globalAlpha = 1;
  for (const h of HQ) { g.fillStyle = '#7d704f'; g.beginPath(); g.arc(h[0], h[1], 30, 0, 7); g.fill(); }
  for (const f of FORESTS) { g.fillStyle = 'rgba(20,40,20,.35)'; g.beginPath(); g.arc(f[0], f[1], f[2] * 0.95, 0, 7); g.fill(); }
  for (const h of HILLS) {
    for (let k = 0; k < 5; k++) { g.fillStyle = `rgba(${200 + k * 8},${210 + k * 6},150,${0.1 + k * 0.03})`; g.beginPath(); g.ellipse(h[0] - k * 1.5, h[1] - k * 1.2, h[2] * (1 - k * 0.17), h[3] * (1 - k * 0.17), 0, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(40,50,20,.45)'; g.lineWidth = 1; g.beginPath(); g.ellipse(h[0], h[1], h[2], h[3], 0, 0.2, 2.6); g.stroke();
  }
  // 강 + 둑
  const river = (w: number) => { g.beginPath(); g.moveTo(RX0 - w, 0); for (let y = 0; y <= H; y += 6) g.lineTo(RX0 - w + Math.sin(y / 11) * 1.6, y); for (let y = H; y >= 0; y -= 6) g.lineTo(RX1 + w + Math.sin(y / 9) * 1.6, y); g.closePath(); };
  g.fillStyle = '#cdbb85'; river(2); g.fill(); g.fillStyle = '#3a74ad'; river(0); g.fill();
  g.strokeStyle = '#8ec3ea'; g.lineWidth = 0.7;
  for (let i = 0; i < 26; i++) { const x = RX0 + 2 + r() * 16, y = r() * H; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 5, y + 1); g.stroke(); }
  g.fillStyle = '#7a5a37'; g.fillRect(RX0 - 4, BY - BH, RX1 - RX0 + 8, BH * 2);
  g.fillStyle = '#5a4128'; for (let x = RX0 - 3; x < RX1 + 4; x += 4) g.fillRect(x, BY - BH, 1, BH * 2);
  g.fillStyle = '#3f2e1d'; g.fillRect(RX0 - 4, BY - BH - 1, RX1 - RX0 + 8, 2); g.fillRect(RX0 - 4, BY + BH - 1, RX1 - RX0 + 8, 2);
  g.fillStyle = '#d5ad68';
  for (const x of [RX0 - 4, RX1 + 2]) for (const y of [BY - BH, BY + BH - 1]) g.fillRect(x, y, 2, 1);
  for (const k of ROCKS) {
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(k[0] + 1.5, k[1] + 2, k[2], k[2] * 0.8, 0, 0, 7); g.fill();
    g.fillStyle = '#8b8f8d'; g.beginPath(); g.arc(k[0], k[1], k[2], 0, 7); g.fill();
    g.fillStyle = '#b7bbb6'; g.beginPath(); g.arc(k[0] - k[2] * 0.3, k[1] - k[2] * 0.3, k[2] * 0.5, 0, 7); g.fill();
  }
  for (const f of FORESTS) for (let i = 0; i < f[2] * 1.7; i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * f[2], x = f[0] + Math.cos(a) * d, y = f[1] + Math.sin(a) * d, tr = 3.5 + r() * 2.5;
    c.fillStyle = `hsl(${105 + r() * 30} 40% ${20 + r() * 10}%)`; c.beginPath(); c.arc(x, y, tr, 0, 7); c.fill();
    c.fillStyle = 'rgba(190,230,120,.25)'; c.beginPath(); c.arc(x - 1, y - 1, tr * 0.5, 0, 7); c.fill();
  }
}

interface Fx { x1: number; y1: number; x2: number; y2: number; t: number }
interface Boom { x: number; y: number; t: number; big: boolean }

export function createBattle(player: boolean, on?: (e: BattleEvent) => void) {
  if (!terrain) buildMaps();
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  let units: U[] = [], blds: B[] = [], nid = 0, endT = 0, bridgeT = 2, dirty = false;
  let ore = [100, 100], prod = [0, 0], atk = [false, false];
  const thinkT = [rnd(0, 1), rnd(0.5, 1.5)];
  let nodeAmt = [1500, 1500, 1500, 1500];
  const tr: Fx[] = [], bm: Boom[] = [];
  let ping: { x: number; y: number; t: number; a: boolean } | null = null;
  const b = { ore: 0, score: 0, over: null as Team | null, cap: '', capT: 0, flash: 0, army: 0, prod: 0, time: 0 };
  const say = (s: string) => { if (b.capT <= 0 || b.cap !== s) { b.cap = s; b.capT = 3.2; } };

  const spawn = (team: Team, k: K, rally = true) => {
    const hq = blds.find(x => x.team === team && x.b === 'hq')!;
    const u: U = { id: nid++, team, k, x: hq.x + (team ? -18 : 18), y: hq.y + rnd(-14, 14), hp: S[k].hp, r: S[k].r, max: S[k].hp, cd: rnd(0, 0.5), ang: team ? Math.PI : 0, dest: null, tgt: null, carry: 0, gt: 0 };
    if (k !== 'w' && rally) u.dest = { x: HQ[team][0] + (team ? -78 : 78), y: BY + rnd(-22, 22) };
    units.push(u); return u;
  };
  const reset = () => {
    units = []; tr.length = 0; bm.length = 0; ping = null; endT = 0; bridgeT = 2; dirty = false;
    Object.assign(b, { over: null, time: 0, score: 0, cap: '', capT: 0, flash: 0, ore: 100, army: 2, prod: 0 });
    ore = [100, 100]; prod = [0, 0]; atk = [false, false]; nodeAmt = [1500, 1500, 1500, 1500];
    blds = [];
    for (const t of [0, 1] as Team[]) {
      blds.push({ team: t, b: 'hq', x: HQ[t][0], y: HQ[t][1], w: 22, h: 22, hp: 600, max: 600, r: 11 });
      blds.push({ team: t, b: 'bar', x: HQ[t][0] + (t ? -2 : 2), y: BY - 42, w: 14, h: 10, hp: 220, max: 220, r: 7 });
      spawn(t, 'w'); spawn(t, 'w'); spawn(t, 'i', false); spawn(t, 'i', false);
    }
  };
  const blocked = (x: number, y: number, r: number) => {
    if (x < r || y < r || x > W - r || y > H - r) return true;
    if (inBand(x, r) && Math.abs(y - BY) > BH - r) return true;
    for (const k of ROCKS) { const dx = x - k[0], dy = y - k[1], rad = k[2] + r; if (dx * dx + dy * dy < rad * rad) return true; }
    for (const d of blds) if (Math.abs(x - d.x) < d.w / 2 + r && Math.abs(y - d.y) < d.h / 2 + r) return true;
    return false;
  };
  // 강 건너편이면 다리 입구 → 다리 건너기 순으로 경유
  const side = (x: number) => (x < RX0 ? 0 : x > RX1 ? 2 : 1);
  const route = (u: U, tx: number, ty: number): [number, number] => {
    const a = side(u.x), c = side(tx);
    if (a === c && a !== 1) return [tx, ty];
    if (a === 1) return c === 1 ? [tx, ty] : [c === 2 ? RX1 + 10 : RX0 - 10, BY];
    const ex = a === 0 ? RX0 - 8 : RX1 + 8;
    if (Math.abs(u.y - BY) < BH - 2 && Math.abs(u.x - ex) < 6) return [a === 0 ? RX1 + 10 : RX0 - 10, BY];
    return [ex, BY];
  };
  const move = (u: U, tx: number, ty: number, dt: number) => {
    const [wx, wy] = route(u, tx, ty), dx = wx - u.x, dy = wy - u.y, d = Math.hypot(dx, dy);
    if (d < 0.5) return;
    const sp = S[u.k].sp * (inForest(u.x, u.y) ? 0.55 : onHill(u.x, u.y) ? 0.8 : 1), m = Math.min(d, sp * dt);
    const nx = u.x + (dx / d) * m, ny = u.y + (dy / d) * m;
    u.ang = Math.atan2(dy, dx);
    if (!blocked(nx, ny, u.r)) { u.x = nx; u.y = ny; }
    else if (!blocked(nx, u.y, u.r)) u.x = nx;
    else if (!blocked(u.x, ny, u.r)) u.y = ny;
    else for (const sg of [1, -1]) { const px = u.x - (dy / d) * m * sg, py = u.y + (dx / d) * m * sg; if (!blocked(px, py, u.r)) { u.x = px; u.y = py; break; } }
  };
  const boom = (x: number, y: number, big: boolean) => { if (bm.length > 40) bm.shift(); bm.push({ x, y, t: big ? 0.8 : 0.4, big }); b.flash = Math.min(1, b.flash + (big ? 0.6 : 0.25)); on?.('boom'); };
  const kill = (t: T, by: U) => {
    dirty = true;
    if (isB(t)) {
      boom(t.x, t.y, true);
      if (t.b === 'hq') { b.over = by.team; endT = 4; if (by.team === 0 && player) b.score += 100; say(by.team === 0 ? '청군 본진 점령, 승리!' : '적군이 본진을 함락했다'); on?.(!player ? 'hq' : by.team === 0 ? 'win' : 'lose'); }
      else say('병영 파괴!');
    } else {
      const u = t as U; boom(u.x, u.y, u.k === 't');
      if (by.team === 0) b.score += u.k === 't' ? 30 : 10;
      if (u.k === 't') say('전차 격파!'); else if (inForest(by.x, by.y) && u.k === 'i') say('숲속 매복 성공');
    }
  };
  const launch = (team: Team) => {
    for (const u of units) if (u.team === team && u.k !== 'w' && !u.tgt) u.dest = { x: HQ[1 - team][0], y: HQ[1 - team][1] };
  };
  const train = (team: Team, k: K) => {
    if (b.over !== null || prod[team] > 0 || ore[team] < S[k].cost) return false;
    ore[team] -= S[k].cost; prod[team] = S[k].build; spawn(team, k); return true;
  };
  const think = (team: Team) => {
    const mine = units.filter(u => u.team === team), ws = mine.filter(u => u.k === 'w').length, army = mine.length - ws;
    if (prod[team] <= 0) {
      if (ws < 3 && ore[team] >= 20) train(team, 'w');
      else if (ore[team] >= 90 && Math.random() < 0.55) train(team, 't');
      else if (ore[team] >= 30) train(team, 'i');
    }
    if (!atk[team] && army >= 7) { atk[team] = true; say(team === 0 ? '청군 총공격 개시' : '적군 반격 개시'); }
    else if (atk[team] && army <= 2) atk[team] = false;
    if (atk[team]) launch(team);
  };

  const update = (dt: number) => {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    b.time += dt; b.flash = Math.max(0, b.flash - dt * 2.2); b.capT = Math.max(0, b.capT - dt);
    if (b.over !== null) { endT -= dt; if (endT <= 0) reset(); return; }
    for (const t of [0, 1] as Team[]) {
      prod[t] = Math.max(0, prod[t] - dt);
      if (player && t === 0) continue;
      thinkT[t] -= dt; if (thinkT[t] <= 0) { thinkT[t] = 1.3; think(t); }
    }
    let band = 0;
    for (let n = 0; n < units.length; n++) {
      const u = units[n], st = S[u.k], hq = blds.find(x => x.team === u.team && x.b === 'hq');
      if (u.hp <= 0) continue;
      u.cd -= dt;
      if (u.k === 'w') {
        if (!hq) continue;
        if (u.carry >= 10) { if (Math.hypot(u.x - hq.x, u.y - hq.y) < 20) { ore[u.team] += u.carry; u.carry = 0; } else move(u, hq.x, hq.y, dt); }
        else { const ni = u.team * 2 + (u.id % 2), nd = NODES[ni]; if (Math.hypot(u.x - nd[0], u.y - nd[1]) < 7) { u.gt += dt; if (u.gt >= 1.6 && nodeAmt[ni] > 0) { u.gt = 0; u.carry = 10; nodeAmt[ni] -= 10; } } else move(u, nd[0], nd[1], dt); }
        continue;
      }
      if (Math.abs(u.x - (RX0 + RX1) / 2) < 22) band++;
      // 표적: 지정한 적이 살아 있으면 계속, 아니면 시야 안 가장 가까운 적
      let t = u.tgt && u.tgt.hp > 0 ? u.tgt : null;
      if (!t) {
        let best: number = st.sight;
        for (const e of units) if (e.team !== u.team && e.hp > 0) { const dx = e.x - u.x, dy = e.y - u.y, squared = dx * dx + dy * dy; if (best > 0 && squared < best * best) { best = Math.sqrt(squared); t = e; } }
        for (const e of blds) if (e.team !== u.team && e.hp > 0) { const dx = e.x - u.x, dy = e.y - u.y, squared = dx * dx + dy * dy, reach = best + e.r; if (reach > 0 && squared < reach * reach) { const dist = Math.sqrt(squared) - e.r; if (dist < best) { best = dist; t = e; } } }
        u.tgt = null;
      }
      if (t) {
        const d = Math.hypot(t.x - u.x, t.y - u.y), rng = st.rng * (onHill(u.x, u.y) ? 1.15 : 1) + t.r;
        u.ang = Math.atan2(t.y - u.y, t.x - u.x);
        if (d <= rng) {
          if (u.cd <= 0) {
            u.cd = st.cd; const dmg = st.dmg * (u.k === 't' && isB(t) ? 1.4 : 1) * (!isB(t) && inForest(t.x, t.y) ? 0.55 : 1);
            t.hp -= dmg; if (tr.length > 60) tr.shift(); tr.push({ x1: u.x, y1: u.y, x2: t.x, y2: t.y, t: 0.12 });
            b.flash = Math.min(1, b.flash + (u.k === 't' ? 0.12 : 0.03));
            if (t.hp <= 0) { kill(t, u); if (b.over !== null) break; }
          }
        } else move(u, t.x, t.y, dt);
      } else if (u.dest) { move(u, u.dest.x, u.dest.y, dt); if (Math.hypot(u.dest.x - u.x, u.dest.y - u.y) < 4) u.dest = null; }
      // 같은 편끼리 겹치지 않게 살짝 밀어냄
      for (let m = n + 1; m < units.length; m++) {
        const o = units[m], dx = o.x - u.x, dy = o.y - u.y, squared = dx * dx + dy * dy, min = u.r + o.r;
        if (squared > 0 && squared < min * min) { const d = Math.sqrt(squared), p = (min - d) * 0.25 / d; if (!blocked(u.x - dx * p, u.y - dy * p, u.r)) { u.x -= dx * p; u.y -= dy * p; } if (!blocked(o.x + dx * p, o.y + dy * p, o.r)) { o.x += dx * p; o.y += dy * p; } }
      }
    }
    bridgeT -= dt; if (bridgeT <= 0) { bridgeT = 2; if (band >= 4 && b.capT <= 0) say('다리 위 교전'); }
    if (dirty) { dirty = false; units = units.filter(u => u.hp > 0); blds = blds.filter(d => d.hp > 0 || d.b === 'hq'); }
    for (const f of tr) f.t -= dt; while (tr.length && tr[0].t <= 0) tr.shift();
    for (let i = bm.length - 1; i >= 0; i--) { bm[i].t -= dt; if (bm[i].t <= 0) bm.splice(i, 1); }
    if (ping) { ping.t -= dt; if (ping.t <= 0) ping = null; }
    b.ore = Math.floor(ore[0]); b.army = units.filter(u => u.team === 0 && u.k !== 'w').length; b.prod = prod[0];
  };

  const bar = (g: CanvasRenderingContext2D, x: number, y: number, w: number, f: number) => { g.fillStyle = '#000a'; g.fillRect(x - w / 2, y, w, 1.6); g.fillStyle = f > 0.5 ? '#6fe06f' : f > 0.25 ? '#e0c24a' : '#e05a4a'; g.fillRect(x - w / 2, y, w * Math.max(0, f), 1.6); };
  const draw = (g: CanvasRenderingContext2D) => {
    if (!terrain || !canopy) return;
    g.setTransform(g.canvas.width / W, 0, 0, g.canvas.height / H, 0, 0);
    g.drawImage(terrain, 0, 0, W, H);
    NODES.forEach((n, i) => { const f = Math.max(0.2, nodeAmt[i] / 1500); g.fillStyle = '#69d6e8'; g.beginPath(); g.moveTo(n[0], n[1] - 6 * f); g.lineTo(n[0] + 5 * f, n[1] + 3); g.lineTo(n[0] - 5 * f, n[1] + 3); g.fill(); g.fillStyle = '#d9f8ff'; g.fillRect(n[0] - 1, n[1] - 3 * f, 1.4, 3); });
    for (const d of blds) {
      const x = d.x - d.w / 2, y = d.y - d.h / 2;
      g.fillStyle = '#23272d'; g.fillRect(x - 1, y - 1, d.w + 2, d.h + 2); g.fillStyle = COL[d.team]; g.fillRect(x + 1.5, y + 1.5, d.w - 3, d.h - 3);
      g.fillStyle = 'rgba(255,255,255,.28)'; if (d.b === 'hq') { g.fillRect(x + 5, y + 5, d.w - 10, d.h - 10); g.fillStyle = '#23272d'; g.fillRect(d.x - 0.5, y - 6, 1.2, 6); g.fillStyle = COL[d.team]; g.fillRect(d.x + 0.7, y - 6, 4, 3); } else g.fillRect(x + 2, y + 2, d.w - 4, 2);
      if (d.hp < d.max) bar(g, d.x, y - 3, d.w, d.hp / d.max);
    }
    for (const u of units) {
      if (player && u.team === 0 && u.k !== 'w') { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 0.6; g.beginPath(); g.arc(u.x, u.y, u.r + 1.6, 0, 7); g.stroke(); }
      g.save(); g.translate(u.x, u.y); g.rotate(u.ang);
      if (u.k === 't') { g.fillStyle = '#23272d'; g.fillRect(-5, -3.6, 10, 7.2); g.fillStyle = COL[u.team]; g.fillRect(-4.4, -3, 8.8, 6); g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(0, 0, 2.6, 0, 7); g.fill(); g.fillStyle = '#23272d'; g.fillRect(0, -0.6, 7, 1.2); }
      else if (u.k === 'i') { g.fillStyle = COL[u.team]; g.beginPath(); g.arc(0, 0, 2.2, 0, 7); g.fill(); g.fillStyle = '#23272d'; g.fillRect(1, -0.4, 3.4, 0.8); }
      else { g.fillStyle = '#e8c44a'; g.beginPath(); g.arc(0, 0, 2.4, 0, 7); g.fill(); g.strokeStyle = COL[u.team]; g.lineWidth = 0.9; g.stroke(); if (u.carry) { g.fillStyle = '#69d6e8'; g.fillRect(-1, -1, 2, 2); } }
      g.restore();
      if (u.hp < u.max) bar(g, u.x, u.y - u.r - 3, 7, u.hp / u.max);
    }
    g.strokeStyle = '#ffe9a0'; g.lineWidth = 0.9; g.beginPath(); for (const f of tr) { g.moveTo(f.x1, f.y1); g.lineTo(f.x2, f.y2); } g.stroke();
    g.globalAlpha = 0.8; g.drawImage(canopy, 0, 0, W, H); g.globalAlpha = 1;
    for (const m of bm) { const p = 1 - m.t / (m.big ? 0.8 : 0.4), rad = (m.big ? 4 + p * 14 : 2 + p * 6); g.fillStyle = `rgba(255,${Math.round(190 - p * 120)},60,${0.9 - p * 0.9})`; g.beginPath(); g.arc(m.x, m.y, rad, 0, 7); g.fill(); }
    if (ping) { g.strokeStyle = ping.a ? '#ff6a5a' : '#7fd0ff'; g.lineWidth = 1; g.beginPath(); g.arc(ping.x, ping.y, 3 + (1 - ping.t / 0.7) * 7, 0, 7); g.stroke(); }
  };
  // 플레이어 지시: 적을 클릭하면 공격, 땅을 클릭하면 이동(도중 적을 만나면 교전)
  const command = (x: number, y: number): 'atk' | 'move' | null => {
    if (!player || b.over !== null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    x = Math.max(0, Math.min(W, x)); y = Math.max(0, Math.min(H, y));
    let tgt: T | null = null, best = 6;
    for (const e of units) if (e.team === 1) { const d = Math.hypot(e.x - x, e.y - y) - e.r; if (d < best) { best = d; tgt = e; } }
    for (const e of blds) if (e.team === 1) { const d = Math.hypot(e.x - x, e.y - y) - e.r; if (d < best) { best = d; tgt = e; } }
    if (!tgt && inBand(x, 0) && Math.abs(y - BY) > BH) x = x < (RX0 + RX1) / 2 ? RX0 - 6 : RX1 + 6;
    let n = 0;
    for (const u of units) if (u.team === 0 && u.k !== 'w') { n++; if (tgt) { u.tgt = tgt; u.dest = null; } else { u.tgt = null; u.dest = { x, y }; } }
    if (!n) return null;
    ping = { x: tgt ? tgt.x : x, y: tgt ? tgt.y : y, t: 0.7, a: !!tgt }; on?.('order');
    return tgt ? 'atk' : 'move';
  };
  const api = Object.assign(b, {
    update, draw, command, reset,
    train: (k: K) => { const ok = player && train(0, k); if (ok) on?.('train'); return ok; },
  });
  reset();
  return api;
}
export type Battle = ReturnType<typeof createBattle>;
