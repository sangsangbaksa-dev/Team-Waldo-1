// LAST CITY — 도시 사건: 사업·전투 사이에 끼어드는 시간제 부업(현금 수송차 습격, 조난자 구조, 불법 배달, 현상금 사냥)
import { CIV, FACTION_COUNT, SIZE } from './defs';
import { lanePoint, navBlocked } from './map';
import type { Actor, World } from './world';

export type CityEventKind = 'convoy' | 'rescue' | 'delivery' | 'bounty';
export interface CityEvent {
  kind: CityEventKind; x: number; y: number; /** 남은 시간(초) */ t: number; total: number; /** 수송차 id */ vid: number; /** 구조 진행(초) */ prog: number; ids: number[];
  /** 배달: 0 = 물건 수령 전, 1 = 배달 중(x,y 가 목적지) */ stage: number; tx: number; ty: number; /** 배달·현상금의 기본 보수 */ pay: number;
}
export const EVENT_INFO: Record<CityEventKind, { name: string; color: string }> = {
  convoy: { name: '현금 수송차', color: '#ffd24a' },
  rescue: { name: '조난자 구조', color: '#7dffb0' },
  delivery: { name: '불법 배달', color: '#7dc8ff' },
  bounty: { name: '현상금 사냥', color: '#ff7a5c' },
};
/** 부업을 몇 건 끝내면 한 번씩 받는 이정표 보너스 */
export const SIDE_MILESTONES = [{ n: 3, reward: 400, title: '동네 해결사' }, { n: 6, reward: 900, title: '골목 청소부' }, { n: 10, reward: 1800, title: '도시의 만능 일꾼' }] as const;
/** 연속 성공 보너스 배율 (최대 +50%) */
export const streakMult = (streak: number): number => 1 + Math.min(5, Math.max(0, streak)) * 0.1;
export const quickEventBonus = (remaining: number, total: number): number =>
  total > 0 ? Math.round(200 * Math.max(0, Math.min(1, remaining / total))) : 0;
const KINDS: CityEventKind[] = ['convoy', 'rescue', 'delivery', 'bounty'];
const RESCUE_TIME = 3, FIRST_AT = 70;

/** 매초 호출. 사건이 없으면 대기 시간을 줄이다 새로 시작하고, 있으면 진행을 확인합니다. */
export function updateCityEvents(w: World): void {
  if (w.opts.tutorial || w.opts.duel) return;
  const pb = w.boss(0);
  if (!w.event) {
    if (w.time < FIRST_AT || !pb) return;
    w.eventT -= 1; if (w.eventT > 0) return;
    const pool = KINDS.filter(k => k !== w.lastEvent);
    startEvent(w, pool[Math.floor(w.rng() * pool.length)], pb.x, pb.y);
    return;
  }
  const ev = w.event; ev.t -= 1;
  if (ev.kind === 'convoy') {
    const v = w.vehicles.find(q => q.id === ev.vid);
    if (v && v.alive && v.hp > 0) { ev.x = v.x; ev.y = v.y; }
    else { finish(w, true); return; }
  } else if (ev.kind === 'bounty') {
    const t = w.byId.get(ev.ids[0]);
    if (!t || !t.alive) { finish(w, false); return; }
    ev.x = t.x; ev.y = t.y;
  } else if (ev.kind === 'delivery') {
    if (pb && !w.inside && Math.hypot(pb.x - ev.x, pb.y - ev.y) < 70) {
      if (ev.stage === 0) {
        ev.stage = 1; ev.x = ev.tx; ev.y = ev.ty; ev.t = Math.max(ev.t, 80); ev.total = Math.max(ev.total, ev.t);
        w.say('물건 수령 — 표시된 곳으로 서둘러 배달하세요', EVENT_INFO.delivery.color); w.fx('announce', 0, 0, 0, '물건 수령'); return;
      }
      finish(w, true); return;
    }
  } else {
    const survivorPresent = ev.ids.some(id => w.byId.get(id)?.alive);
    if (!survivorPresent) { finish(w, false); return; }
    if (pb && !w.inside && Math.hypot(pb.x - ev.x, pb.y - ev.y) < 90) ev.prog += 1;
    else ev.prog = Math.max(0, ev.prog - 1);
    if (ev.prog >= RESCUE_TIME) { finish(w, true); return; }
  }
  if (ev.t <= 0) finish(w, false);
}

