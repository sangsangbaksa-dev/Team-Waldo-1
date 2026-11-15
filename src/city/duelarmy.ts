// LAST CITY 1대1 결투의 병력·건설 동기화.
// 각자 자기 조직(0)의 병력과 건물을 직접 돌리고, 그 상태를 5Hz 로 상대에게 보냅니다. 상대 쪽에서는 그것이 움직이지 않는 꼭두각시(조직 1)가 됩니다.
// 피해는 맞는 쪽이 판정합니다: 내 병력·포탑이 쏜 탄도 상대에게 알려, 상대 세계에서 상대의 보스·병력·건물에 맞게 합니다.
import type { NetMsg } from '../net/types';
import { ACTORS, STRUCTS, WEAPONS, type ActorKind, type StructKind, type WeaponId } from './defs';
import { removeSolid } from './map';
import type { Actor, Structure, World } from './world';

export const ARMY_INTERVAL = 200, MAX_UNITS = 160, MAX_STRUCTS = 60, MAX_SHOTS = 60;

export type ArmyUnit = [id: number, kind: ActorKind, x: number, y: number, ang: number, hp: number, maxHp: number];
export type ArmyStruct = [id: number, kind: StructKind, x: number, y: number, hp: number, built: number, ang: number];
export type ArmyShot = [x: number, y: number, ang: number, weapon: WeaponId, mul: number];
export interface ArmyMsg { u: ArmyUnit[]; s: ArmyStruct[] | null; sh: ArmyShot[] }

/** 각도를 -π~π 로 줄여 소수 둘째 자리까지 보냅니다(누적 회전이 커져도 검증 범위를 넘지 않게). */
const norm = (a: number): number => Math.round(Math.atan2(Math.sin(a), Math.cos(a)) * 100) / 100;
const fin = (v: unknown, lo = -1e6, hi = 1e6): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const has = (o: object, k: unknown): k is string => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const unitKind = (k: unknown): k is ActorKind => has(ACTORS, k) && k !== 'boss' && k !== 'civ' && k !== 'cop' && k !== 'swat';

/** 상대가 보낸 병력·건물·사격 메시지를 검증해 걸러 냅니다(잘못된 항목은 버립니다). */
export function parseArmy(m: NetMsg): ArmyMsg | null {
  if (!Array.isArray(m.u) || (m.s != null && !Array.isArray(m.s)) || !Array.isArray(m.sh)) return null;
  const u: ArmyUnit[] = [], s: ArmyStruct[] = [], sh: ArmyShot[] = [];
  for (const r of m.u.slice(0, MAX_UNITS)) if (Array.isArray(r) && fin(r[0], 0, 1e9) && unitKind(r[1]) && fin(r[2]) && fin(r[3]) && fin(r[4], -20, 20) && fin(r[5], 0, 1e5) && fin(r[6], 1, 1e5)) u.push([r[0], r[1], r[2], r[3], r[4], r[5], r[6]]);
  const hasS = Array.isArray(m.s);
  if (hasS) for (const r of (m.s as unknown[]).slice(0, MAX_STRUCTS)) if (Array.isArray(r) && fin(r[0], 0, 1e9) && has(STRUCTS, r[1]) && fin(r[2]) && fin(r[3]) && fin(r[4], 0, 1e6) && fin(r[5], 0, 1) && fin(r[6], -20, 20)) s.push([r[0], r[1] as StructKind, r[2], r[3], r[4], r[5], r[6]]);
  for (const r of m.sh.slice(0, MAX_SHOTS)) if (Array.isArray(r) && fin(r[0]) && fin(r[1]) && fin(r[2], -20, 20) && has(WEAPONS, r[3]) && fin(r[4], 0, 10)) sh.push([r[0], r[1], r[2], r[3] as WeaponId, r[4]]);
  return { u, s: hasS ? s : null, sh };
}

interface Puppet { a: Actor; x: number; y: number; ang: number }

export class DuelArmy {
  private units = new Map<number, Puppet>(); private structs = new Map<number, Structure>(); private lastSend = 0; private n = 0;

