// LAST CITY — 도시에서 발생하는 시간제 현장 작전
import { CIV, FACTION_COUNT, SIZE } from './defs';
import { lanePoint, navBlocked } from './map';
import type { Actor, World } from './world';

export type CityEventKind = 'convoy' | 'rescue' | 'delivery' | 'bounty' | 'relay';
export interface CityEvent {
  kind: CityEventKind; x: number; y: number; /** 남은 시간(초) */ t: number; total: number; /** 수송차 id */ vid: number; /** 구조 진행(초) */ prog: number; ids: number[];
  /** 배달: 0 = 물건 수령 전, 1 = 배달 중(x,y 가 목적지) */ stage: number; tx: number; ty: number; /** 배달·현상금의 기본 보수 */ pay: number;
}
export const EVENT_INFO: Record<CityEventKind, { name: string; color: string }> = {
  convoy: { name: '현금 수송차', color: '#ffd24a' },
  rescue: { name: '조난자 구조', color: '#7dffb0' },
  delivery: { name: '불법 배달', color: '#7dc8ff' },
  bounty: { name: '현상금 사냥', color: '#ff7a5c' },
  relay: { name: '전파 중계기', color: '#c6ac80' },
};
/** 부업을 몇 건 끝내면 한 번씩 받는 이정표 보너스 */
export const SIDE_MILESTONES = [{ n: 3, reward: 400, title: '첫 계약' }, { n: 6, reward: 900, title: '연속 의뢰' }, { n: 10, reward: 1800, title: '지역 평판' }] as const;
/** 연속 성공 보너스 배율 (최대 +50%) */
export const streakMult = (streak: number): number => 1 + Math.min(5, Math.max(0, streak)) * 0.1;
const KINDS: CityEventKind[] = ['convoy', 'rescue', 'delivery', 'bounty', 'relay'];
const RESCUE_TIME = 3, FIRST_AT = 70;
export const RELAY_CAPTURE_TIME = 12, RELAY_RADIUS = 105;

export function relayPresence(w: World, ev: CityEvent): { allied: boolean; contested: boolean } {
  if (ev.kind !== 'relay') return { allied: false, contested: false };
  const r2 = RELAY_RADIUS * RELAY_RADIUS;
  let soldiers = 0, commander = false, contested = false;
  for (const a of w.actors) {
    if (!a.alive || a.inVeh || a.kind === 'worker' || a.kind === 'civ') continue;
    const dx = a.x - ev.x, dy = a.y - ev.y;
    const d2 = dx * dx + dy * dy;
    if (a.f === 0 && d2 < r2) {
      if (a.kind === 'boss' && !w.inside) commander = true;
      else if (a.kind !== 'boss') soldiers++;
    } else if (w.hostile(0, a.f) && d2 < (RELAY_RADIUS + 35) ** 2) contested = true;
  }
  return { allied: commander || soldiers >= 2, contested };
}

