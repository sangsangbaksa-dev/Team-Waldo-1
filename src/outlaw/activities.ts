// OUTLAW CITY — 위험 주행의 스타일 콤보와 스턴트·택시·수송차·현상금·렘페이지 진행을 관리합니다.
import type { Sim } from './sim';
import { PLAYER_ID, VEHICLES, WEAPONS, clamp, blankPedInput, type Vehicle, type Marker, type Pickup } from './types';
import { groundHeight, isOpen, nearestLane, surfaceAt, moveCircle } from './world';
import { autoDrive } from './vehicle';

const indices = new WeakMap<Sim, number>(), buffers = new WeakMap<Sim, Sim['events']>();
const YELLOW = 0xffd23f, BLUE = 0x3b82ff, RED = 0xff4545;
interface Stunt { x: number; z: number; tx: number; tz: number; r: number; ramp: number }
const distance = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);
function marker(x: number, z: number, r: number, color: number, label: string, kind: Marker['kind'] = 'goal'): Marker { return { x, z, r, color, label, kind, blip: true }; }
function notice(sim: Sim, what: 'start' | 'stage' | 'pass' | 'fail', text: string, kind = sim.activity.active): void { sim.emit({ t: 'activity', kind, what, text }); sim.say(text, 3); }

/** 정의도 활동 상태에 보관해 저장된 완료 번호와 항상 같은 순서로 대응시킵니다. */
export function stuntJumps(sim: Sim): Stunt[] {
  const d = sim.activity.data;
  if (!d.stuntReady) {
    sim.map.ramps.slice(0, 6).forEach((r, i) => {
      for (let variant = 0; variant < 2; variant++) {
        const n = i * 2 + variant, preferred = variant ? 55 : 34; let best = Infinity, tx = NaN, tz = NaN;
        for (let dx = 30; dx <= 60; dx += 2) for (let dz = -24; dz <= 24; dz += 2) {
          const x = r.x + dx, z = r.z + dz, length = Math.hypot(dx, dz);
          if (length > 60 || !isOpen(sim.map, x, z, 4) || groundHeight(sim.map, x, z) > 0.1) continue;
          const score = Math.abs(dx - preferred) + Math.abs(dz) * 0.4 + (surfaceAt(sim.map, x, z) === 'road' ? 0 : 5);
          if (score < best) { best = score; tx = x; tz = z; }
        }
        if (!Number.isFinite(tx)) continue;
        d[`stunt${n}x`] = tx; d[`stunt${n}z`] = tz;
      }
    }); d.stuntReady = 1;
  }
  return sim.map.ramps.slice(0, 6).flatMap((r, i) => [0, 1].map(v => {
    const n = i * 2 + v; return { x: r.x, z: r.z, tx: d[`stunt${n}x`], tz: d[`stunt${n}z`], r: v ? 5 : 7, ramp: i };
  }));
}
function bonus(sim: Sim, text: string, base: number, category: string, cooldown: number): boolean {
  const a = sim.activity, d = a.data, s = a.style;
  if ((d[`pay:${category}`] ?? -Infinity) > sim.t || !sim.player.alive) return false;
  d[`pay:${category}`] = sim.t + cooldown;
  s.combo++; s.mult = Math.min(5, 1 + Math.floor((s.combo - 1) / 2)); s.timer = 5;
  // 반복 기술은 감액하고 누적 수입의 상한은 두지 않습니다.
  const fatigue = d[`fatigue:${category}`] ?? 0, since = sim.t - (d[`last:${category}`] ?? -Infinity);
  const repeat = since < 30 ? Math.min(12, fatigue + 1) : Math.max(0, fatigue - Math.floor(since / 30));
  d[`fatigue:${category}`] = repeat; d[`last:${category}`] = sim.t;
  const amount = Math.max(5, Math.round(base * s.mult / ((1 + repeat * 0.22) * (1 + (d.stylePressure || 0) / 240))));
  d.stylePressure = (d.stylePressure || 0) + amount;
  s.total += amount; s.last = text; sim.addCash(amount); sim.emit({ t: 'style', text, amount, combo: s.mult }); return true;
}
function legalRoad(sim: Sim, v: Vehicle): boolean {
  if (surfaceAt(sim.map, v.x, v.z) !== 'road' || v.vf <= 0) return false;
  const lane = sim.map.lanes[nearestLane(sim.map, v.x, v.z)];
  return !!lane && Math.cos(lane.h - Math.atan2(v.vz, v.vx)) > 0.25;
}
function styles(sim: Sim, dt: number, stunts: Stunt[]): void {
  const a = sim.activity, d = a.data, s = a.style, v = sim.vehicle(sim.player.vehicle);
  d.stylePressure = Math.max(0, (d.stylePressure || 0) - dt * 5);
  s.timer = Math.max(0, s.timer - dt); if (!s.timer || !sim.player.alive) { s.combo = 0; s.mult = 1; }
  if (!v || !sim.player.alive || v.wrecked || v.driver !== PLAYER_ID) { d.airT = d.driftT = d.driftDist = 0; d.airCar = 0; return; }
  const speed = Math.hypot(v.vx, v.vz), air = v.y > groundHeight(sim.map, v.x, v.z) + 0.12;
  if (d.styleCar !== v.id) { d.styleCar = v.id; d.airT = d.driftT = d.driftDist = 0; d.airCar = 0; }
  if (!air && v.vx > 8) for (let n = 0; n < stunts.length; n++) {
    const q = stunts[n], r = sim.map.ramps[q.ramp];
    if (Math.abs(v.z - r.z) < r.w / 2 + 1 && v.x >= r.x - r.len / 2 - 2 && v.x <= r.x + r.len / 2 + 2) { d.ramp = q.ramp; d.rampAt = sim.t; }
  }
  if (air) {
    if (!d.airT) { d.airX = v.x; d.airZ = v.z; d.airHp = v.hp; d.airCar = v.id; d.airRamp = sim.t - (d.rampAt ?? -Infinity) < 0.6 ? d.ramp : -1; }
    d.airT = (d.airT || 0) + dt;
  } else if (d.airT) {
    const t = d.airT, length = Math.hypot(v.x - d.airX, v.z - d.airZ), clean = v.hp > 0 && d.airHp - v.hp < v.maxHp * 0.3;
    a.stats.maxAirtime = Math.max(a.stats.maxAirtime, t);
    if (clean && d.airCar === v.id) {
      if (t >= 0.8 && length >= 8) bonus(sim, t >= 1.8 || length >= 55 ? 'INSANE AIR' : 'NICE JUMP', clamp(50 + t * 45 + length * 2, 50, 400), 'air', 12);
      for (let n = 0; n < stunts.length; n++) {
        const q = stunts[n]; if (a.stunts.includes(n) || q.ramp !== d.airRamp || !Number.isFinite(q.tx) || Math.hypot(v.x - q.tx, v.z - q.tz) > q.r || length < 25) continue;
        a.stunts.push(n); sim.addCash(500); notice(sim, 'pass', `UNIQUE STUNT JUMP #${n + 1} · ${a.stunts.length}/12 · +$500`, 'stunt');
        if (a.stunts.length === 12) { sim.addCash(5000); notice(sim, 'pass', 'STUNT MASTER · +$5000', 'stunt'); }
        sim.emit({ t: 'save' }); break;
      }
    }
    d.airT = 0;
  }
  const legal = !air && legalRoad(sim, v), clean = v.crashT <= 0 && (d.prevHp ?? v.hp) <= v.hp;
  if (legal && clean && v.input.handbrake && Math.abs(v.vl) > 6) {
    d.driftT = (d.driftT || 0) + dt; d.driftDist = (d.driftDist || 0) + speed * dt;
    a.stats.maxDrift = Math.max(a.stats.maxDrift, d.driftDist);
  } else {
    if ((d.driftT || 0) >= 2 && clean) bonus(sim, 'LONG DRIFT', clamp(d.driftDist * 1.1, 35, 180), 'drift', 10);
    d.driftT = d.driftDist = 0;
  }
  // 스친 순간이 아니라 안전하게 멀어진 뒤 지급해 충돌을 보상하지 않습니다.
  const def = VEHICLES[v.kind], c = Math.cos(v.h), sn = Math.sin(v.h);
  const check = (id: string, x: number, z: number, radius: number, hp: number, front = 0, side = 0): void => {
    const key = `near:${id}`, dx = x - v.x, dz = z - v.z, f = dx * c + dz * sn, l = -dx * sn + dz * c;
    const gap = Math.hypot(Math.max(0, Math.abs(f) - def.halfL - front), Math.max(0, Math.abs(l) - def.halfW - side)) - radius;
    if (gap > 0.08 && gap < 1.2 && Math.abs(f) < def.halfL + front + radius + 1 && legal && clean && speed >= 70 / 3.6 && (d[`${key}:cd`] ?? 0) <= sim.t) {
      if (!d[key]) { d[key] = sim.t + 0.7; d[`${key}:hp`] = hp; d[`${key}:car`] = v.hp; }
    }
    if (d[key] && (!clean || hp < d[`${key}:hp`] || v.hp < d[`${key}:car`] || !legal)) d[key] = 0;
    if (d[key] && f < -def.halfL - front - radius - 1) {
      if (d[key] >= sim.t && bonus(sim, 'NEAR MISS', 20, 'near', 3)) a.stats.nearMisses++;
      d[key] = 0; d[`${key}:cd`] = sim.t + 90;
    } else if (d[key] < sim.t) d[key] = 0;
  };
  for (const q of sim.peds) if (q.alive && !q.vehicle && q.id !== PLAYER_ID && Math.abs(q.y - v.y) < 2 && distance(q, v) < 16) check(`p${q.id}`, q.x, q.z, 0.42, q.hp);
  for (const q of sim.vehicles) if (q !== v && q.alive && !q.wrecked && Math.abs(q.y - v.y) < 2 && distance(q, v) < 20) {
    const qd = VEHICLES[q.kind], angle = q.h - v.h;
    const side = Math.abs(Math.sin(angle)) * qd.halfL + Math.abs(Math.cos(angle)) * qd.halfW;
    const front = Math.abs(Math.cos(angle)) * qd.halfL + Math.abs(Math.sin(angle)) * qd.halfW;
    check(`v${q.id}`, q.x, q.z, 0, q.hp, front, side);
  }
  d.prevHp = v.hp;
  if ((d.nearSweep ?? 0) < sim.t) {
    d.nearSweep = sim.t + 30;
    for (const key of Object.keys(d)) if (key.startsWith('near:') && key.endsWith(':cd') && d[key] < sim.t) { const root = key.slice(0, -3); delete d[root]; delete d[key]; delete d[`${root}:hp`]; delete d[`${root}:car`]; }
    for (const key of Object.keys(d)) if (/^near:[pv]\d+$/.test(key) && d[key] < sim.t && !d[`${key}:cd`]) { delete d[key]; delete d[`${key}:hp`]; delete d[`${key}:car`]; }
  }
}
function readEvents(sim: Sim): void {
  const a = sim.activity, d = a.data, events = sim.events, end = events.length;
  let start = indices.get(sim) ?? 0;
  if (buffers.get(sim) !== events || end < start) start = 0;
  buffers.set(sim, events);
  let explosions = 0;
  for (let i = start; i < end; i++) {
    const e = events[i];
    if (e.t === 'hit' && e.attacker === PLAYER_ID && e.kind === 'ped') {
      d[`head:${e.victim}`] = e.head ? sim.t + 0.2 : 0;
      if (a.active === 'bounty' && e.victim === a.ids.target && sim.curGun(sim.player)?.id === 'fist' && distance(sim.player, { x: e.x, z: e.z }) < 2.5) d.arrestHits = (d.arrestHits || 0) + 1;
    }
    if (e.t !== 'death' || e.by !== PLAYER_ID || e.id === PLAYER_ID) continue;
    if ((d[`dead:${e.id}`] ?? 0) > 0) continue; d[`dead:${e.id}`] = sim.t + 30;
    if ((d[`head:${e.id}`] ?? 0) >= sim.t) {
      d.headChain = sim.t - (d.headAt ?? -Infinity) <= 6 ? (d.headChain || 0) + 1 : 1; d.headAt = sim.t;
      if (d.headChain >= 2) bonus(sim, `HEADSHOT CHAIN ×${d.headChain}`, Math.min(100, 30 + d.headChain * 10), 'head', 2);
    }
    delete d[`head:${e.id}`];
    if (e.weapon === 'explosion') explosions++;
    if (a.active === 'bounty' && e.id === a.ids.target) d.bountyKilled = 1;
    if (a.active === 'rampage' && d.phase === 1 && e.weapon === 'shotgun') {
      const q = sim.ped(e.id); if (q && (q.kind === 'civ' || q.kind === 'gang')) d.kills = (d.kills || 0) + 1;
    }
  }
  if (explosions) {
    if (sim.t - (d.blastAt ?? -Infinity) <= 0.15) d.blastKills = (d.blastKills || 0) + explosions; else d.blastKills = explosions;
    d.blastAt = sim.t;
    if (d.blastKills >= 2) bonus(sim, `MULTI KILL ×${d.blastKills}`, Math.min(180, d.blastKills * 35), 'blast', 8);
  }
  if ((d.eventSweep ?? 0) < sim.t) { d.eventSweep = sim.t + 10; for (const key of Object.keys(d)) if ((key.startsWith('dead:') || key.startsWith('head:')) && d[key] < sim.t) delete d[key]; }
  indices.set(sim, end);
}
function reward(sim: Sim, amount: number): number {
  const d = sim.activity.data, kind = sim.activity.active, repeat = d.lastKind === kindCode(kind) ? (d.repeat || 0) + 1 : 0;
  d.repeat = repeat; d.lastKind = kindCode(kind); return Math.round(amount * Math.max(0.45, 1 - repeat * 0.15));
}
const kindCode = (kind: string): number => ['taxi', 'armored', 'bounty', 'rampage', 'race', 'export'].indexOf(kind) + 1;
function finish(sim: Sim, pass: boolean, text: string, cash = 0): void {
  const a = sim.activity, d = a.data;
  if (cash) { const n = reward(sim, cash); sim.addCash(n); text += ` · +$${n}`; }
  notice(sim, pass ? 'pass' : 'fail', text);
  if (a.active === 'taxi') d.taxiChain = pass ? (d.taxiChain || 0) + 1 : 0;
  for (const [key, id] of Object.entries(a.ids)) {
    if (key.startsWith('ped') || key === 'target' || key === 'customer') { const p = sim.ped(id); if (p) { p.keep = false; sim.removePed(p); } }
    if (key === 'exportCar') { const v = sim.vehicle(id); if (v) v.keep = false; }
    if (key === 'truck') { const v = sim.vehicle(id); if (v) { v.keep = false; if (sim.player.vehicle !== id) sim.removeVehicle(v); else { v.tag = ''; v.mode = 'none'; } } }
  }
  const pickupIds = new Set(Object.entries(a.ids).filter(([k]) => k.startsWith('cash') || k === 'weapon').map(([, id]) => id));
  sim.pickups = sim.pickups.filter(p => !pickupIds.has(p.id));
  a.ids = {}; a.active = ''; a.text = ''; a.timer = 0; a.markers = [];
  d.nextEvent = sim.t + 100 + sim.rng() * 70; d.taxiNext = sim.t + (pass ? 12 : 30); d.taxiWait = 0;
  for (const key of ['phase', 'arrestHits', 'bountyKilled', 'kills', 'stopped', 'hintAt', 'fareSpeed', 'looted']) delete d[key];
}
function begin(sim: Sim, kind: string, seconds: number): void { const a = sim.activity; a.active = kind; a.timer = seconds; a.data.phase = 0; a.ids = {}; notice(sim, 'start', { taxi: '택시 호출 · 손님 옆에 정차하세요', armored: 'BLUE MONEY · 현금수송차 발견', bounty: 'WANTED · 도주범을 추적하세요', rampage: 'RAMPAGE · R 무기를 주우면 도전 시작', race: 'STREET RACE · 체크포인트를 통과하세요', export: 'CAR EXPORT · 표시된 차를 훔쳐 정비소로' }[kind] ?? kind); }
function roadPoint(sim: Sim, min: number, max: number): { x: number; z: number; h: number; id: number } | undefined {
  const candidates = sim.map.lanes.filter(p => { const d = distance(p, sim.player); return d >= min && d <= max && p.light === -1 && isOpen(sim.map, p.x, p.z, 3); });
  return candidates[Math.floor(sim.rng() * candidates.length)];
}
function startTaxi(sim: Sim, v: Vehicle): boolean {
  const pts = sim.map.walkPoints.filter(q => distance(q, v) > 6 && distance(q, v) < 22 && sim.canSee(v.x, v.z, q.x, q.z));
  const q = pts[Math.floor(sim.rng() * pts.length)], goal = roadPoint(sim, 180, 420); if (!q || !goal) return false;
  begin(sim, 'taxi', 40); const a = sim.activity, p = sim.spawnPed('civ', q.x, q.z, { keep: true, tag: 'activity:taxi', mode: 'scripted', loot: 0 });
  a.ids.customer = p.id; a.ids.taxi = v.id; a.data.goalX = goal.x; a.data.goalZ = goal.z; a.data.taxiHp = v.hp; a.data.fareDistance = distance(v, goal); a.markers = [marker(q.x, q.z, 2, YELLOW, '손님')]; return true;
}
function startRace(sim: Sim): boolean {
  const v = sim.vehicle(sim.player.vehicle); if (!v || v.driver !== PLAYER_ID || v.wrecked || v.hp <= 0) return false;
  const lanes = sim.map.lanes.filter(p => p.light === -1 && surfaceAt(sim.map, p.x, p.z) === 'road' && isOpen(sim.map, p.x, p.z, 3));
  const angle = sim.rng() * Math.PI * 2;
  for (let attempt = 0; attempt < 16; attempt++) {
    const radius = 110 + sim.rng() * 45, turn = angle + attempt * 0.39, points: typeof lanes = [];
    for (let i = 0; i < 6; i++) {
      const theta = turn + i * Math.PI / 3, x = v.x + radius * (Math.cos(theta) - Math.cos(turn)), z = v.z + radius * (Math.sin(theta) - Math.sin(turn));
      const candidates = lanes.filter(p => (!points.length ? distance(p, v) < 45 : distance(p, points[points.length - 1]) >= 90 && distance(p, points[points.length - 1]) <= 200) && (i !== 5 || (distance(p, points[0]) >= 90 && distance(p, points[0]) <= 200)));
      candidates.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
      if (!candidates.length) break; points.push(candidates[0]);
    }
    if (points.length !== 6) continue;
    begin(sim, 'race', 75); const a = sim.activity; a.data.raceOut = 0; a.data.raceIndex = 0;
    points.forEach((p, i) => { a.data[`raceX${i}`] = p.x; a.data[`raceZ${i}`] = p.z; });
    a.markers = points.map((p, i) => marker(p.x, p.z, 9, YELLOW, `체크포인트 ${i + 1}`)); return true;
  }
  return false;
}
function startExport(sim: Sim): boolean {
  const dock = sim.map.pois.find(p => p.kind === 'chopshop');
  const cars = sim.vehicles.filter(v => (v.kind === 'sports' || v.kind === 'suv') && v.alive && !v.wrecked && v.hp > 0 && !v.locked && !v.keep && !v.driver && (v.mode === 'parked' || v.mode === 'none') && distance(v, sim.player) < 180 && v.id !== sim.player.vehicle);
  if (!dock || !cars.length) return false;
  cars.sort((a, b) => distance(a, sim.player) - distance(b, sim.player)); const v = cars[0];
  begin(sim, 'export', 120); v.keep = true; sim.activity.ids.exportCar = v.id;
  sim.activity.data.exportX = dock.x; sim.activity.data.exportZ = dock.z; sim.activity.data.exportR = Math.max(8, dock.r);
  sim.activity.markers = [marker(v.x, v.z, 3, BLUE, '수출 차량', 'target')]; return true;
}
function startEvent(sim: Sim): void {
  const a = sim.activity, d = a.data, seq = d.eventSeq || 0, kind = ['armored', 'bounty', 'rampage', 'race', 'export'][seq % 5];
  if (kind === 'race' || kind === 'export') {
    if (kind === 'race' ? startRace(sim) : startExport(sim)) d.eventSeq = seq + 1; else d.nextEvent = sim.t + 15;
    return;
  }
  const q = roadPoint(sim, 55, 140);
  if (!q) { d.nextEvent = sim.t + 15; return; } d.eventSeq = seq + 1;
  begin(sim, kind, kind === 'bounty' ? 100 : 150);
  if (kind === 'armored') {
    const v = sim.spawnVehicle('truck', q.x, q.z, q.h, { color: 0x202b38, keep: true, locked: true, mode: 'scripted', tag: 'activity:armored', lane: q.id, vx: Math.cos(q.h) * 12, vz: Math.sin(q.h) * 12, vf: 12 }); a.ids.truck = v.id;
    for (let i = 0; i < 2; i++) { const p = sim.spawnPed('gang', q.x, q.z, { keep: true, tag: 'activity:guard', mode: 'scripted', loot: 0 }); p.vehicle = v.id; p.seat = i; if (!i) v.driver = p.id; else v.passengers.push(p.id); a.ids[`ped${i}`] = p.id; }
    a.markers = [marker(q.x, q.z, 3, BLUE, '현금수송차', 'target')];
  } else if (kind === 'bounty') {
    const p = sim.spawnPed('gang', q.x, q.z, { keep: true, tag: 'activity:bounty', mode: 'scripted', loot: 0 }); a.ids.target = p.id; d.fleeLane = q.id; a.markers = [marker(q.x, q.z, 1.5, RED, 'WANTED', 'target')];
  } else {
    // 매번 임의 위치로 옮기지 않아 도시를 익히면 R 도전 장소를 기억할 수 있습니다.
    const anchors = sim.map.pois.filter(p => p.kind === 'dock' || p.kind === 'gunshop' || p.kind === 'club');
    const fixed = anchors.map(anchor => sim.map.walkPoints.filter(p => distance(p, anchor) < 24 && isOpen(sim.map, p.x, p.z, 1)).sort((a, b) => distance(a, anchor) - distance(b, anchor))[0]).filter(p => !!p);
    const pt = fixed.sort((a, b) => distance(a, sim.player) - distance(b, sim.player))[0];
    if (!pt) { finish(sim, false, '도전 지점을 찾지 못했습니다'); return; }
    const pk = sim.spawnPickup('weapon', pt.x, pt.z, { weapon: 'shotgun', amount: 1 }); a.ids.weapon = pk.id; a.markers = [marker(pt.x, pt.z, 2, RED, 'R', 'item')];
  }
}
function taxi(sim: Sim, dt: number): void {
  const a = sim.activity, d = a.data, v = sim.vehicle(a.ids.taxi), p = sim.ped(a.ids.customer);
  if (!v || v.wrecked || v.hp <= 0 || sim.player.vehicle !== v.id || (!p?.alive && d.phase === 0)) { finish(sim, false, '택시 실패 · 운행이 중단됐습니다'); return; }
  const speed = Math.hypot(v.vx, v.vz);
  if (!d.phase && p) {
    p.input = blankPedInput(); p.input.yaw = Math.atan2(v.z - p.z, v.x - p.x);
    if (speed < 1.5 && distance(p, v) < 18) p.input.mz = 0.65;
    a.text = '손님 옆에 정차 · 천천히 접근하세요'; a.markers = [marker(p.x, p.z, 2, YELLOW, '손님')];
    if (speed < 1.5 && distance(p, v) < 4.5) {
      // 좌석/렌더러 결합 없이 탑승자는 데이터로만 유지합니다.
      p.keep = false; sim.removePed(p); delete a.ids.customer; d.phase = 1; d.taxiHp = v.hp; a.timer = 35 + d.fareDistance / 7; d.fareLimit = a.timer;
      a.markers = [marker(d.goalX, d.goalZ, 6, YELLOW, '택시 목적지')]; notice(sim, 'stage', '손님 탑승 · 빠르고 안전하게!');
    }
  } else {
    d.fareSpeed = (d.fareSpeed || 0) + Math.min(speed, 25) * dt;
    a.text = `목적지에 정차 · 연속 운행 ×${Math.min(3, 1 + (d.taxiChain || 0) * 0.15).toFixed(2)}`;
    if (Math.hypot(v.x - d.goalX, v.z - d.goalZ) < 6 && speed < 2) {
      const safety = clamp(1 - Math.max(0, d.taxiHp - v.hp) / 65, 0, 1), time = clamp(a.timer / d.fareLimit, 0, 1);
      const tip = Math.round((60 * time + 20 * Math.min(1, (d.fareSpeed || 0) / d.fareDistance)) * safety);
      a.stats.taxiFares++; finish(sim, true, `운행 완료 · 안전 팁 $${tip}`, Math.round((110 + d.fareDistance * 0.35 + tip) * Math.min(1.6, 1 + (d.taxiChain || 0) * 0.1)));
    }
  }
}
function armored(sim: Sim, dt: number): void {
  const a = sim.activity, d = a.data, v = sim.vehicle(a.ids.truck); if (!v) { finish(sim, false, '현금수송차를 놓쳤습니다'); return; }
  if (distance(sim.player, v) > 300) { finish(sim, false, '현금수송차가 도주했습니다'); return; }
  if (!d.phase) {
    let lane = sim.map.lanes[v.lane]; if (lane && distance(v, lane) < 6 && lane.next.length) { v.lane = lane.next[Math.floor(sim.rng() * lane.next.length)]; lane = sim.map.lanes[v.lane]; }
    if (lane && v.driver !== PLAYER_ID && !v.wrecked) autoDrive(sim, v, lane.x, lane.z, 15, dt);
    d.stopped = Math.hypot(v.vx, v.vz) < 1 && distance(sim.player, v) < 30 && (v.hp < v.maxHp - 10 || v.crashT > 0 || !sim.ped(v.driver)?.alive) ? (d.stopped || 0) + dt : 0;
    a.markers = [marker(v.x, v.z, 3, BLUE, '현금수송차', 'target')]; a.text = '수송차를 공격해 멈추세요 · 경호원 2명';
    if (v.wrecked || v.hp <= 0 || d.stopped > 2) {
      d.phase = 1; a.timer = 65; v.input.throttle = 0; v.input.brake = 1; v.mode = 'scripted';
      for (let i = 0; i < 2; i++) { const p = sim.ped(a.ids[`ped${i}`]); if (!p?.alive) continue; if (p.vehicle) sim.exitVehicle(p); p.mode = 'attack'; p.target = PLAYER_ID; }
      const payout = reward(sim, 1000) / 1000;
      for (let i = 0; i < 3; i++) {
        const x = v.x - Math.cos(v.h) * (7 + i * 1.5), z = v.z - Math.sin(v.h) * (7 + i * 1.5), pos = moveCircle(sim.map, x, z, 0.5, 0, 2);
        const pk = sim.spawnPickup('cash', pos.x, pos.z, { amount: Math.round((300 + Math.floor(sim.rng() * 501)) * payout) }); a.ids[`cash${i}`] = pk.id;
      }
      notice(sim, 'stage', '문이 열렸다 · 내려서 현금을 챙기세요!');
    }
  } else {
    const cash = Object.entries(a.ids).filter(([k]) => k.startsWith('cash')).map(([, id]) => sim.pickups.find(p => p.id === id));
    if (cash.some(p => p?.taken) && !d.looted) { d.looted = 1; sim.addCrime('bank', v.x, v.z, PLAYER_ID, v.id, 4); }
    a.text = '현금 회수 · 경호원의 사격을 피하세요'; a.markers = cash.filter((p): p is Pickup => !!p && !p.taken).map(p => marker(p.x, p.z, 1, BLUE, '현금', 'item'));
    if (cash.every(p => !p || p.taken)) { a.stats.armoredTrucks++; d.looted = 0; finish(sim, true, '현금수송차 약탈 성공'); }
  }
}
function bounty(sim: Sim): void {
  const a = sim.activity, d = a.data, p = sim.ped(a.ids.target);
  if (d.bountyKilled || (d.arrestHits || 0) >= 2) { a.stats.bounties++; finish(sim, true, d.bountyKilled ? '현상금 확보' : '도주범 체포', d.bountyKilled ? 650 : 850); return; }
  if (!p?.alive) { finish(sim, false, '현상금 실패 · 다른 세력이 목표를 제거했습니다'); return; }
  let lane = sim.map.lanes[d.fleeLane]; if (lane && distance(p, lane) < 4 && lane.next.length) { d.fleeLane = lane.next[Math.floor(sim.rng() * lane.next.length)]; lane = sim.map.lanes[d.fleeLane]; }
  p.input = blankPedInput(); if (lane) { p.input.yaw = Math.atan2(lane.z - p.z, lane.x - p.x); p.input.mz = 1; p.input.sprint = true; }
  a.text = 'WANTED · 처치 $650 / 가까이서 주먹 두 번 체포 $850';
  if ((d.hintAt || 0) <= sim.t) { d.hintAt = sim.t + 2; a.markers = [marker(p.x, p.z, 1.5, RED, 'WANTED', 'target')]; }
}
function rampage(sim: Sim): void {
  const a = sim.activity, d = a.data, pk = sim.pickups.find(p => p.id === a.ids.weapon);
  if (!d.phase) {
    a.text = 'R · 샷건을 주우면 60초 도전';
    if (pk?.taken) { d.phase = 1; d.kills = 0; a.timer = 60; sim.giveWeapon(sim.player, 'shotgun'); const gun = sim.player.guns.find(g => g?.id === 'shotgun'); if (gun) gun.reserve = WEAPONS.shotgun.reserve; a.markers = []; notice(sim, 'stage', 'RAMPAGE · 샷건으로 60초 안에 12명'); }
  } else {
    a.text = `RAMPAGE · 샷건 처치 ${d.kills || 0}/12`;
    if ((d.kills || 0) >= 12) { a.stats.rampages++; sim.giveWeapon(sim.player, 'shotgun'); finish(sim, true, 'RAMPAGE PASSED · 샷건 탄약 보충', 1200); }
  }
}
function race(sim: Sim, dt: number): void {
  const a = sim.activity, d = a.data, v = sim.vehicle(sim.player.vehicle), driving = !!v && v.driver === PLAYER_ID && !v.wrecked && v.hp > 0;
  d.raceOut = driving ? 0 : (d.raceOut || 0) + dt;
  if (d.raceOut > 10) { finish(sim, false, '차를 너무 오래 떠나 레이스가 취소되었습니다'); return; }
  const i = d.raceIndex || 0; a.text = `STREET RACE · 체크포인트 ${i}/6${driving ? '' : ' · 차량으로 돌아가세요'}`;
  if (driving && Math.hypot(v.x - d[`raceX${i}`], v.z - d[`raceZ${i}`]) < 9) {
    d.raceIndex = i + 1; a.timer += 8; a.markers.shift();
    if (d.raceIndex === 6) { a.stats.races = (a.stats.races ?? 0) + 1; finish(sim, true, 'STREET RACE 우승', 1000); }
    else notice(sim, 'stage', `체크포인트 ${d.raceIndex}/6 · +8초`);
  }
}
function exportCar(sim: Sim): void {
  const a = sim.activity, d = a.data, v = sim.vehicle(a.ids.exportCar);
  if (!v || !v.alive || v.wrecked || v.hp <= 0) { finish(sim, false, '수출 차량이 파손되어 의뢰가 실패했습니다'); return; }
  if (!d.phase && sim.player.vehicle === v.id && v.driver === PLAYER_ID) {
    d.phase = 1; sim.wanted.heat = Math.max(sim.wanted.heat, 4); sim.wanted.lastX = v.x; sim.wanted.lastZ = v.z; sim.wanted.unseenT = 0; sim.wanted.evadeT = 0;
    if (sim.wanted.stars < 2) sim.setStars(2);
    notice(sim, 'stage', '수출 차량 탈취! 경찰이 추격합니다');
  }
  if (!d.phase) { a.text = '수출 차량에 탑승하세요'; a.markers = [marker(v.x, v.z, 3, BLUE, '수출 차량', 'target')]; }
  else {
    a.text = '장물 정비소로 차량을 인도하세요 · 경찰을 따돌리세요'; a.markers = [marker(d.exportX, d.exportZ, d.exportR, BLUE, '정비소')];
    if (sim.player.vehicle === v.id && v.driver === PLAYER_ID && Math.hypot(v.x - d.exportX, v.z - d.exportZ) < d.exportR) finish(sim, true, 'CAR EXPORT 완료', 1800);
  }
}
export function stepActivities(sim: Sim, dt: number): void {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  const a = sim.activity, d = a.data, jumps = stuntJumps(sim);
  styles(sim, dt, jumps); readEvents(sim);
  if (a.active) {
    a.timer = Math.max(0, a.timer - dt);
    if (!sim.player.alive || sim.downKind || sim.mission.active) { finish(sim, false, sim.mission.active ? '활동 중단 · 미션 시작' : '활동 실패 · 운행 불가'); return; }
    if (a.timer <= 0) { finish(sim, false, '활동 실패 · 제한 시간 초과'); return; }
    if (a.active === 'taxi') taxi(sim, dt); else if (a.active === 'armored') armored(sim, dt); else if (a.active === 'bounty') bounty(sim); else if (a.active === 'rampage') rampage(sim); else if (a.active === 'race') race(sim, dt); else if (a.active === 'export') exportCar(sim);
    return;
  }
  a.markers = []; a.text = ''; a.timer = 0;
  jumps.forEach((q, i) => { if (!a.stunts.includes(i) && Number.isFinite(q.tx) && distance(sim.player, q) < 110) a.markers.push(marker(q.x - 4, q.z, 2, YELLOW, `STUNT ${i + 1}`, 'item')); });
  const v = sim.vehicle(sim.player.vehicle);
  if (sim.mission.active || sim.wanted.stars > 0 || sim.wanted.heat > 0 || !sim.player.alive || sim.downKind) { d.taxiWait = 0; return; }
  if (v?.kind === 'taxi' && !v.wrecked && (d.taxiNext || 0) <= sim.t) {
    if (d.taxiCar !== v.id) { d.taxiCar = v.id; d.taxiWait = 0; }
    d.taxiWait = (d.taxiWait || 0) + dt;
    if (d.taxiWait >= 3) a.text = '손님을 받으려면 길가에 잠시 정차하세요';
    if (d.taxiWait >= 5 && Math.hypot(v.vx, v.vz) < 1 && startTaxi(sim, v)) return;
  } else d.taxiWait = 0;
  if (d.nextEvent === undefined) d.nextEvent = sim.t + 70;
  if (sim.t >= d.nextEvent) startEvent(sim);
}
