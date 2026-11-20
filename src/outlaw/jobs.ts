// OUTLAW CITY — 휴대폰으로 받는 일거리: 배달·응급 이송·자경단·현상 의뢰·차량 회수·지하 격투장, 그리고 소매치기. 화면과 무관한 시뮬레이션 로직입니다.
import type { Sim } from './sim';
import { PLAYER_ID, blankJobState, VEHICLES, wrapAngle, type Marker, type Ped, type Vehicle } from './types';
import { nearestLane } from './world';
import { autoDrive } from './vehicle';

export interface JobInfo { id: string; name: string; giver: string; desc: string; pay: string; cooldown: number }
export const JOB_LIST: JobInfo[] = [
  { id: 'courier', name: '음식 배달', giver: '배달 앱', desc: '세 곳에 제한 시간 안에 주문을 전달합니다. 빠를수록 팁이 늘어납니다.', pay: '$120×3 + 팁', cooldown: 20 },
  { id: 'paramedic', name: '응급 이송', giver: '구급 센터', desc: '구급차를 몰고 환자를 태워 시립 병원까지 안전하게 이송합니다.', pay: '$450~900', cooldown: 30 },
  { id: 'vigilante', name: '자경단', giver: '동네 주민', desc: '동네를 어지럽히는 갱 네 명을 제압합니다. 시민을 해치면 실패합니다.', pay: '$700', cooldown: 45 },
  { id: 'contract', name: '현상 의뢰', giver: '브로커', desc: '경호원을 거느린 우두머리를 쓰러뜨립니다. 무장이 단단합니다.', pay: '$2,500', cooldown: 90 },
  { id: 'repo', name: '차량 회수', giver: '정비공 준', desc: '표시된 차량을 가져와 해체장에 넘깁니다. 훔치는 순간 경찰이 붙습니다.', pay: '$1,100', cooldown: 60 },
  { id: 'trial', name: '타임 트라이얼', giver: '레이서 나래', desc: '아무 차나 타고 표시된 관문 다섯 곳을 제한 시간 안에 통과합니다. 남은 시간이 보너스가 됩니다.', pay: '$900 + 시간 보너스', cooldown: 20 },
  { id: 'getaway', name: '도주 운전', giver: '익명의 의뢰인', desc: '은행 앞에서 일행을 태우는 순간 경찰이 붙습니다. 추격을 따돌리고 은신처까지 달리세요.', pay: '$2,200', cooldown: 90 },
  { id: 'smuggle', name: '밀수', giver: '항만 브로커', desc: '해체장의 밴을 훔쳐 먼 곳의 인수 지점에 넘깁니다. 상자를 실은 순간 경찰이 눈치챕니다.', pay: '$1,800', cooldown: 60 },
  { id: 'cargo', name: '민감 화물', giver: '야간 운송사', desc: '깨지기 쉬운 화물을 밴에 실어 먼 하역장까지 옮깁니다. 충돌하면 화물이 상하고, 비 오는 밤엔 웃돈이 붙습니다.', pay: '$1,300 + 상태·우천 야간 보너스', cooldown: 45 },
  { id: 'demolish', name: '차량 파괴', giver: '보험 사기꾼', desc: '표시된 주차 차량 세 대를 부숴 흔적 없이 처리합니다. 소란이 커지면 경찰이 옵니다.', pay: '$1,500', cooldown: 60 },
  { id: 'tail', name: '미행', giver: '사설 탐정', desc: '표적 세단을 들키지 않게 따라갑니다. 너무 가까우면 들키고 너무 멀면 놓칩니다.', pay: '$1,600', cooldown: 60 },
  { id: 'fight', name: '지하 격투', giver: '격투장 주인', desc: '격투장 앞에서 3연전. 총은 쓰지 않습니다. 이길수록 상금이 커집니다.', pay: '$400 · $800 · $1,600', cooldown: 0 },
];
export const jobInfo = (id: string): JobInfo | undefined => JOB_LIST.find(j => j.id === id);
const COLOR = { goal: 0xffd23f, item: 0x4de1ff, target: 0xff4545 };
const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);
const mark = (x: number, z: number, r: number, label: string, kind: Marker['kind'] = 'goal'): Marker => ({ x, z, r, label, kind, blip: true, color: COLOR[kind === 'shop' ? 'goal' : kind] });
const clock = (t: number): string => { const n = Math.ceil(Math.max(0, t)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const poi = (s: Sim, id: string) => s.map.pois.find(p => p.id === id) ?? s.map.pois[0]!;
const cooldowns = new WeakMap<Sim, Record<string, number>>();

/** 플레이어에게서 min~max 미터 떨어진 인도 지점(없으면 가장 가까운 후보) */
export function spotNear(sim: Sim, min: number, max: number, from: { x: number; z: number } = sim.player): { x: number; z: number } {
  const pts = sim.map.walkPoints, n = pts.length; let best = pts[0]!, bs = Infinity;
  for (let i = 0; i < 60; i++) { const q = pts[Math.floor(sim.rng() * n)]!, d = dist(q, from), score = d < min ? min - d : d > max ? d - max : 0; if (score < bs) { bs = score; best = q; if (!score) break; } }
  return best;
}
function notice(s: Sim, what: 'start' | 'stage' | 'pass' | 'fail', text: string, kind = s.job.active || 'job'): void { s.emit({ t: 'activity', kind, what, text }); s.say(text, 3); }
// 실제 차량 체력 손실만 계산한다. 충돌 연출 타이머를 프레임마다 피해로 계산하지 않는다.
function impactLoss(j: Sim['job'], car: Vehicle): number {
  const previous = j.data.carHp ?? car.hp;
  j.data.carHp = car.hp;
  return Math.max(0, previous - car.hp) / Math.max(1, car.maxHp) * 150;
}
function gang(s: Sim, x: number, z: number, boss = false): Ped { return s.spawnPed(boss ? 'boss' : 'gang', x, z, { keep: true, tag: 'job', mode: 'guard', tx: x, tz: z, aux: 6 }); }

export function jobBlock(sim: Sim, id: string): string {
  const p = sim.player;
  if (!p.alive || sim.downKind) return '지금은 일할 수 없습니다'; if (sim.job.active) return '이미 다른 일을 하고 있습니다';
  if (sim.mission.active || sim.activity.active) return '진행 중인 의뢰·활동을 먼저 끝내세요'; if (sim.wanted.stars > 0) return '수배 중에는 일을 받을 수 없습니다';
  const cd = cooldowns.get(sim)?.[id] ?? 0; if (cd > sim.t) return `${Math.ceil(cd - sim.t)}초 뒤에 다시 받을 수 있습니다`;
  if (id === 'fight' && sim.nearPoi(p.x, p.z)?.kind !== 'arena') return '격투장 입구에서만 시작할 수 있습니다';
  return '';
}

/** 일을 시작합니다. 실패 사유가 있으면 문자열을, 성공이면 '' 를 돌려줍니다. */
export function startJob(sim: Sim, id: string): string {
  const info = jobInfo(id); if (!info) return '알 수 없는 일입니다'; const block = jobBlock(sim, id); if (block) return block;
  const j = sim.job = blankJobState(), p = sim.player; j.active = id; j.title = info.name;
  if (id === 'courier') {
    const a = spotNear(sim, 120, 260), b = spotNear(sim, 160, 320, a), c = spotNear(sim, 160, 320, b);
    [a, b, c].forEach((q, i) => { j.data[`x${i}`] = q.x; j.data[`z${i}`] = q.z; }); j.data.total = 3; j.timer = 260; j.data.bonus = 0;
  } else if (id === 'paramedic') {
    const lane = sim.map.lanes[nearestLane(sim.map, p.x + Math.cos(p.yaw) * 10, p.z + Math.sin(p.yaw) * 10)];
    const v = sim.spawnVehicle('ambulance', lane?.x ?? p.x + 6, lane?.z ?? p.z, lane?.h ?? p.yaw, { keep: true, tag: 'job', color: 0xf4f6f8, locked: false }); v.mode = 'parked'; v.input.brake = 1; j.ids.car = v.id;
    const q = spotNear(sim, 160, 320), pt = sim.spawnPed('civ', q.x, q.z, { keep: true, tag: 'job', mode: 'cower', loot: 0, hp: 40 }); pt.maxHp = 100; j.ids.patient = pt.id; j.data.x = q.x; j.data.z = q.z; j.timer = 200; j.data.hp = 100;
  } else if (id === 'vigilante' || id === 'contract') {
    const c = spotNear(sim, 150, 300), n = id === 'contract' ? 4 : 4; j.data.count = n;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, g = gang(sim, c.x + Math.cos(a) * 5, c.z + Math.sin(a) * 5, id === 'contract' && i === 0); j.ids[`e${i}`] = g.id; }
    j.data.x = c.x; j.data.z = c.z; j.data.civ0 = sim.civKills; j.timer = id === 'contract' ? 260 : 220;
  } else if (id === 'repo') {
    const q = spotNear(sim, 200, 380), lane = sim.map.lanes[nearestLane(sim.map, q.x, q.z)];
    const v = sim.spawnVehicle(sim.rng() < 0.5 ? 'suv' : 'sedan', lane?.x ?? q.x, lane?.z ?? q.z, lane?.h ?? 0, { keep: true, tag: 'job', locked: false, color: 0x8a3fa0 }); v.mode = 'parked'; v.input.brake = 1; j.ids.car = v.id; j.timer = 280;
  } else if (id === 'trial') {
    const pts: Array<{ x: number; z: number }> = []; let from: { x: number; z: number } = p;
    for (let i = 0; i < 5; i++) { let best = sim.map.lanes[0]!, bs = Infinity; for (let k = 0; k < 80; k++) { const l = sim.map.lanes[Math.floor(sim.rng() * sim.map.lanes.length)]!, d = dist(l, from), sc = Math.abs(d - 190); if (sc < bs) { bs = sc; best = l; } } pts.push(best); from = best; }
    pts.forEach((q, i) => { j.data[`x${i}`] = q.x; j.data[`z${i}`] = q.z; }); j.timer = 55 + 5 * 38; j.data.total = 5;
  } else if (id === 'getaway') {
    const b = poi(sim, 'bank0'); j.data.x = b.x; j.data.z = b.z; j.timer = 300; j.data.wait = 0;
    const homes = sim.map.pois.filter(q => q.kind === 'safehouse').sort((a, b2) => dist(b2, b) - dist(a, b));
    const h = homes[0] ?? b; j.data.escapeX = h.x; j.data.escapeZ = h.z;
  } else if (id === 'smuggle') {
    const c = poi(sim, 'chop0'), lane = sim.map.lanes[nearestLane(sim.map, c.x, c.z)];
    const v = sim.spawnVehicle('van', lane?.x ?? c.x, lane?.z ?? c.z, lane?.h ?? 0, { keep: true, tag: 'job', locked: false, color: 0x44505c }); v.mode = 'parked'; v.input.brake = 1; j.ids.car = v.id;
    const t = spotNear(sim, 320, 520, c); j.data.x = t.x; j.data.z = t.z; j.timer = 330;
  } else if (id === 'cargo') {
    const c = poi(sim, 'garage0'), lane = sim.map.lanes[nearestLane(sim.map, c.x, c.z)];
    const v = sim.spawnVehicle('van', lane?.x ?? c.x, lane?.z ?? c.z, lane?.h ?? 0, { keep: true, tag: 'job', locked: false, color: 0xe8e8ea }); v.mode = 'parked'; v.input.brake = 1; j.ids.car = v.id;
    const t = spotNear(sim, 380, 620, c); j.data.x = t.x; j.data.z = t.z; j.data.hp = 100; j.data.rain = 0; j.timer = 330;
  } else if (id === 'demolish') {
    const pts: Array<{ x: number; z: number }> = []; let from: { x: number; z: number } = p;
    for (let i = 0; i < 3; i++) { const q = spotNear(sim, 110, 260, from), lane = sim.map.lanes[nearestLane(sim.map, q.x, q.z)]; pts.push(q); from = q; const v = sim.spawnVehicle(sim.rng() < 0.5 ? 'sedan' : 'suv', lane?.x ?? q.x, lane?.z ?? q.z, lane?.h ?? 0, { keep: true, tag: 'job', locked: true, color: 0x2f7d6a }); v.mode = 'parked'; v.input.brake = 1; j.ids[`c${i}`] = v.id; }
    j.data.total = 3; j.timer = 240;
  } else if (id === 'tail') {
    const q = spotNear(sim, 70, 130), lane = sim.map.lanes[nearestLane(sim.map, q.x, q.z)];
    const v = sim.spawnVehicle('sedan', lane?.x ?? q.x, lane?.z ?? q.z, lane?.h ?? 0, { keep: true, tag: 'job', locked: false, color: 0x30343b }); v.mode = 'scripted';
    const d = sim.spawnPed('civ', v.x, v.z, { keep: true, tag: 'job', mode: 'scripted', vehicle: v.id, loot: 0 }); v.driver = d.id; j.ids.car = v.id; j.ids.driver = d.id; j.data.node = lane?.id ?? -1; j.data.prog = 0; j.data.seen = 0; j.data.far = 0; j.timer = 260;
  } else if (id === 'fight') {
    const arena = sim.nearPoi(p.x, p.z) ?? poi(sim, 'arena0'); const fee = sim.price(200); if (sim.cash < fee) { sim.job = blankJobState(); return '참가비가 부족합니다'; }
    sim.addCash(-fee); j.data.x = arena.x; j.data.z = arena.z; j.data.round = 0; j.stage = 0; p.cur = 0; p.hp = Math.max(p.hp, p.maxHp * 0.7); j.data.civ0 = sim.civKills;
  }
  notice(sim, 'start', `${info.name} 시작`); stepJobs(sim, 0); return '';
}

function end(sim: Sim, pass: boolean, text: string, cash = 0): void {
  const j = sim.job, id = j.active; if (!id) return;
  for (const q of sim.peds.slice()) if (q.tag === 'job' && q.id !== PLAYER_ID) { q.keep = false; q.tag = ''; if (dist(q, sim.player) > 150 || id === 'paramedic' || id === 'fight') sim.removePed(q); }
  for (const v of sim.vehicles.slice()) if (v.tag === 'job') { v.keep = false; v.tag = ''; if (v.driver !== PLAYER_ID) { if (dist(v, sim.player) > 150 || id === 'repo') sim.removeVehicle(v); else { v.mode = 'parked'; v.input.brake = 1; } } }
  let msg = text; if (cash > 0) { const n = sim.earn(cash); msg += ` · +$${n.toLocaleString('en-US')}`; }
  if (pass && id !== 'fight') sim.count(id === 'contract' ? 'contracts' : id);
  sim.job = blankJobState(); notice(sim, pass ? 'pass' : 'fail', msg, id);
  const cd = cooldowns.get(sim) ?? {}; cd[id] = sim.t + (jobInfo(id)?.cooldown ?? 0); cooldowns.set(sim, cd);
  if (pass) sim.emit({ t: 'save' });
}
export function cancelJob(sim: Sim, reason = '일을 포기했습니다'): void { if (sim.job.active) end(sim, false, reason); }

export function stepJobs(sim: Sim, dt: number): void {
  const j = sim.job, p = sim.player; if (!j.active || !Number.isFinite(dt) || dt < 0) return;
  if (!p.alive || sim.downKind) { end(sim, false, '일 실패 · 쓰러졌습니다'); return; }
  if (sim.mission.active) { end(sim, false, '일 중단 · 의뢰 시작'); return; }
  if (j.timer > 0 || j.data.timed) { j.timer = Math.max(0, j.timer - dt); if (!j.timer && j.active !== 'fight') { end(sim, false, '일 실패 · 시간 초과'); return; } }
  const id = j.active, wantedUp = sim.wanted.stars;
  if (id === 'courier') {
    const i = j.stage, x = j.data[`x${i}`]!, z = j.data[`z${i}`]!; j.markers = [mark(x, z, 5, `배달 ${i + 1}/3`)];
    j.text = `주문 ${i + 1}/3 배달 · 남은 시간 ${clock(j.timer)}`;
    if (Math.hypot(p.x - x, p.z - z) < 5.5) { const tip = Math.floor(j.timer / 12); sim.earn(120 + tip); j.stage++; sim.say(`배달 완료 · 팁 $${tip}`, 2); if (j.stage >= 3) end(sim, true, '배달 완료'); }
  } else if (id === 'paramedic') {
    const car = sim.vehicle(j.ids.car), pt = sim.ped(j.ids.patient);
    if (!car || car.wrecked || !car.alive) { end(sim, false, '구급차가 파괴되었습니다'); return; }
    if (!j.stage) {
      if (!pt || !pt.alive) { end(sim, false, '환자를 잃었습니다'); return; }
      j.markers = [mark(pt.x, pt.z, 6, '환자', 'item')]; j.text = p.vehicle === car.id ? `환자 옆에 구급차를 세우세요 · ${clock(j.timer)}` : `구급차에 타서 환자에게 가세요 · ${clock(j.timer)}`;
      if (p.vehicle === car.id && dist(car, pt) < 9 && Math.abs(car.vf) < 3) { sim.removePed(pt); pt.keep = false; j.stage = 1; j.data.hp = 100; j.data.carHp = car.hp; j.timer = Math.max(j.timer, 120); sim.say('환자 탑승 · 시립 병원으로!', 3); }
    } else {
      const h = poi(sim, 'hosp0'); j.markers = [mark(h.x, h.z, 9, '시립 병원')]; j.text = `환자 체력 ${Math.max(0, Math.floor(j.data.hp))} · 병원까지 ${Math.floor(dist(car, h))}m · ${clock(j.timer)}`;
      j.data.hp -= dt * 0.65 + impactLoss(j, car); if (p.vehicle !== car.id) j.text = '구급차에 다시 타세요 · 환자가 기다립니다';
      if (j.data.hp <= 0) { end(sim, false, '환자가 위독합니다 · 이송 실패'); return; }
      if (p.vehicle === car.id && dist(car, h) < 11 && Math.abs(car.vf) < 3) end(sim, true, '이송 성공', 450 + Math.round(j.data.hp * 4.5));
    }
  } else if (id === 'vigilante' || id === 'contract') {
    const en = Array.from({ length: j.data.count }, (_, i) => sim.ped(j.ids[`e${i}`])).filter((q): q is Ped => !!q && q.alive);
    j.markers = en.length ? en.map(q => mark(q.x, q.z, 3, q.kind === 'boss' ? '우두머리' : '적', 'target')) : []; j.text = `${id === 'contract' ? '우두머리와 경호원' : '갱'} ${en.length}명 남음 · ${clock(j.timer)}`;
    if (sim.civKills > j.data.civ0!) { end(sim, false, '시민을 해쳤습니다 · 일 실패'); return; }
    if (!en.length) end(sim, true, id === 'contract' ? '현상 의뢰 완료' : '동네를 되찾았습니다', id === 'contract' ? 2500 : 700);
  } else if (id === 'repo') {
    const car = sim.vehicle(j.ids.car); if (!car || car.wrecked || !car.alive) { end(sim, false, '회수 차량이 파괴되었습니다'); return; }
    if (!j.stage) { j.markers = [mark(car.x, car.z, 5, '회수 차량', 'item')]; j.text = `표시된 차량을 훔치세요 · ${clock(j.timer)}`; if (p.vehicle === car.id) { j.stage = 1; sim.setStars(Math.max(1, wantedUp)); sim.wanted.lastX = p.x; sim.wanted.lastZ = p.z; sim.wanted.unseenT = 0; sim.say('경찰이 눈치챘다! 해체장으로!', 3); } }
    else { const t = poi(sim, 'chop0'); j.markers = [mark(t.x, t.z, 8, '해체장')]; j.text = `해체장으로 가져가세요 · ${clock(j.timer)}`; if (p.vehicle === car.id && dist(car, t) < 9) end(sim, true, '차량 인도', 1100); }
  } else if (id === 'trial') {
    const i = j.stage, x = j.data[`x${i}`]!, z = j.data[`z${i}`]!, car = sim.vehicle(p.vehicle); j.markers = [mark(x, z, 11, `관문 ${i + 1}/5`)];
    j.text = car ? `관문 ${i + 1}/5 · ${clock(j.timer)}` : `차를 타세요 · 관문 ${i + 1}/5 · ${clock(j.timer)}`;
    if (car && Math.hypot(car.x - x, car.z - z) < 12) { j.stage++; sim.say(`관문 통과 ${j.stage}/5`, 1.5); if (j.stage >= 5) end(sim, true, '타임 트라이얼 완주', 900 + Math.floor(j.timer * 12)); }
  } else if (id === 'getaway') {
    const car = sim.vehicle(p.vehicle);
    if (!j.stage) {
      const b = poi(sim, 'bank0'); j.markers = [mark(b.x, b.z, 8, '일행 합류')]; j.text = car ? `은행 앞에 차를 세우세요 · ${clock(j.timer)}` : `차를 타고 은행으로 가세요 · ${clock(j.timer)}`;
      j.data.wait = car && dist(car, b) < 9 && Math.abs(car.vf) < 2 ? j.data.wait! + dt : 0;
      if (j.data.wait >= 2) { j.stage = 1; sim.setStars(3); sim.wanted.lastX = p.x; sim.wanted.lastZ = p.z; sim.wanted.unseenT = 0; sim.say('일행 탑승! 경찰이 몰려온다!', 3); }
    } else {
      const h = { x: j.data.escapeX, z: j.data.escapeZ }; j.markers = [mark(h.x, h.z, 8, '은신처')]; j.text = `경찰을 따돌리고 은신처로 · 수배 ${sim.wanted.stars}★ · ${clock(j.timer)}`;
      if (!car) { j.data.out = (j.data.out ?? 0) + dt; if (j.data.out > 12) { end(sim, false, '차를 버려 일행이 떠났습니다'); return; } } else j.data.out = 0;
      if (car && dist(car, h) < 9 && (sim.wanted.stars === 0 || sim.wanted.unseenT > 4)) end(sim, true, '도주 성공', 2200);
    }
  } else if (id === 'smuggle') {
    const car = sim.vehicle(j.ids.car); if (!car || car.wrecked || !car.alive) { end(sim, false, '밴이 파괴되었습니다'); return; }
    if (!j.stage) { j.markers = [mark(car.x, car.z, 5, '밴', 'item')]; j.text = `해체장의 밴을 훔치세요 · ${clock(j.timer)}`; if (p.vehicle === car.id) { j.stage = 1; sim.setStars(Math.max(2, wantedUp)); sim.wanted.lastX = p.x; sim.wanted.lastZ = p.z; sim.wanted.unseenT = 0; sim.say('상자를 실었다! 경찰이 눈치챘다', 3); } }
    else { const t = { x: j.data.x!, z: j.data.z! }; j.markers = [mark(t.x, t.z, 9, '인수 지점')]; j.text = `인수 지점까지 ${Math.floor(dist(car, t))}m · ${clock(j.timer)}`; if (p.vehicle === car.id && dist(car, t) < 10 && sim.wanted.stars <= 2) end(sim, true, '밀수 성공', 1800); }
  } else if (id === 'cargo') {
    const car = sim.vehicle(j.ids.car); if (!car || car.wrecked || !car.alive) { end(sim, false, '밴이 파괴되었습니다'); return; }
    if (!j.stage) { j.markers = [mark(car.x, car.z, 5, '화물 밴', 'item')]; j.text = `화물 밴에 타세요 · ${clock(j.timer)}`; if (p.vehicle === car.id) { j.stage = 1; j.data.carHp = car.hp; sim.say('화물 적재 완료 · 살살 모세요', 3); } }
    else {
      const t = { x: j.data.x!, z: j.data.z! }; j.markers = [mark(t.x, t.z, 9, '하역장')]; j.data.hp -= impactLoss(j, car); if (p.vehicle === car.id) { j.data.hp -= Math.hypot(car.vx, car.vz) > 38 ? dt * 1.2 : 0; if (sim.rain > 0.3 && (sim.clock >= 20 || sim.clock < 6)) j.data.rain += dt; } else j.text = '밴에 다시 타세요 · 화물이 기다립니다';
      if (p.vehicle === car.id) j.text = `화물 상태 ${Math.max(0, Math.floor(j.data.hp))}% · 하역장까지 ${Math.floor(dist(car, t))}m · ${clock(j.timer)}`;
      if (j.data.hp <= 0) { end(sim, false, '화물이 모두 망가졌습니다'); return; }
      if (p.vehicle === car.id && dist(car, t) < 10) { const wet = j.data.rain > 20 ? 400 : 0; end(sim, true, wet ? '화물 인도 · 우천 야간 보너스' : '화물 인도', 1300 + Math.round(j.data.hp * 4) + wet); }
    }
  } else if (id === 'demolish') {
    const cars = Array.from({ length: j.data.total! }, (_, i) => sim.vehicle(j.ids[`c${i}`])), left = cars.filter(v => v && v.alive && !v.wrecked);
    j.markers = left.map(v => mark(v!.x, v!.z, 5, '표적', 'target')); j.text = `표적 차량 ${left.length}대 남음 · ${clock(j.timer)}`; if (!left.length) end(sim, true, '흔적 없이 처리했다', 1500);
  } else if (id === 'tail') {
    const car = sim.vehicle(j.ids.car), d = sim.ped(j.ids.driver); if (!car || !car.alive || car.wrecked || !d?.alive) { end(sim, false, '표적을 잃었습니다'); return; }
    let node = sim.map.lanes[j.data.node!]; if (!node || dist(car, node) < 12) { const next = node?.next[0]; j.data.node = next ?? nearestLane(sim.map, car.x, car.z, car.h); node = sim.map.lanes[j.data.node!]; } if (node) autoDrive(sim, car, node.x, node.z, 14, dt);
    const gap = dist(p, car); j.markers = [mark(car.x, car.z, 5, '표적', 'target')];
    if (gap < 16) j.data.seen += dt * 1.4; else j.data.seen = Math.max(0, j.data.seen - dt * 0.6);
    if (gap > 95) j.data.far += dt; else j.data.far = Math.max(0, j.data.far - dt);
    if (gap >= 16 && gap <= 90) j.data.prog += dt;
    if (j.data.seen >= 6) { end(sim, false, '들켰습니다 · 표적이 가속했다'); return; } if (j.data.far >= 10) { end(sim, false, '표적을 놓쳤습니다'); return; }
    j.text = gap < 16 ? `너무 가깝습니다! 들킬 위험 ${Math.round(j.data.seen / 6 * 100)}%` : gap > 90 ? `너무 멉니다 · 놓칠 위험 ${Math.round(j.data.far / 10 * 100)}%` : `거리 유지 · 미행 ${Math.floor(j.data.prog)}/70초`;
    if (j.data.prog >= 70) end(sim, true, '미행 성공', 1600);
  } else if (id === 'fight') {
    const x = j.data.x!, z = j.data.z!, round = j.data.round!;
    if (dist(p, { x, z }) > 45) { end(sim, false, '링을 벗어났습니다'); return; }
    const g = p.guns[p.cur]; if (g && !(g.id === 'fist' || g.id === 'bat')) { p.cur = 0; p.reload = 0; }
    const foe = sim.ped(j.ids.foe);
    if (!foe) { // 다음 상대 등장
      if (round >= 3) { end(sim, true, '챔피언 등극', 0); return; }
      const hp = [90, 150, 230][round]!, f = sim.spawnPed('gang', x + 5, z + 5, { keep: true, tag: 'job', mode: 'attack', target: PLAYER_ID, hp, maxHp: hp, armor: round === 2 ? 40 : 0, loot: 0, name: ['쇠주먹', '코뿔소', '챔피언'][round]! });
      f.guns = f.guns.map((_, i) => (i === 0 ? { id: 'fist' as const, mag: 0, reserve: 0 } : null)); f.cur = 0; j.ids.foe = f.id; j.text = `${round + 1}라운드 · vs ${f.name}`; sim.say(`${round + 1}라운드 · ${f.name}`, 2.5);
    } else if (!foe.alive) {
      const prize = [400, 800, 1600][round]!; j.data.round = round + 1; j.ids.foe = 0; sim.count('fights'); sim.earn(prize); sim.say(`승리! 상금 $${prize.toLocaleString('en-US')}`, 3);
      sim.removePed(foe); if (j.data.round >= 3) end(sim, true, '3연승 · 챔피언 등극', 0); else p.hp = Math.min(p.maxHp, p.hp + 30);
    } else { j.markers = [mark(foe.x, foe.z, 2, foe.name, 'target')]; j.text = `${round + 1}라운드 · vs ${foe.name} · 체력 ${Math.max(0, Math.ceil(foe.hp))}`; foe.mode = 'attack'; foe.target = PLAYER_ID; }
  }
}

// ---------- 소매치기 ----------
const lifted = new WeakMap<Sim, Map<number, number>>();
export interface PickTarget { ped: Ped; behind: boolean }
export function pickpocketTarget(sim: Sim): PickTarget | null {
  const p = sim.player; if (!p.alive || p.vehicle || sim.job.active === 'fight') return null;
  let best: Ped | null = null, bd = 1.9;
  for (const q of sim.peds) { if (q.kind !== 'civ' || !q.alive || q.vehicle || q.mode === 'flee' || q.mode === 'cower') continue; const d = dist(q, p); if (d < bd && (lifted.get(sim)?.get(q.id) ?? -1) < sim.t) { bd = d; best = q; } }
  if (!best) return null;
  const toPlayer = Math.atan2(p.z - best.z, p.x - best.x); return { ped: best, behind: Math.abs(wrapAngle(toPlayer - best.yaw)) > 2.0 };
}
export function pickpocket(sim: Sim): string {
  const t = pickpocketTarget(sim); if (!t) return '소매치기할 대상이 없습니다';
  const m = lifted.get(sim) ?? new Map<number, number>(); lifted.set(sim, m); m.set(t.ped.id, sim.t + 9999); const q = t.ped;
  if (t.behind || sim.rng() < 0.2) {
    const n = Math.round((20 + sim.rng() * 90) * sim.perk.loot); sim.addCash(n); sim.count('pickpocket'); return `지갑을 슬쩍 · +$${n}`;
  }
  q.mode = 'flee'; q.fear = 1; q.timer = 10; sim.emit({ t: 'scream', id: q.id }); sim.addCrime('assault', q.x, q.z, PLAYER_ID, q.id, 0.8); return '들켰다! 시민이 비명을 지릅니다';
}

export const jobCars = (sim: Sim): Vehicle[] => sim.vehicles.filter(v => v.tag === 'job');
export const AMBULANCE_NAME = VEHICLES.ambulance.name;
