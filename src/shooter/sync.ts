// ZERO ZONE 온라인 방 동기화 — 방장(authority)이 AI·차량·차 내구도를 계산해 모두에게 보내고, 다른 참가자는 받은 상태를 부드럽게 따라갑니다.
// 사람 선수는 여전히 각자 자기 브라우저가 움직이고, 총알이 맞았는지는 맞는 쪽이 판정합니다(AI 는 방장 쪽이 맞는 쪽입니다).
// 자기장·비행기 항로·보급 상자·폭격 구역과 포탄 자리는 시드로 정해져서 모두가 같은 것을 봅니다.
// 메시지(모두 방 채널, 보낸 사람 id f 는 room.ts 가 붙입니다):
//   w  방장 → 모두, 8Hz: b AI 상태 · s AI 사격 · vv 방장이 굴리는 차 · vh 상한 차 내구도 · dd 쓰러진 AI(가끔, 놓친 소식 보충)
//   bd AI 가 쓰러짐 · la 새 전리품 · nd 수류탄 · ve 차 타기 요청 · vg 허락 · vn 거절 · vx 내린 차를 방장에게 넘김 · vd 운전 중 부딪혀 상한 양
import { PARTS, WEAPONS, type Attachments, type PartId, type PartSlot, type WeaponId } from './config';
import type { Cause, Match, MatchEvent, Player, Vehicle } from './sim';
import type { Loot, LootKind } from './world';
import type { NetMsg } from '../net/types';

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
export const CAUSES: Cause[] = [...WEAPON_IDS, 'zone', 'grenade', 'vehicle', 'bomb'];
const LOOT_KINDS: LootKind[] = ['weapon', 'ammo', 'medkit', 'bandage', 'armor', 'attach', 'helmet', 'boost', 'grenade', 'smoke', 'flash'];
const SLOTS: PartSlot[] = ['sight', 'muzzle', 'grip', 'mag', 'stock'];
/** AI 한 명의 값 개수: 번호, x, z, yaw, pitch, 무기, 상태 비트, 속도 x, 속도 z, 낙하 상태, 고도, 체력 */
export const BOT_STRIDE = 12;
/** 차 한 대: 번호, x, z, yaw, 속도, 운전자+1, 움직이는 중 */
export const VEH_STRIDE = 7;
/** 사람 가까이(이 거리 안)의 AI 는 매번, 먼 AI 는 FAR_EVERY 번에 한 번 보냅니다. */
// Far bots may turn abruptly; bound extrapolation between full snapshots to about 375 ms.
const NEAR = 190, FAR_EVERY = 3;
export const WORLD_MS = 125;

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => fin(v) && Number.isInteger(v) && v >= lo && v <= hi;
const r1 = (v: number): number => Math.round(v * 10), r2 = (v: number): number => Math.round(v * 100);
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const numArr = (v: unknown, max: number): v is number[] => Array.isArray(v) && v.length <= max && v.every(fin);

export interface PuppetTarget { x: number; z: number; yaw: number; pitch: number; speed: number; /** 받은 속도(있으면 받은 뒤 지난 시간만큼 앞으로 내다봅니다) */ vx?: number; vz?: number; air: number; alt: number; hp: number; w: WeaponId; ads: boolean; crouch: boolean; reload: boolean }
export interface VehTarget { x: number; z: number; yaw: number; speed: number; at: number }

/** 선수 상태를 받은 목표로 부드럽게 옮깁니다(사람·AI 꼭두각시 공용). */
export function easePuppet(o: Player, t: PuppetTarget, dt: number): void {
  const k = Math.min(1, dt * 14);
  if (t.vx !== undefined && t.vz !== undefined) { t.x += t.vx * dt; t.z += t.vz * dt; }
  if (o.veh < 0) { const far = Math.abs(t.x - o.x) + Math.abs(t.z - o.z) > 25; o.x = far ? t.x : o.x + (t.x - o.x) * k; o.z = far ? t.z : o.z + (t.z - o.z) * k; }
  o.yaw += wrap(t.yaw - o.yaw) * k; o.pitch += (t.pitch - o.pitch) * k;
  o.air = (t.air | 0) as Player['air']; o.alt = o.air ? o.alt + (t.alt - o.alt) * k : 0;
  o.hp = t.hp; o.speed = t.speed; o.ads = t.ads; o.crouch += ((t.crouch ? 1 : 0) - o.crouch) * Math.min(1, dt * 12); o.reload = t.reload ? 1 : 0;
  if (o.guns[0]?.id !== t.w) o.guns[0] = { id: t.w, mag: 1, reserve: 0, att: {} }; o.cur = 0;
}

