// OUTLAW CITY — 일곱 의뢰의 이야기와 목표 진행, 추격·경주 제어.
import type { Sim } from './sim';
import type { Marker, Vehicle } from './types';
import { autoDrive } from './vehicle';
import { nearestLane, findPath } from './world';

export interface MissionInfo { id: string; title: string; giver: string; brief: string; reward: number; startPoi: string; requires: string[] }
const entries: Array<[string, string, string, string, number]> = [
  ['m_delivery', '첫 심부름', '마담 리', '“루키, 도시에 온 걸 환영해.”\n꾸러미를 찾아 차고로 가져와. 차를 빌리든 훔치든 네 마음이야.', 500],
  ['m_theft', '특급 주문', '정비공 준', '“빨간 스포츠카 한 대가 필요해.”\n흠집은 좀 참아도 반 토막은 곤란해. 해체장까지 몰고 와.', 1200],
  ['m_debt', '빚 받기', '마담 리', '“창고의 친구들이 내 돈을 잊었나 봐.”\n루키, 다섯 명에게 기억을 되살려 줘. 우두머리부터 조심하고.', 1500],
  ['m_chase', '꼬리 잡기', '운전사 태오', '“저 세단에 입이 가벼운 녀석이 탔어.”\n도시 끝까지 쫓아서 차든 운전자든 멈춰 세워.', 2000],
  ['m_heist', '은행 강도', '마담 리', '“이번엔 은행이 우리에게 빚을 갚을 차례야.”\n금고를 열고 경찰을 따돌린 뒤 은신처로 돌아와.', 6000],
  ['m_race', '스트리트 레이스', '레이서 나래', '“루키, 말보다 핸들로 증명해.”\n스포츠카를 골라 열 개의 관문을 지나. 1등만 기억해 줄게.', 3000],
  ['m_boss', '마지막 거래', '마담 리', '“카지노에 내 자리를 노리는 자가 있어.”\n그와 경호원들을 끝내고 살아 돌아와. 마지막까지 방심하지 마.', 10000],
];
export const MISSION_LIST: MissionInfo[] = entries.map(([id, title, giver, brief, reward], i) => ({ id, title, giver, brief, reward, startPoi: id, requires: i ? [entries[i - 1][0]] : [] }));
const dist = (a: {x: number; z: number}, b: {x: number; z: number}): number => Math.hypot(a.x - b.x, a.z - b.z);
const poi = (s: Sim, id: string) => s.map.pois.find(p => p.id === id) ?? s.map.pois[0];
const mark = (x: number, z: number, r: number, label: string, kind: Marker['kind'] = 'goal'): Marker => ({ x, z, r, label, kind, blip: true, color: kind === 'item' ? 0x4de1ff : kind === 'target' ? 0xff4545 : 0xffd23f });
const clock = (t: number): string => { const n = Math.ceil(Math.max(0, t)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
function notice(s: Sim, what: 'start' | 'stage' | 'pass' | 'fail', text: string): void { s.mission.banner = text; s.mission.bannerT = 4; s.emit({ t: 'mission', id: s.mission.active, what, text }); }
function stage(s: Sim, n: number, text: string): void { s.mission.stage = n; notice(s, 'stage', text); }
function wanted(s: Sim, n: number): void { s.setStars(Math.max(n, s.wanted.stars)); s.wanted.lastX = s.player.x; s.wanted.lastZ = s.player.z; s.wanted.unseenT = 0; }
function cleanup(s: Sim): void {
  const tag = s.mission.active;
  for (const p of s.peds.slice()) if (p.tag === tag && p.id !== s.player.id) { p.keep = false; p.tag = ''; if (dist(p, s.player) > 190) s.removePed(p); }
  for (const v of s.vehicles.slice()) if (v.tag === tag) { v.keep = false; v.tag = ''; if (v.driver !== s.player.id) { v.mode = 'parked'; v.input.throttle = 0; v.input.brake = 1; } if (dist(v, s.player) > 190 && v.driver !== s.player.id) s.removeVehicle(v); }
  s.mission.active = ''; s.mission.stage = 0; s.mission.timer = 0; s.mission.text = ''; s.mission.markers = []; s.mission.data = {}; s.mission.ids = {}; s.mission.failed = '';
}
function pass(s: Sim): void { const m = s.mission, info = MISSION_LIST.find(q => q.id === m.active); if (!info) return; if (info.id === 'm_debt') s.giveWeapon(s.player, 'smg'); if (info.id === 'm_boss') s.say('OUTLAW CITY — 끝? 도시는 아직 당신의 것입니다.', 8); s.addCash(info.reward); m.completed.push(info.id); notice(s, 'pass', `MISSION PASSED  +$${info.reward}`); cleanup(s); s.emit({ t: 'save' }); }
export function canStart(s: Sim, id: string): boolean { const q = MISSION_LIST.find(m => m.id === id); return !!q && !s.mission.active && !s.mission.completed.includes(id) && q.requires.every(r => s.mission.completed.includes(r)); }
function car(s: Sim, kind: 'sports' | 'sedan' | 'van', x: number, z: number, h = 0): Vehicle { return s.spawnVehicle(kind, x, z, h, { keep: true, tag: s.mission.active, locked: false }); }
function gang(s: Sim, x: number, z: number, boss = false): void { s.spawnPed(boss ? 'boss' : 'gang', x, z, { keep: true, tag: s.mission.active, mode: 'guard', tx: x, tz: z, aux: 6 }); }
/** Greedy stable nearest nonoverlapping sidewalk points. Only a handful of
 * guards are needed, so O(points × guards) scans avoid full map-array copies,
 * repeated square roots and an O(points log points) global sort. */
export function nearestWalkPoints(
  points: readonly { x: number; z: number }[], x: number, z: number, count: number,
): Array<{ x: number; z: number }> {
  const chosen: Array<{ x: number; z: number }> = [];
  for (let n = 0; n < count; n++) {
    let closest: { x: number; z: number } | undefined, distSq = Infinity;
    for (const p of points) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d >= distSq || chosen.some(q => (q.x-p.x) ** 2 + (q.z-p.z) ** 2 < 16)) continue;
      closest = p; distSq = d;
    }
    if (!closest) break;
    chosen.push(closest);
  }
  return chosen;
}
function farthestWalkPoint(points: readonly { x: number; z: number }[], x: number, z: number): { x: number; z: number } | undefined {
  let farthest: { x: number; z: number } | undefined, distSq = -1;
  for (const p of points) {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d > distSq) { farthest = p; distSq = d; }
  }
  return farthest;
}
function nearWalk(s: Sim, x: number, z: number, count: number): Array<{ x: number; z: number }> {
  return nearestWalkPoints(s.map.walkPoints, x, z, count);
}
function route(s: Sim, x: number, z: number): number[] {
  const lanes = s.map.lanes, start = nearestLane(s.map, x, z); if (start < 0) return [];
  const result: number[] = [], visited = new Set<number>(); let current = start, last = lanes[start];
  for (let i = 0; i < 1800 && result.length < 10; i++) { const n = lanes[current]; if (!n) break; const choices = n.next.filter(id => !!lanes[id]); if (!choices.length) break; const next = choices.find(id => !visited.has(id) && Math.abs(lanes[id].h - n.h) > 0.3) ?? choices.find(id => !visited.has(id)) ?? choices[0]; visited.add(current); current = next; const p = lanes[current]; if (dist(p, last) >= 110 && dist(p, last) <= 220) { result.push(current); last = p; } }
  return result;
}
export function startMission(s: Sim, id: string): boolean {
  if (!canStart(s, id)) return false; const m = s.mission, p = s.player; m.active = id; m.stage = 0; m.timer = 0; m.data = {}; m.ids = {}; m.failed = ''; m.markers = [];
  const start = poi(s, id) ?? p;
  if (id === 'm_delivery') { const target = farthestWalkPoint(s.map.walkPoints, start.x, start.z) ?? start; m.data.x = target.x; m.data.z = target.z; m.timer = 180; }
  if (id === 'm_theft') { const lane = s.map.lanes[nearestLane(s.map, 0, 0)]; const v = car(s, 'sports', lane?.x ?? 0, lane?.z ?? 0, lane?.h); v.color = 0xe32c36; m.ids.car = v.id; m.timer = 240; }
  if (id === 'm_debt' || id === 'm_boss') { const center = id === 'm_debt' ? (s.map.buildings.find(b => b.district === 'industrial' && b.kind === 'warehouse') ?? poi(s, 'chop0')) : poi(s, 'casino0'); const points = nearWalk(s, center.x, center.z, id === 'm_debt' ? 5 : 9); points.forEach((q, i) => { gang(s, q.x, q.z, id === 'm_boss' && i === 0); const ped = s.peds[s.peds.length - 1]; if (id === 'm_debt' && i === 0) ped.hp = ped.maxHp = 220; m.ids[`enemy${i}`] = ped.id; }); m.data.count = points.length; }
  if (id === 'm_chase') { const lane = s.map.lanes[nearestLane(s.map, start.x, start.z)]; const v = car(s, 'sedan', lane?.x ?? start.x, lane?.z ?? start.z, lane?.h); v.mode = 'scripted'; const driver = s.spawnPed('gang', v.x, v.z, { keep: true, tag: id, mode: 'scripted', vehicle: v.id }); v.driver = driver.id; m.ids.car = v.id; m.ids.driver = driver.id; m.data.node = lane?.id ?? -1; }
  if (id === 'm_heist') { const bank = poi(s, 'bank0'), lane = s.map.lanes[nearestLane(s.map, bank.x, bank.z)]; const v = car(s, 'van', lane?.x ?? bank.x, lane?.z ?? bank.z, lane?.h); m.ids.van = v.id; }
  if (id === 'm_race') { const lane = s.map.lanes[nearestLane(s.map, start.x, start.z)]; const path = route(s, start.x, start.z); path.forEach((n,i) => { m.data[`cp${i}`] = n; }); m.data.total = path.length; for (let i = 0; i < 5; i++) { const v = car(s, 'sports', (lane?.x ?? start.x) - Math.cos(lane?.h ?? 0) * (i * 6), (lane?.z ?? start.z) - Math.sin(lane?.h ?? 0) * (i * 6), lane?.h); m.ids[`race${i}`] = v.id; if (i > 0 && i < 4) { v.mode = 'scripted'; const d = s.spawnPed('gang', v.x, v.z, { keep: true, tag: id, mode: 'scripted', vehicle: v.id }); v.driver = d.id; } } }
  notice(s, 'start', MISSION_LIST.find(q => q.id === id)!.title); stepMissions(s, 0); return true;
}
export function failMission(s: Sim, reason: string): void { if (!s.mission.active) { s.mission.failed = ''; return; } notice(s, 'fail', `MISSION FAILED — ${reason}`); cleanup(s); }
function drive(s: Sim, v: Vehicle, target: {x: number; z: number}, speed: number, dt: number, key: string): void { const m = s.mission; let path = v.path; if (!path.length || (m.data[key] ?? 0) <= 0) { path = v.path = findPath(s.map, nearestLane(s.map, v.x, v.z, v.h), target.x, target.z); m.data[key] = 3; } m.data[key] -= dt; while (path.length > 1 && dist(v, s.map.lanes[path[0]]) < 9) path.shift(); const n = s.map.lanes[path[0]] ?? target; autoDrive(s, v, n.x, n.z, speed, dt); }
export function stepMissions(s: Sim, dt: number): void {
  const m = s.mission, p = s.player, id = m.active; m.bannerT = Math.max(0, m.bannerT - Math.max(0, dt)); if (!id) { m.failed = ''; return; } if (m.failed) { failMission(s, m.failed); return; } if (!p.alive || s.downKind) { failMission(s, s.downKind === 'busted' ? '체포되었습니다' : '쓰러졌습니다'); return; }
  if (m.timer > 0) { m.timer = Math.max(0, m.timer - Math.max(0, dt)); if (!m.timer) { failMission(s, '시간 초과'); return; } }
  const goal = (q: {x: number; z: number}, label: string, r = 7, kind: Marker['kind'] = 'goal'): void => { m.markers = [mark(q.x, q.z, r, label, kind)]; };
  if (id === 'm_delivery') { const target = m.stage ? poi(s, 'garage0') : {x:m.data.x,z:m.data.z}; goal(target, m.stage ? '차고' : '꾸러미', 5, m.stage ? 'goal' : 'item'); m.text = `${m.stage ? '차고에 꾸러미를 배달해' : '꾸러미를 챙겨. 차를 훔쳐 타도 좋아'}  ${clock(m.timer)}`; if (dist(p, target) < 5) { if (!m.stage) stage(s, 1, '꾸러미 확보 — 차고로!'); else pass(s); } }
  else if (id === 'm_theft') { const v = s.vehicle(m.ids.car); if (!v || !v.alive || v.wrecked || v.hp <= 0) { failMission(s, '주문 차량이 파괴됐습니다'); return; } if (!m.stage && p.vehicle === v.id) { wanted(s, 2); stage(s, 1, '경찰이다! 해체장으로 달려'); } const target = m.stage ? poi(s, 'chop0') : v; goal(target, m.stage ? '해체장' : '빨간 스포츠카', 7, m.stage ? 'goal' : 'target'); m.text = `${m.stage ? `해체장으로 운반 · 차량 ${Math.ceil(v.hp / v.maxHp * 100)}% (50% 이상)` : '빨간 스포츠카를 훔쳐'}  ${clock(m.timer)}`; if (m.stage && p.vehicle === v.id && dist(v, target) < 8 && v.hp >= v.maxHp * 0.5) pass(s); }
  else if (id === 'm_debt' || (id === 'm_boss' && !m.stage)) { const enemies = Array.from({length:m.data.count}, (_,i) => s.ped(m.ids[`enemy${i}`])).filter(q => q?.alive); m.markers = enemies.map(q => mark(q!.x, q!.z, 3, q!.kind === 'boss' ? '보스' : '적', 'target')); m.text = `${id === 'm_debt' ? '창고의 갱을 정리해' : '카지노의 보스와 경호원을 쓰러뜨려'} · 남은 적 ${enemies.length}`; if (id === 'm_boss' && !m.data.alert && !s.ped(m.ids.enemy0)?.alive) { m.data.alert = 1; wanted(s, 3); notice(s, 'stage', '보스 제압! 경찰이 몰려온다'); } if (!enemies.length) { if (id === 'm_debt') pass(s); else { wanted(s, 3); stage(s, 1, '거래 종료 — 은신처로 탈출'); } } }
  else if (id === 'm_chase') {
    const v = s.vehicle(m.ids.car), d = s.ped(m.ids.driver);
    // Despawned/missing scripted targets are not a successful takedown.
    if (!v) { failMission(s, '도주 차량이 사라졌습니다'); return; }
    if (v.wrecked || !v.alive || !d?.alive || v.driver !== d.id) { pass(s); return; } let node = s.map.lanes[m.data.node]; if (!node || dist(v, node) < 12) { const next = node?.next[0]; m.data.node = next ?? nearestLane(s.map, v.x, v.z, v.h); node = s.map.lanes[m.data.node]; } if (node) autoDrive(s, v, node.x, node.z, 35, dt); goal(v, '도주 차량', 6, 'target'); const far = dist(p, v) > 120; if (far) { if (!m.data.far) notice(s, 'stage', '놈을 놓친다! 20초 안에 따라잡아'); m.data.far = (m.data.far ?? 0) + dt; if (m.data.far >= 20) { failMission(s, '도주 차량을 놓쳤습니다'); return; } } else m.data.far = 0; m.text = far ? `도주 차량을 따라잡아 · ${Math.ceil(20 - m.data.far)}초` : '도주 차량이나 운전자를 멈춰 세워'; }
  else if (id === 'm_heist') { const target = poi(s, m.stage ? 'safe1' : 'bank0'); goal(target, m.stage ? '은신처' : '은행 금고', 7); if (!m.stage) { m.data.hold = dist(p, target) < 7 ? (m.data.hold ?? 0) + dt : 0; m.text = `은행 앞에서 금고를 열어 · ${Math.min(2.5, m.data.hold).toFixed(1)}/2.5초`; if (m.data.hold >= 2.5) { wanted(s, 4); m.timer = 300; stage(s, 1, '금고 확보! 경찰을 따돌려'); } } else { m.text = `${s.wanted.stars ? '경찰을 먼저 따돌려라' : '은신처로 돌아가'}  ${clock(m.timer)}`; if (dist(p, target) < 7 && s.wanted.stars === 0) pass(s); } }
  else if (id === 'm_race') { const own = [0,4].map(i => s.vehicle(m.ids[`race${i}`])).find(v => v?.id === p.vehicle); if (!m.stage) { const v = s.vehicle(m.ids.race0); if (v) goal(v, '스포츠카', 8); m.text = '스포츠카에 올라타 출발해'; if (own) { m.ids.playerCar = own.id; stage(s, 1, '레이스 시작! 첫 관문으로'); } } else { const v = s.vehicle(m.ids.playerCar), total = m.data.total; if (!v || v.wrecked || !v.alive) { failMission(s, '레이스 차량이 파괴됐습니다'); return; } const idx = m.data.player ?? 0, cp = s.map.lanes[m.data[`cp${idx}`]]; if (!cp) { failMission(s, '경주 경로를 찾을 수 없습니다'); return; } goal(cp, `체크포인트 ${idx + 1}/${total}`, 18); if (p.vehicle === v.id && dist(v, cp) < 18) { m.data.player = idx + 1; if (idx + 1 >= total) { pass(s); return; } notice(s, 'stage', `체크포인트 ${idx + 1}/${total}`); } let rank = 1; for (let i = 1; i <= 3; i++) { const rival = s.vehicle(m.ids[`race${i}`]); if (!rival || rival.wrecked || !rival.alive || rival.driver === p.id || !s.ped(rival.driver)?.alive) continue; const k = `r${i}`, ri = m.data[k] ?? 0, target = s.map.lanes[m.data[`cp${ri}`]]; if (!target) continue; if (dist(rival, target) < 18) { m.data[k] = ri + 1; rival.path = []; if (ri + 1 >= total) { failMission(s, '라이벌이 먼저 도착했습니다'); return; } } drive(s, rival, target, 32 + i * 1.5 + Math.max(-3, Math.min(3, ((m.data.player ?? 0) - ri) * 1.5)), dt, `path${i}`); const pc = s.map.lanes[m.data[`cp${m.data.player ?? 0}`]]; if (ri > (m.data.player ?? 0) || (ri === (m.data.player ?? 0) && pc && dist(rival, target) < dist(v, pc))) rank++; } m.text = `${rank}위 / 4 · 체크포인트 ${Math.min(total, (m.data.player ?? 0) + 1)}/${total}`; } }
  else if (id === 'm_boss') { const target = poi(s, 'safe0'); goal(target, '은신처', 7); m.text = '경찰을 뚫고 은신처로 탈출해 · 수배 3★ 이하'; if (dist(p, target) < 7 && s.wanted.stars <= 3) pass(s); }
}