/** 매초 호출. 사건이 없으면 대기 시간을 줄이다 새로 시작하고, 있으면 진행을 확인합니다. */
export function updateCityEvents(w: World): void {
  if (w.opts.tutorial || w.opts.duel) return;
  const pb = w.boss(0);
  if (!w.event) {
    if (w.time < FIRST_AT || !pb) return;
    w.eventT -= 1; if (w.eventT > 0) return;
    const pool = KINDS.filter(k => k !== w.lastEvent);
    startEvent(w, !w.lastEvent ? 'relay' : pool[Math.floor(w.rng() * pool.length)], pb.x, pb.y);
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
  } else if (ev.kind === 'relay') {
    const { allied, contested } = relayPresence(w, ev);
    ev.prog = allied && !contested ? ev.prog + 1 : Math.max(0, ev.prog - (contested ? 2 : 1));
    if (ev.prog >= RELAY_CAPTURE_TIME) { finish(w, true); return; }
  } else if (ev.kind === 'delivery') {
    if (pb && !w.inside && Math.hypot(pb.x - ev.x, pb.y - ev.y) < 70) {
      if (ev.stage === 0) {
        ev.stage = 1; ev.x = ev.tx; ev.y = ev.ty; ev.t = Math.max(ev.t, 80); ev.total = Math.max(ev.total, ev.t);
        w.say('물건 수령 — 지정된 목적지로 이동하세요', EVENT_INFO.delivery.color); w.fx('announce', 0, 0, 0, '물건 수령'); return;
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
  convoy: ['현금 수송차 접근 — 제압하면 현금을 확보할 수 있습니다', '현금 수송차 출현'],
  rescue: ['구조 요청 접수 — 생존자 위치를 확인하세요', '조난 신호 감지'],
  delivery: ['배달 의뢰 — 수령지에서 물건을 받은 뒤 목적지로 이동하세요', '배달 의뢰 도착'],
  bounty: ['현상금 대상 발견 — 표시된 우두머리에게 경호원 2명이 동행합니다', '현상금 사냥 개시'],
  relay: ['적이 점거한 전파 중계기 발견 — 경비를 제압하고 현장을 확보하세요', '전파 중계기 발견'],
};

export function startEvent(w: World, kind: CityEventKind, px: number, py: number): void {
  const z = w.zone, time = kind === 'convoy' ? 110 : kind === 'delivery' ? 140 : kind === 'relay' ? 130 : kind === 'bounty' ? 120 : 90;
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
    } else if (kind === 'relay') {
      const rivals = w.factions.filter(f => f.alive && f.id !== 0);
      const owner = rivals.length ? rivals[Math.floor(w.rng() * rivals.length)].id : 1;
      for (let i = 0; i < 3; i++) {
        const angle = i * Math.PI * 2 / 3, gx = p.x + Math.cos(angle) * 52, gy = p.y + Math.sin(angle) * 52;
        const x = navBlocked(w.map, gx, gy) ? p.x : gx, y = navBlocked(w.map, gx, gy) ? p.y : gy;
        const guard = w.spawnUnit('guard', owner, x, y);
        guard.order = { type: 'guard', x: guard.x, y: guard.y };
        guard.weapon = 'u_smg'; guard.maxHp = guard.hp = 135;
        ev.ids.push(guard.id);
      }
      ev.pay = 650;
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
    for (const id of ev.ids) { if (ev.kind === 'bounty' || ev.kind === 'relay') removeActor(w, id); else { const a = w.byId.get(id); if (a) a.order = { type: 'wander', x: a.x, y: a.y }; } }
    return;
  }
  w.eventsDone++; w.eventStreak++;
  const m = streakMult(w.eventStreak - 1), bonus = w.eventStreak > 1 ? ` · 연속 ${w.eventStreak}회 ×${m.toFixed(1)}` : '';
  const pay = (base: number): number => Math.round(base * m);
  const cash = (amt: number, xp: number): void => { f.cash += amt; f.earned += amt; w.gainXp(f, xp); w.fx('cash', ev.x, ev.y, amt, undefined, 0); };
  if (ev.kind === 'convoy') {
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; w.spawnLoot('cash', ev.x + Math.cos(a) * 46, ev.y + Math.sin(a) * 46, pay(160 + Math.floor(w.rng() * 120))); }
    w.spawnLoot(w.rng() < 0.5 ? 'armor' : 'medkit', ev.x, ev.y, 50);
    w.say('현금 수송차 제압 — 주변의 현금을 회수하세요' + bonus, EVENT_INFO.convoy.color); w.fx('announce', 0, 0, 0, '수송차 격파');
  } else if (ev.kind === 'delivery') {
    const tb = Math.round(ev.t * 2), amt = pay(ev.pay + tb); cash(amt, 35);
    w.say(`배달 완료 · +$${amt} (시간 보너스 $${tb})${bonus}`, EVENT_INFO.delivery.color); w.fx('announce', 0, 0, 0, `배달 완료 +$${amt}`);
  } else if (ev.kind === 'bounty') {
    const amt = pay(ev.pay); cash(amt, 70); w.spawnLoot(w.rng() < 0.5 ? 'armor' : 'medkit', ev.x, ev.y, 50);
    for (const id of ev.ids.slice(1)) removeActor(w, id);
    w.say(`현상금 목표 처리 · +${amt}${bonus}`, EVENT_INFO.bounty.color); w.fx('announce', 0, 0, 0, `현상금 +${amt}`);
  } else if (ev.kind === 'relay') {
    const amt = pay(ev.pay + Math.round(ev.t)); cash(amt, 75);
    for (const id of ev.ids) removeActor(w, id);
    const reinforcements = w.hireMercs(0, true) === '';
    w.say(`중계기 확보 · +${amt}${reinforcements ? ' · 지원 병력 3명 합류' : ''}${bonus}`, EVENT_INFO.relay.color);
    w.fx('announce', 0, 0, 0, '중계기 확보');
  } else {
    const amt = pay(350); cash(amt, 40); w.spawnLoot('armor', ev.x + 30, ev.y, 40);
    for (const id of ev.ids) { const a = w.byId.get(id); if (a) { a.order = { type: 'wander', x: a.x, y: a.y }; a.fleeT = 0; } }
    w.say(`생존자 구조 완료 · +$${amt}${bonus}`, EVENT_INFO.rescue.color); w.fx('announce', 0, 0, 0, `구조 완료 +$${amt}`);
  }
  while (w.sideClaimed < SIDE_MILESTONES.length && w.eventsDone >= SIDE_MILESTONES[w.sideClaimed].n) {
    const ms = SIDE_MILESTONES[w.sideClaimed++]; f.cash += ms.reward; f.earned += ms.reward;
    w.say(`부업 실적 「${ms.title}」 +$${ms.reward}`, '#ffd24a'); w.fx('quest', 0, 0, ms.reward, `부업 ${ms.n}건 · ${ms.title}`);
  }
}