export function encodeLoot(l: Loot): NetMsg {
  return { t: 'la', i: l.id, k: l.kind, w: l.weapon, p: l.part ?? null, l: l.level ?? 0, x: Math.round(l.x * 100) / 100, z: Math.round(l.z * 100) / 100, a: l.att ?? null };
}
export function parseLoot(m: NetMsg): Loot | null {
  if (!isInt(m.i, 0, 1e8) || !LOOT_KINDS.includes(m.k as LootKind) || !fin(m.x) || !fin(m.z) || Math.abs(m.x) > 1000 || Math.abs(m.z) > 1000) return null;
  const weapon = m.w === null ? null : WEAPON_IDS.includes(m.w as WeaponId) ? (m.w as WeaponId) : undefined; if (weapon === undefined) return null;
  const part = m.p === null || m.p === undefined ? null : Object.prototype.hasOwnProperty.call(PARTS, m.p as string) ? (m.p as PartId) : undefined; if (part === undefined) return null;
  let att: Attachments | undefined;
  if (m.a && typeof m.a === 'object') {
    att = {}; for (const [slot, id] of Object.entries(m.a as Record<string, unknown>)) {
      if (!SLOTS.includes(slot as PartSlot) || typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(PARTS, id) || PARTS[id as PartId].slot !== slot) return null;
      att[slot as PartSlot] = id as PartId;
    }
  }
  return { id: m.i, kind: m.k as LootKind, weapon, part, level: isInt(m.l, 0, 3) ? m.l : 0, x: m.x, z: m.z, taken: false, ...(att ? { att } : {}) };
}

/** 방장 쪽: 보낼 세계 상태를 모읍니다. 손님 쪽: 받은 상태를 경기에 넣고 꼭두각시를 따라가게 합니다. */
export class WorldSync {
  readonly bots = new Map<number, PuppetTarget>();
  readonly vehs = new Map<number, VehTarget>();
  private tick = 0; private lastSend = 0; private shots: number[][] = []; private parked = new Map<number, number>(); private wasMoving = new Set<number>();
  constructor(private m: Match) {}

  // ---------- 방장 ----------
  /** 이번 프레임 사건 중 AI 의 사격을 모아 둡니다(사람 가까이에서 쏜 것만). */
  collect(events: MatchEvent[], interest: Array<{ x: number; z: number }>): void {
    for (const e of events) {
      if (e.t !== 'shot' || e.remote) continue; const p = this.m.players[e.id]; if (!p?.bot) continue;
      if (!interest.some(h => Math.abs(h.x - e.ox) < 260 && Math.abs(h.z - e.oz) < 260)) continue;
      if (this.shots.length < 80) this.shots.push([e.id, WEAPON_IDS.indexOf(e.weapon), r2(e.ox), r2(e.oy), r2(e.oz), ...e.ends.map(r1)]);
    }
  }
  /** 보낼 때가 되면 세계 상태 메시지를 돌려줍니다(아니면 null). interest: 손님 선수들의 위치 */
  world(now: number, interest: Array<{ x: number; z: number }>): NetMsg | null {
    if (now - this.lastSend < WORLD_MS && now >= this.lastSend) return null; this.lastSend = now; this.tick++;
    const m = this.m, full = this.tick % FAR_EVERY === 0, b: number[] = [];
    for (const p of m.players) {
      if (!p.bot || !p.alive) continue;
      if (!full && !interest.some(h => Math.abs(h.x - p.x) < NEAR && Math.abs(h.z - p.z) < NEAR)) continue;
      const g = p.guns[p.cur];
      b.push(p.id, r1(p.x), r1(p.z), r2(wrap(p.yaw)), r2(p.pitch), Math.max(0, WEAPON_IDS.indexOf(g?.id ?? 'pistol')), (p.ads ? 1 : 0) | (p.crouch > 0.5 ? 2 : 0) | (p.reload > 0 ? 4 : 0), r1(p.vx), r1(p.vz), p.air, Math.round(p.alt), Math.ceil(p.hp));
    }
    const vv: number[] = [], vh: number[] = [];
    for (const v of m.vehicles) {
      if (v.wreck) { this.wasMoving.delete(v.id); continue; }
      if (v.hp < v.max) vh.push(v.id, Math.max(0, Math.round(v.hp)), v.lastBy + 1);
      if (v.remote) { this.wasMoving.delete(v.id); continue; }
      if (v.moving) this.wasMoving.add(v.id); else if (this.wasMoving.delete(v.id)) this.parked.set(v.id, 5);
      const left = this.parked.get(v.id) ?? 0;
      if (!v.moving && left <= 0) continue; if (!v.moving) this.parked.set(v.id, left - 1);
      vv.push(v.id, r1(v.x), r1(v.z), r2(wrap(v.yaw)), r1(v.speed), v.driver + 1, v.moving ? 1 : 0);
    }
    for (const v of m.vehicles) if (v.wreck) vh.push(v.id, 0, v.lastBy + 1);
    const msg: NetMsg = { t: 'w', b, vv, vh, s: this.shots };
    if (full) { const dd: number[] = []; for (const p of m.players) if (p.bot && !p.alive) dd.push(p.id, p.killedBy, Math.max(0, CAUSES.indexOf(p.killedWeapon ?? 'zone'))); msg.dd = dd; }
    this.shots = [];
    return msg;
  }