/** 마지막 타격의 조직과 처치 위치로 현상금을 정산합니다. */
export function resolveBountyKill(w: World, target: Actor, killer: number): void {
  const ev = w.event;
  if (ev?.kind !== 'bounty' || ev.ids[0] !== target.id) return;
  ev.x = target.x; ev.y = target.y;
  finish(w, killer === 0);
}

/** 배달 목적지: 물건 수령 지점에서 400~1300 떨어진 도로 위의 점 */
function pickDrop(w: World, px: number, py: number): { x: number; y: number } | null {
  for (let k = 0; k < 30; k++) {
    const p = lanePoint(w.rng), d = Math.hypot(p.x - px, p.y - py);
    if (d < 400 || d > 1300 || p.x < 80 || p.y < 80 || p.x > SIZE - 80 || p.y > SIZE - 80 || navBlocked(w.map, p.x, p.y)) continue;
    return { x: p.x, y: p.y };
  }
  return null;
}

const MSG: Record<CityEventKind, [string, string]> = {
  convoy: ['현금 수송차가 도심을 지나갑니다 — 격파하면 현금이 쏟아집니다', '현금 수송차 출현'],
  rescue: ['조난 신호 — 생존자에게 다가가 구조하세요', '조난 신호 감지'],
  delivery: ['불법 배달 의뢰 — 표시된 곳에서 물건을 받아 목적지로 전달하세요 (차량 추천)', '배달 의뢰 도착'],
  bounty: ['현상금 목표 발견 — 표시된 곳의 우두머리를 쓰러뜨리세요 (경호 2명 동행)', '현상금 사냥 개시'],
};

export function startEvent(w: World, kind: CityEventKind, px: number, py: number): void {
  const z = w.zone, time = kind === 'convoy' ? 110 : kind === 'delivery' ? 140 : kind === 'bounty' ? 120 : 90;
  for (let k = 0; k < 24; k++) {
    const p = lanePoint(w.rng), d = Math.hypot(p.x - px, p.y - py);
    if (d < 650 || d > 1500 || p.x < 80 || p.y < 80 || p.x > SIZE - 80 || p.y > SIZE - 80 || Math.hypot(p.x - z.x, p.y - z.y) > z.r - 60 || navBlocked(w.map, p.x, p.y)) continue;
    if (w.vehicles.some(v => Math.hypot(v.x - p.x, v.y - p.y) < 90)) continue;
    const ev: CityEvent = { kind, x: p.x, y: p.y, t: time, total: time, vid: 0, prog: 0, ids: [], stage: 0, tx: 0, ty: 0, pay: 0 };
    if (kind === 'delivery') {
      const q = pickDrop(w, p.x, p.y); if (!q) continue;
      ev.tx = q.x; ev.ty = q.y; ev.pay = 300 + Math.round(Math.hypot(q.x - p.x, q.y - p.y) * 0.35);
    } else if (kind === 'convoy') {
      const v = w.spawnVehicle('truck', p.x, p.y, p.dir * Math.PI / 2); v.dir = p.dir; v.nextTurn = p.dir; v.ai = 'traffic'; v.hp = v.maxHp = 1100; v.color = '#caa02a'; ev.vid = v.id;
      const d2 = w.spawnActor('civ', CIV, p.x, p.y); d2.inVeh = v.id; v.driver = d2.id; v.f = CIV;
    } else if (kind === 'bounty') {
      const rivals = w.factions.filter(r => r.id !== 0 && r.alive), rf = (rivals.length ? rivals[Math.floor(w.rng() * rivals.length)].id : 1) % FACTION_COUNT;
      const t = w.spawnUnit('guard', rf, p.x, p.y); t.maxHp = t.hp = 420; t.weapon = 'u_smg'; ev.ids.push(t.id); ev.pay = 500;
      for (let i = 0; i < 2; i++) ev.ids.push(w.spawnUnit('guard', rf, p.x + (i ? 26 : -26), p.y + 14).id);
    } else {
      for (let i = 0; i < 3; i++) { const c = w.spawnActor('civ', CIV, p.x + (i - 1) * 22, p.y + (i % 2) * 14); c.order = { type: 'hold', x: c.x, y: c.y }; ev.ids.push(c.id); }
    }
    w.event = ev; w.lastEvent = kind; w.say(MSG[kind][0], EVENT_INFO[kind].color); w.fx('announce', 0, 0, 0, MSG[kind][1]); return;
  }
  w.eventT = 25; // 자리를 못 찾으면 곧 다시 시도
}