  /** 보낼 때가 되었으면 내 병력·건물·사격을 담은 메시지를 돌려줍니다(건물은 두 번에 한 번). */
  snapshot(w: World, now: number): NetMsg | null {
    if (now - this.lastSend < ARMY_INTERVAL) return null; this.lastSend = now;
    const r = (v: number): number => Math.round(v * 10) / 10;
    const u: ArmyUnit[] = [];
    for (const a of w.actors) if (a.alive && a.f === 0 && a.kind !== 'boss' && a.kind !== 'civ' && u.length < MAX_UNITS) u.push([a.id, a.kind, r(a.x), r(a.y), norm(a.ang), Math.round(a.hp), a.maxHp]);
    let s: ArmyStruct[] | null = null;
    if (this.n++ % 2 === 0) { s = []; for (const t of w.structures) if (t.alive && t.f === 0 && t.temp <= 0 && s.length < MAX_STRUCTS) s.push([t.id, t.kind, t.x, t.y, Math.round(t.hp), Math.round(t.built * 100) / 100, norm(t.ang)]); }
    const sh = w.armyShots.splice(0, MAX_SHOTS).map(q => [Math.round(q.x), Math.round(q.y), Math.round(q.a * 1000) / 1000, q.w, Math.round(q.m * 100) / 100] as ArmyShot); w.armyShots.length = 0;
    return { t: 'a', u, ...(s ? { s } : {}), sh };
  }

  /** 상대의 병력·건물 상태를 내 세계의 꼭두각시에 반영합니다. */
  receive(w: World, army: ArmyMsg): void {
    const seen = new Set<number>();
    for (const [id, kind, x, y, ang, hp, mh] of army.u) {
      seen.add(id); let p = this.units.get(id);
      if (!p) { const a = w.spawnActor(kind, 1, x, y); a.order = { type: 'hold', x, y }; a.sup = 0; p = { a, x, y, ang }; this.units.set(id, p); }
      p.x = x; p.y = y; p.ang = ang; p.a.maxHp = mh; p.a.hp = Math.max(1, hp);
    }
    for (const [id, p] of this.units) if (!seen.has(id)) { this.units.delete(id); this.drop(w, p.a); }
    if (army.s) {
      const have = new Set<number>(), hq = w.hq(1);
      for (const [id, kind, x, y, hp, built, ang] of army.s) {
        have.add(id);
        if (kind === 'hq') { if (hq) { hq.hp = Math.max(1, hp); hq.built = 1; } continue; }
        let s = this.structs.get(id);
        if (!s) { s = w.addStructure(kind, 1, x, y, false); this.structs.set(id, s); w.fx('build', x + s.w / 2, y + s.h / 2, 0, undefined, 1); }
        s.maxHp = STRUCTS[kind].hp; s.hp = Math.max(1, hp); s.ang = ang;
        if (built >= 1 && s.built < 1) w.fx('built', s.x + s.w / 2, s.y + s.h / 2, 0, STRUCTS[kind].name, 1);
        s.built = built;
      }
      for (const [id, s] of this.structs) if (!have.has(id)) { this.structs.delete(id); if (s.alive) { s.alive = false; removeSolid(w.map, s.solid); w.fx('boom', s.x + s.w / 2, s.y + s.h / 2, Math.max(s.w, s.h)); } }
    }
    for (const [x, y, a, wid, m] of army.sh) w.remoteArmyShot(x, y, a, wid, m);
  }

  /** 꼭두각시를 받은 위치로 부드럽게 옮깁니다(걷는 동작을 위해 속도도 채웁니다). */
  step(dt: number): void {
    const k = Math.min(1, dt * 10);
    for (const { a, x, y, ang } of this.units.values()) {
      if (!a.alive) continue;
      const far = Math.hypot(x - a.x, y - a.y) > 300, nx = far ? x : a.x + (x - a.x) * k, ny = far ? y : a.y + (y - a.y) * k;
      a.vx = (nx - a.x) / Math.max(dt, 1e-3); a.vy = (ny - a.y) / Math.max(dt, 1e-3); a.x = nx; a.y = ny; a.walk += Math.hypot(a.vx, a.vy) * dt;
      let d = ang - a.ang; d -= Math.round(d / 6.2832) * 6.2832; a.ang += d * k;
    }
  }
  private drop(w: World, a: Actor): void { if (!a.alive) return; a.alive = false; w.byId.delete(a.id); w.fx(ACTORS[a.kind].mech ? 'boom' : 'death', a.x, a.y, a.r, undefined, 1); }
}
