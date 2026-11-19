// LAST CITY — 도시 사건: 사업·전투 사이에 끼어드는 시간제 부업(현금 수송차 습격, 조난자 구조)
import { CIV, SIZE } from './defs';
import { lanePoint, navBlocked } from './map';
import type { World } from './world';

export type CityEventKind = 'convoy' | 'rescue';
export interface CityEvent {
  kind: CityEventKind; x: number; y: number; /** 남은 시간(초) */ t: number; total: number; /** 수송차 id */ vid: number; /** 구조 진행(초) */ prog: number; ids: number[];
}
export const EVENT_INFO: Record<CityEventKind, { name: string; color: string }> = {
  convoy: { name: '현금 수송차', color: '#ffd24a' },
  rescue: { name: '조난자 구조', color: '#7dffb0' },
};
const RESCUE_TIME = 3, FIRST_AT = 70;

/** 매초 호출. 사건이 없으면 대기 시간을 줄이다 새로 시작하고, 있으면 진행을 확인합니다. */
export function updateCityEvents(w: World): void {
  if (w.opts.tutorial || w.opts.duel) return;
  const pb = w.boss(0);
  if (!w.event) {
    if (w.time < FIRST_AT || !pb) return;
    w.eventT -= 1; if (w.eventT > 0) return;
    startEvent(w, w.rng() < 0.5 ? 'convoy' : 'rescue', pb.x, pb.y);
    return;
  }
  const ev = w.event; ev.t -= 1;
  if (ev.kind === 'convoy') {
    const v = w.vehicles.find(q => q.id === ev.vid);
    if (v && v.alive && v.hp > 0) { ev.x = v.x; ev.y = v.y; }
    else { finish(w, true); return; }
  } else if (pb) {
    if (Math.hypot(pb.x - ev.x, pb.y - ev.y) < 90) ev.prog += 1; else ev.prog = Math.max(0, ev.prog - 1);
    if (ev.prog >= RESCUE_TIME) { finish(w, true); return; }
  }
  if (ev.t <= 0) finish(w, false);
}

function startEvent(w: World, kind: CityEventKind, px: number, py: number): void {
  const z = w.zone;
  for (let k = 0; k < 24; k++) {
    const p = lanePoint(w.rng), d = Math.hypot(p.x - px, p.y - py);
    if (d < 650 || d > 1500 || p.x < 80 || p.y < 80 || p.x > SIZE - 80 || p.y > SIZE - 80 || Math.hypot(p.x - z.x, p.y - z.y) > z.r - 60 || navBlocked(w.map, p.x, p.y)) continue;
    if (w.vehicles.some(v => Math.hypot(v.x - p.x, v.y - p.y) < 90)) continue;
    const ev: CityEvent = { kind, x: p.x, y: p.y, t: kind === 'convoy' ? 110 : 90, total: kind === 'convoy' ? 110 : 90, vid: 0, prog: 0, ids: [] };
    if (kind === 'convoy') {
      const v = w.spawnVehicle('truck', p.x, p.y, p.dir * Math.PI / 2); v.dir = p.dir; v.nextTurn = p.dir; v.ai = 'traffic'; v.hp = v.maxHp = 1100; v.color = '#caa02a'; ev.vid = v.id;
      const d2 = w.spawnActor('civ', CIV, p.x, p.y); d2.inVeh = v.id; v.driver = d2.id; v.f = CIV;
    } else {
      for (let i = 0; i < 3; i++) { const c = w.spawnActor('civ', CIV, p.x + (i - 1) * 22, p.y + (i % 2) * 14); c.order = { type: 'hold', x: c.x, y: c.y }; ev.ids.push(c.id); }
    }
    w.event = ev; w.say(kind === 'convoy' ? '💰 현금 수송차가 도심을 지나갑니다 — 격파하면 현금이 쏟아집니다' : '🆘 조난 신호 — 생존자에게 다가가 구조하세요', EVENT_INFO[kind].color);
    w.fx('announce', 0, 0, 0, kind === 'convoy' ? '현금 수송차 출현' : '조난 신호 감지'); return;
  }
  w.eventT = 25; // 자리를 못 찾으면 곧 다시 시도
}

function finish(w: World, ok: boolean): void {
  const ev = w.event!, f = w.factions[0]; w.event = null; w.eventT = 80 + w.rng() * 50;
  if (!ok) { w.say(`${EVENT_INFO[ev.kind].name} 놓침`, '#9aa4b2'); for (const id of ev.ids) { const a = w.byId.get(id); if (a) { a.order = { type: 'wander', x: a.x, y: a.y }; } } return; }
  w.eventsDone++;
  if (ev.kind === 'convoy') {
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; w.spawnLoot('cash', ev.x + Math.cos(a) * 46, ev.y + Math.sin(a) * 46, 160 + Math.floor(w.rng() * 120)); }
    w.spawnLoot(w.rng() < 0.5 ? 'armor' : 'medkit', ev.x, ev.y, 50);
    w.say('💰 수송차 격파! 흩어진 현금을 챙기세요', EVENT_INFO.convoy.color); w.fx('announce', 0, 0, 0, '수송차 격파');
  } else {
    f.cash += 350; f.earned += 350; w.gainXp(f, 40); w.spawnLoot('armor', ev.x + 30, ev.y, 40);
    for (const id of ev.ids) { const a = w.byId.get(id); if (a) { a.order = { type: 'wander', x: a.x, y: a.y }; a.fleeT = 0; } }
    w.say('🆘 생존자 구조 완료 +$350', EVENT_INFO.rescue.color); w.fx('announce', 0, 0, 0, '구조 완료 +$350');
  }
}