function removeActor(w: World, id: number): void { const a = w.byId.get(id); if (a && a.alive) { a.alive = false; a.gone = true; w.byId.delete(a.id); } }

function finish(w: World, ok: boolean): void {
  const ev = w.event!, f = w.factions[0]; w.event = null; w.eventT = 80 + w.rng() * 50;
  if (!ok) {
    w.eventStreak = 0; w.say(`${EVENT_INFO[ev.kind].name} 놓침 — 연속 보너스 초기화`, '#9aa4b2');
    for (const id of ev.ids) { if (ev.kind === 'bounty') removeActor(w, id); else { const a = w.byId.get(id); if (a) a.order = { type: 'wander', x: a.x, y: a.y }; } }
    return;
  }
  w.eventsDone++; w.eventStreak++;
  const m = streakMult(w.eventStreak - 1), bonus = w.eventStreak > 1 ? ` · 연속 ${w.eventStreak}회 ×${m.toFixed(1)}` : '';
  const pay = (base: number): number => Math.round(base * m);
  const cash = (amt: number, xp: number): void => { f.cash += amt; f.earned += amt; w.gainXp(f, xp); w.fx('cash', ev.x, ev.y, amt, undefined, 0); };
  if (ev.kind === 'convoy') {
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; w.spawnLoot('cash', ev.x + Math.cos(a) * 46, ev.y + Math.sin(a) * 46, pay(160 + Math.floor(w.rng() * 120))); }
    w.spawnLoot(w.rng() < 0.5 ? 'armor' : 'medkit', ev.x, ev.y, 50);
    w.say('수송차 격파. 흩어진 현금을 챙기세요' + bonus, EVENT_INFO.convoy.color); w.fx('announce', 0, 0, 0, '수송차 격파');
  } else if (ev.kind === 'delivery') {
    const tb = Math.round(ev.t * 2), amt = pay(ev.pay + tb); cash(amt, 35);
    w.say(`배달 완료 +$${amt} (시간 보너스 $${tb})${bonus}`, EVENT_INFO.delivery.color); w.fx('announce', 0, 0, 0, `배달 완료 +$${amt}`);
  } else if (ev.kind === 'bounty') {
    const quick = quickEventBonus(ev.t, ev.total), amt = pay(ev.pay + quick); cash(amt, 70); w.spawnLoot(w.rng() < 0.5 ? 'armor' : 'medkit', ev.x, ev.y, 50);
    for (const id of ev.ids.slice(1)) removeActor(w, id);
    w.say(`현상금 사냥 성공 +$${amt} (신속 보너스 $${quick})${bonus}`, EVENT_INFO.bounty.color); w.fx('announce', 0, 0, 0, `현상금 +$${amt}`);
  } else {
    const amt = pay(350); cash(amt, 40); w.spawnLoot('armor', ev.x + 30, ev.y, 40);
    for (const id of ev.ids) { const a = w.byId.get(id); if (a) { a.order = { type: 'wander', x: a.x, y: a.y }; a.fleeT = 0; } }
    w.say(`생존자 구조 완료 +$${amt}${bonus}`, EVENT_INFO.rescue.color); w.fx('announce', 0, 0, 0, `구조 완료 +$${amt}`);
  }
  while (w.sideClaimed < SIDE_MILESTONES.length && w.eventsDone >= SIDE_MILESTONES[w.sideClaimed].n) {
    const ms = SIDE_MILESTONES[w.sideClaimed++]; f.cash += ms.reward; f.earned += ms.reward;
    w.say(`부업 이정표 「${ms.title}」 +$${ms.reward}`, '#ffd24a'); w.fx('quest', 0, 0, ms.reward, `부업 ${ms.n}건 · ${ms.title}`);
  }
}
