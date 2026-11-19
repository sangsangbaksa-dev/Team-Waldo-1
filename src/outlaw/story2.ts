// OUTLAW CITY — 2부 의뢰: VIP 호송(차량 보호·추격)과 먼 거리의 거래(저격). missions.ts 가 불러 쓰는 진행 코드입니다.
import type { Sim } from './sim';
import type { Vehicle } from './types';
import { nearestLane } from './world';
import { clock, dist, drive, failMission, mark, nearWalk, pass, poi, stage, wanted } from './missions';

export const STORY2_IDS = ['m_vip', 'm_sniper'];
const MAX_CHASERS = 6;

function lanePoint(s: Sim, x: number, z: number): { x: number; z: number; h: number } {
  const n = s.map.lanes[nearestLane(s.map, x, z)]; return { x: n?.x ?? x, z: n?.z ?? z, h: n?.h ?? 0 };
}

export function startStory2(s: Sim, id: string): void {
  const m = s.mission, start = poi(s, id);
  if (id === 'm_vip') {
    const l = lanePoint(s, start.x, start.z);
    const v = s.spawnVehicle('sedan', l.x, l.z, l.h, { keep: true, tag: id, locked: false, color: 0x15181d }); v.mode = 'parked'; v.input.brake = 1;
    m.ids.car = v.id; m.timer = 420; m.data.spawned = 0; m.data.chaseT = 0; m.data.out = 0;
  } else if (id === 'm_sniper') {
    s.giveWeapon(s.player, 'sniper'); const g = s.player.guns.find(q => q?.id === 'sniper'); if (g) g.reserve = Math.max(g.reserve, 20);
    // 출발점에서 250~350m 떨어진 보행 지점을 표적 자리로 삼습니다.
    const pool = s.map.walkPoints.filter(q => { const d = dist(q, start); return d > 250 && d < 360; });
    const c = pool[Math.floor(s.rng() * pool.length)] ?? poi(s, 'club0'), pts = nearWalk(s, c.x, c.z, 5);
    pts.forEach((q, i) => {
      const ped = s.spawnPed(i === 0 ? 'boss' : 'gang', q.x, q.z, { keep: true, tag: id, mode: 'guard', tx: q.x, tz: q.z, aux: 8 });
      if (i === 0) { ped.name = '표적'; ped.hp = ped.maxHp = 180; m.ids.target = ped.id; } else m.ids[`g${i}`] = ped.id;
    });
    m.data.x = c.x; m.data.z = c.z; m.data.near = 9999; m.data.civ0 = s.civKills; m.timer = 480;
  }
}

function spawnChaser(s: Sim, v: Vehicle): void {
  const m = s.mission, back = lanePoint(s, v.x - Math.cos(v.h) * 120, v.z - Math.sin(v.h) * 120);
  if (dist(back, v) < 70) return;
  const c = s.spawnVehicle('sports', back.x, back.z, back.h, { keep: true, tag: m.active, locked: false, color: 0x7a1010 }); c.mode = 'scripted';
  const d = s.spawnPed('gang', c.x, c.z, { keep: true, tag: m.active, mode: 'scripted', vehicle: c.id }); c.driver = d.id;
  m.ids[`chase${m.data.spawned}`] = c.id; m.data.spawned++;
}

export function stepStory2(s: Sim, dt: number): void {
  const m = s.mission, p = s.player, id = m.active;
  if (id === 'm_vip') {
    const v = s.vehicle(m.ids.car); if (!v || !v.alive || v.wrecked) { failMission(s, 'VIP 차량이 파괴됐습니다'); return; }
    const dest = poi(s, 'chop0'), inCar = p.vehicle === v.id;
    if (!m.stage) {
      m.markers = [mark(v.x, v.z, 6, 'VIP 세단', 'item')]; m.text = '검은 세단에 올라 VIP를 태워';
      if (inCar) { stage(s, 1, 'VIP 탑승 · 항구로! 쫓아오는 차를 조심해'); m.data.chaseT = 8; } return;
    }
    m.markers = [mark(dest.x, dest.z, 10, '항구')]; const hp = Math.max(0, Math.round(v.hp / v.maxHp * 100));
    m.data.out = inCar ? 0 : m.data.out! + dt; if (m.data.out! > 14) { failMission(s, 'VIP를 두고 떠났습니다'); return; }
    m.text = inCar ? `VIP 호송 · 차체 ${hp}% · 항구까지 ${Math.floor(dist(v, dest))}m · ${clock(m.timer)}` : `세단으로 돌아가세요! ${Math.ceil(14 - m.data.out!)}초`;
    // 추격차: 아직 두 대 미만이면 뒤에서 새로 붙습니다.
    const live: Vehicle[] = [];
    for (let i = 0; i < m.data.spawned!; i++) { const c = s.vehicle(m.ids[`chase${i}`]); if (c && c.alive && !c.wrecked && dist(c, v) < 400) live.push(c); }
    m.data.chaseT! -= dt; if (m.data.chaseT! <= 0 && live.length < 2 && m.data.spawned! < MAX_CHASERS && inCar) { spawnChaser(s, v); m.data.chaseT = 14; }
    live.forEach((c, i) => { const d = s.ped(c.driver); if (!d?.alive) { c.input.throttle = 0; c.input.brake = 1; return; } drive(s, c, v, 52, dt, `d${i}`); });
    if (inCar && dist(v, dest) < 12) pass(s);
  } else if (id === 'm_sniper') {
    const t = s.ped(m.ids.target);
    if (s.civKills > m.data.civ0!) { failMission(s, '시민을 해쳤습니다'); return; }
    if (!m.stage) {
      if (t?.alive) { m.data.near = Math.min(m.data.near!, dist(p, t)); m.markers = [mark(t.x, t.z, 5, '표적', 'target')]; }
      const d = t ? Math.floor(dist(p, t)) : 0;
      m.text = t?.alive ? `저격총으로 표적을 처리하세요 · 거리 ${d}m${d < 70 ? ' · 너무 가깝습니다' : ''}` : '';
      if (t && !t.alive) {
        const far = m.data.near! >= 100; wanted(s, 2);
        if (far) s.addCash(2500);
        stage(s, 1, far ? '멀리서 깔끔하게 · 보너스 $2,500! 경찰을 따돌려' : '표적 제거 · 경찰이 몰려온다');
      }
    } else {
      m.markers = []; m.text = `경찰을 따돌리세요 · 수배 ${s.wanted.stars}★ · ${clock(m.timer)}`;
      if (s.wanted.stars === 0) pass(s);
    }
  }
}