  // ---------- 손님 ----------
  /** 방장이 보낸 세계 상태를 넣습니다. me: 이 브라우저의 선수(자기 차는 건드리지 않습니다) */
  apply(msg: NetMsg, now: number): void {
    const m = this.m, n = m.players.length;
    if (numArr(msg.b, BOT_STRIDE * 200) && msg.b.length % BOT_STRIDE === 0) {
      const b = msg.b;
      for (let i = 0; i < b.length; i += BOT_STRIDE) {
        const id = b[i], p = m.players[id]; if (!isInt(id, 0, n - 1) || !p?.bot || !p.remote || !p.alive) continue;
        const w = WEAPON_IDS[b[i + 5]] ?? 'pistol', f = b[i + 6], had = this.bots.has(id);
        const t: PuppetTarget = { x: b[i + 1] / 10, z: b[i + 2] / 10, yaw: b[i + 3] / 100, pitch: b[i + 4] / 100, w, ads: (f & 1) !== 0, crouch: (f & 2) !== 0, reload: (f & 4) !== 0, vx: Math.max(-90, Math.min(90, b[i + 7] / 10)), vz: Math.max(-90, Math.min(90, b[i + 8] / 10)), speed: 0, air: isInt(b[i + 9], 0, 3) ? b[i + 9] : 0, alt: Math.max(0, b[i + 10]), hp: Math.max(0, b[i + 11]) };
        t.speed = Math.hypot(t.vx!, t.vz!); if (t.air === 1) t.vx = t.vz = 0;
        this.bots.set(id, t); if (!had) { p.x = t.x; p.z = t.z; p.yaw = t.yaw; p.alt = t.alt; }
      }
    }
    if (numArr(msg.vv, VEH_STRIDE * 300) && msg.vv.length % VEH_STRIDE === 0) {
      const a = msg.vv;
      for (let i = 0; i < a.length; i += VEH_STRIDE) { const v = m.vehicles[a[i]]; if (v) this.vehicleState(v, a[i + 1] / 10, a[i + 2] / 10, a[i + 3] / 100, a[i + 4] / 10, a[i + 5] - 1, a[i + 6] === 1, now); }
    }
    if (numArr(msg.vh, 3 * 300) && msg.vh.length % 3 === 0) {
      const a = msg.vh;
      for (let i = 0; i < a.length; i += 3) { const v = m.vehicles[a[i]]; if (!v || v.wreck) continue; v.hp = Math.min(v.max, Math.max(0, a[i + 1])); const by = isInt(a[i + 2] - 1, -1, n - 1) ? a[i + 2] - 1 : -1; if (by >= 0) v.lastBy = by; if (v.hp <= 0) m.explodeVehicle(v, by); }
    }
    if (Array.isArray(msg.s)) for (const s of msg.s.slice(0, 80)) this.shot(s);
    if (numArr(msg.dd, 3 * 200) && msg.dd.length % 3 === 0) for (let i = 0; i < msg.dd.length; i += 3) this.botDead(msg.dd[i], msg.dd[i + 1], msg.dd[i + 2]);
  }
  private shot(s: unknown): void {
    const m = this.m; if (!numArr(s, 5 + 27) || s.length < 8 || (s.length - 5) % 3 !== 0) return;
    const p = m.players[s[0]], w = WEAPON_IDS[s[1]]; if (!isInt(s[0], 0, m.players.length - 1) || !p?.remote || !p.alive || !w) return;
    const ox = s[2] / 100, oy = s[3] / 100, oz = s[4] / 100, aims: Array<[number, number]> = [];
    for (let i = 5; i + 2 < s.length; i += 3) { const dx = s[i] / 10 - ox, dy = s[i + 1] / 10 - oy, dz = s[i + 2] / 10 - oz; aims.push([Math.atan2(dz, dx), Math.atan2(dy, Math.hypot(dx, dz))]); }
    p.muzzle = 0.06; p.kick = Math.min(1, p.kick + 0.3); m.remoteShot(p.id, w, ox, oy, oz, aims);
  }
  /** AI 가 쓰러졌다는 소식(방장이 판정). */
  botDead(id: unknown, killer: unknown, cause: unknown): void {
    const m = this.m, p = isInt(id, 0, m.players.length - 1) ? m.players[id] : null; if (!p?.bot || !p.remote || !p.alive) return;
    const k = isInt(killer, -1, m.players.length - 1) ? killer : -1, c = CAUSES[isInt(cause, 0, CAUSES.length - 1) ? cause : 0];
    const t = this.bots.get(p.id); if (t) { p.x = t.x; p.z = t.z; } this.bots.delete(p.id); m.kill(p, k, c);
  }
  /** 다른 브라우저가 굴리는 차의 상태(방장의 vv, 운전자의 vs, 내린 차의 vx). */
  vehicleState(v: Vehicle, x: number, z: number, yaw: number, speed: number, driver: number, moving: boolean, now: number): void {
    const m = this.m; if (!v.remote || v.wreck || !fin(x) || !fin(z) || !fin(yaw) || !fin(speed) || Math.abs(x) > 1000 || Math.abs(z) > 1000) return;
    if (moving) {
      if (!v.moving) { v.moving = true; m.parkBox(v, false); }
      if (!this.vehs.has(v.id)) { v.x = x; v.z = z; v.yaw = yaw; }
      this.vehs.set(v.id, { x, z, yaw, speed: Math.max(-40, Math.min(40, speed)), at: now });
    } else {
      this.vehs.delete(v.id); v.x = x; v.z = z; v.yaw = yaw; v.speed = 0;
      if (v.moving) { v.moving = false; m.parkBox(v, true); }
    }
    const d = isInt(driver, -1, m.players.length - 1) ? driver : -1;
    if (d !== v.driver) {
      const old = m.players[v.driver]; if (old?.remote && old.veh === v.id) old.veh = -1;
      const nu = m.players[d]; if (d >= 0 && nu?.remote) { v.driver = d; nu.veh = v.id; } else if (d < 0 && (!old || old.remote)) v.driver = -1;
    }
  }
  /** 꼭두각시 AI·차를 목표로 옮깁니다(매 시뮬레이션 단계 전에). */
  step(dt: number): void {
    const m = this.m;
    for (const [id, t] of this.bots) { const p = m.players[id]; if (!p?.alive || !p.remote) { this.bots.delete(id); continue; } easePuppet(p, t, dt); }
    const k = Math.min(1, dt * 12);
    for (const [id, t] of this.vehs) {
      const v = m.vehicles[id]; if (!v || v.wreck || !v.remote) { this.vehs.delete(id); continue; }
      // 받은 뒤 지난 시간만큼 앞으로 내다보고(속도 × 방향) 그 자리로 따라갑니다.
      t.x += Math.cos(t.yaw) * t.speed * dt; t.z += Math.sin(t.yaw) * t.speed * dt;
      const far = Math.abs(t.x - v.x) + Math.abs(t.z - v.z) > 20;
      v.x = far ? t.x : v.x + (t.x - v.x) * k; v.z = far ? t.z : v.z + (t.z - v.z) * k; v.yaw += wrap(t.yaw - v.yaw) * k; v.speed = t.speed;
    }
  }
  /** 마지막 소식이 오래된 꼭두각시 차(운전자가 사라짐 등). */
  staleVehicles(now: number, ms: number): Vehicle[] { const out: Vehicle[] = []; for (const [id, t] of this.vehs) if (now - t.at > ms) { const v = this.m.vehicles[id]; if (v) out.push(v); } return out; }
}
