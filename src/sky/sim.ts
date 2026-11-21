// SKY WAR — 공중전 시뮬레이션(렌더링과 무관한 순수 로직). 아케이드 비행 모델 + 웨이브 AI.
import * as THREE from 'three';

export const WORLD_R = 3200;        // 이 반경 밖에서는 경고 후 기수를 안쪽으로 돌립니다
export const SEA_Y = 0;
export const MIN_SPEED = 70, MAX_SPEED = 230, CRUISE = 140;
export const GUN_RANGE = 650, GUN_DMG = 7, MISSILE_DMG = 55;
export const LOCK_CONE = Math.cos(THREE.MathUtils.degToRad(16)), LOCK_RANGE = 1700, LOCK_TIME = 0.9;

/** 섬 높이 함수 — 보기 좋은 군도. 충돌 판정과 지형 메시가 같은 함수를 씁니다. */
const ISLANDS = [
  { x: -700, z: -900, r: 520, h: 300 }, { x: 1200, z: 300, r: 640, h: 380 }, { x: -1500, z: 900, r: 420, h: 220 },
  { x: 300, z: 1700, r: 560, h: 330 }, { x: 2000, z: -1500, r: 480, h: 260 }, { x: -2100, z: -1700, r: 600, h: 350 }, { x: 100, z: -200, r: 260, h: 120 },
];
export function terrainY(x: number, z: number): number {
  let h = 0;
  for (const i of ISLANDS) { const d = Math.hypot(x - i.x, z - i.z) / i.r; if (d < 1) { const k = 1 - d * d; h = Math.max(h, i.h * k * k * (0.8 + 0.2 * Math.sin(x * 0.011) * Math.cos(z * 0.013))); } }
  return h;
}

export type Team = 'player' | 'enemy';
export type Kind = 'fighter' | 'bomber' | 'ace' | 'boss';
export interface Jet {
  id: number; team: Team; kind: Kind;
  pos: THREE.Vector3; q: THREE.Quaternion; yaw: number; pitch: number; speed: number; roll: number; // roll = 시각용 기체 기울기(rad)
  hp: number; maxHp: number; alive: boolean; throttle: number; g: number;
  gunCd: number; missileCd: number; missiles: number; heat: number;
  lockId: number; lockT: number; flare: number; fuel: number; boosting: boolean;
  // AI 상태
  think: number; strafe: number; skill: number; aimJitter: number; evade: number; bailT: number;
}
export interface Missile { id: number; owner: number; team: Team; pos: THREE.Vector3; vel: THREE.Vector3; target: number; life: number; alive: boolean; nearPlayer?: boolean; dodged?: boolean; }
export interface Bullet { pos: THREE.Vector3; vel: THREE.Vector3; life: number; team: Team; owner: number; alive: boolean; }
export type SimEvent =
  | { t: 'gun'; id: number } | { t: 'missile'; id: number } | { t: 'boom'; pos: THREE.Vector3; big: boolean }
  | { t: 'hit'; id: number; pos: THREE.Vector3 } | { t: 'kill'; by: number; id: number; points?: number; combo?: number } | { t: 'lock'; id: number } | { t: 'lockdone' }
  | { t: 'warn' } | { t: 'stall' } | { t: 'wave'; n: number; modifier?: string } | { t: 'crash'; id: number } | { t: 'flare'; id: number } | { t: 'pickup'; kind: 'repair' | 'ammo' | 'shield' } | { t: 'boss' } | { t: 'dodge'; points: number } | { t: 'overdrive' };

export interface Input { pitch: number; roll: number; yaw?: number; throttle: number; fire: boolean; missile: boolean; flare: boolean; boost?: boolean; }
export interface Pickup { id: number; kind: 'repair' | 'ammo' | 'shield'; pos: THREE.Vector3; life: number; } // pitch/roll -1..1

export interface Difficulty { id: 'easy' | 'normal' | 'hard'; name: string; enemyHp: number; skill: number; count: number; }
export const DIFFS: Difficulty[] = [
  { id: 'easy', name: '신병', enemyHp: 0.8, skill: 0.55, count: 0.8 },
  { id: 'normal', name: '에이스', enemyHp: 1, skill: 0.8, count: 1 },
  { id: 'hard', name: '전설', enemyHp: 1.3, skill: 1.1, count: 1.25 },
];

const FWD = new THREE.Vector3(0, 0, -1);
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), eul = new THREE.Euler();

export function forward(j: { q: THREE.Quaternion }, out = new THREE.Vector3()): THREE.Vector3 { return out.copy(FWD).applyQuaternion(j.q); }

export class SkySim {
  jets: Jet[] = []; pickups: Pickup[] = []; missiles: Missile[] = []; bullets: Bullet[] = []; events: SimEvent[] = [];
  player!: Jet; wave = 0; score = 0; kills = 0; time = 0; over = false; waveDelay = 0; combo = 0; comboT = 0;
  bestCombo = 0; shots = 0; hits = 0; shield = 0; overdrive = 0; warnT = 0; private nid = 1; spawnQueue = 0; intermission = 2;
  constructor(public diff: Difficulty) { this.reset(); }

  reset(): void {
    this.jets = []; this.pickups = []; this.missiles = []; this.bullets = []; this.events = []; this.wave = 0; this.score = 0; this.kills = 0; this.time = 0; this.over = false; this.intermission = 2; this.combo = 0; this.comboT = 0; this.bestCombo = 0; this.shots = 0; this.hits = 0; this.shield = 0; this.overdrive = 0; this.missileRegen = 0; this.stallWarnT = 0; this.afterburner = 0;
    const p = this.makeJet('player', 'fighter', new THREE.Vector3(0, 700, 2200), 1); p.q.identity(); p.speed = CRUISE; p.missiles = 6; p.hp = p.maxHp = 100;
    this.player = p;
  }

  makeJet(team: Team, kind: Kind, pos: THREE.Vector3, skill: number): Jet {
    const hp = team === 'player' ? 100 : (kind === 'boss' ? 520 : kind === 'bomber' ? 130 : kind === 'ace' ? 90 : 48) * this.diff.enemyHp;
    const j: Jet = { id: this.nid++, team, kind, pos, q: new THREE.Quaternion(), yaw: 0, pitch: 0, speed: kind === 'bomber' || kind === 'boss' ? 105 : CRUISE, roll: 0, hp, maxHp: hp, alive: true, throttle: 0.5, g: 1,
      gunCd: 0, missileCd: rnd(9, 15), missiles: kind === 'boss' ? 6 : kind === 'ace' ? 3 : kind === 'fighter' ? 1 : 0, heat: 0, lockId: 0, lockT: 0, flare: 0, fuel: 1, boosting: false,
      think: 0, strafe: rnd(0, 6), skill, aimJitter: rnd(0.6, 1.4), evade: 0, bailT: 0 };
    this.jets.push(j); return j;
  }
  get(id: number): Jet | undefined { return this.jets.find(j => j.id === id && j.alive); }
  enemies(): Jet[] { return this.jets.filter(j => j.alive && j.team === 'enemy'); }

  private startWave(): void {
    this.wave++; const modifier = this.wave % 5 === 0 ? '' : this.wave % 3 === 0 ? '폭격기 편대' : this.wave % 3 === 1 && this.wave > 1 ? '에이스 편대' : ''; this.events.push({ t: 'wave', n: this.wave, modifier });
    const n = Math.min(10, Math.round((1 + this.wave * 1.3) * this.diff.count));
    const p = this.player.pos;
    if (this.wave % 5 === 0) { this.events.push({ t: 'boss' }); const a = rnd(0, Math.PI * 2); const bp = new THREE.Vector3(p.x + Math.cos(a) * 2200, 900, p.z + Math.sin(a) * 2200); const bj = this.makeJet('enemy', 'boss', bp, this.diff.skill); const dd = p.clone().sub(bp).normalize(); bj.yaw = Math.atan2(-dd.x, -dd.z); bj.q.setFromEuler(eul.set(0, bj.yaw, 0, 'YXZ')); }
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), d = rnd(1500, 2300);
      const pos = new THREE.Vector3(p.x + Math.cos(a) * d, rnd(450, 1100), p.z + Math.sin(a) * d);
      const roll = Math.random();
      const kind: Kind = modifier === '에이스 편대' ? (roll < Math.min(0.6, 0.25 + this.wave * 0.04) ? 'ace' : 'fighter') : modifier === '폭격기 편대' ? (roll < 0.65 ? 'bomber' : 'fighter') : this.wave >= 3 && roll < 0.18 ? 'ace' : this.wave >= 2 && roll < 0.35 ? 'bomber' : 'fighter';
      const e = this.makeJet('enemy', kind, pos, this.diff.skill * (kind === 'ace' ? 1.25 : 1) * rnd(0.85, 1.1));
      { const dd = p.clone().sub(pos).normalize(); e.yaw = Math.atan2(-dd.x, -dd.z); e.pitch = 0; e.q.setFromEuler(eul.set(0, e.yaw, 0, 'YXZ')); }
    }
  }

  /** 플레이어에게 가장 정면에 가까운 적(조준 보조·락온 대상). */
  bestTarget(from: Jet, cone = LOCK_CONE, range = LOCK_RANGE): Jet | null {
    const f = forward(from, tmpV); let best: Jet | null = null, bd = -2;
    for (const e of this.jets) {
      if (!e.alive || e.team === from.team) continue;
      const to = tmpV2.copy(e.pos).sub(from.pos); const d = to.length(); if (d > range || d < 20) continue; to.divideScalar(d);
      const dot = f.dot(to); if (dot < cone) continue;
      const score = dot - d / (range * 8); if (score > bd) { bd = score; best = e; }
    }
    return best;
  }

  /** 적의 정확한 추적 조준점(총알 리드). */
  leadPoint(from: Jet, target: Jet, speed: number, out: THREE.Vector3): THREE.Vector3 {
    const d = from.pos.distanceTo(target.pos), t = d / speed;
    return out.copy(target.pos).addScaledVector(forward(target, tmpV2), target.speed * t);
  }

  step(dt: number, input: Input): void {
    if (this.over) { this.events.length = 0; }
    this.time += dt; this.overdrive = Math.max(0, this.overdrive - dt);
    const p = this.player;
    if (p.alive) this.stepPlayer(p, input, dt);
    for (const j of this.jets) if (j.alive && j.team === 'enemy') this.stepAI(j, dt);
    this.stepMissiles(dt); this.stepBullets(dt); this.stepPickups(dt);
    for (const j of this.jets) if (j.alive) this.collideTerrain(j);
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    // 웨이브 관리
    if (!this.over && this.enemies().length === 0) { this.intermission -= dt; if (this.intermission <= 0) { this.startWave(); this.intermission = 4; if (p.alive) { p.hp = Math.min(p.maxHp, p.hp + 20); p.missiles = Math.min(8, p.missiles + 2); } } }
    // 미사일 경고
    this.warnT -= dt; let warn = false;
    for (const m of this.missiles) if (m.alive && m.target === p.id) warn = true;
    if (warn && this.warnT <= 0 && p.alive) { this.events.push({ t: 'warn' }); this.warnT = 0.7; }
    this.jets = this.jets.filter(j => j.alive || j.id === p.id);
    if (!p.alive && !this.over) this.over = true;
  }

  private stepPlayer(p: Jet, inp: Input, dt: number): void {
    const throttleTarget = THREE.MathUtils.clamp(inp.throttle, 0, 1);
    p.throttle += (throttleTarget - p.throttle) * (1 - Math.exp(-dt * 4));
    p.boosting = !!inp.boost && p.fuel > 0.02; p.fuel = THREE.MathUtils.clamp(p.fuel + (p.boosting ? -0.22 : 0.08) * dt, 0, 1);
    this.afterburner += ((p.boosting ? 1 : 0) - this.afterburner) * (1 - Math.exp(-dt * 3));
    this.flyJet(p, inp.pitch, inp.roll, p.throttle, dt, inp.yaw ?? 0);
    this.stallWarnT -= dt;
    if (p.speed < MIN_SPEED * 0.9 && this.stallWarnT <= 0) { this.events.push({ t: 'stall' }); this.stallWarnT = 1; }
    // 기관포
    p.gunCd -= dt; p.heat = Math.max(0, p.heat - dt * (p.heat > 1 ? 0.35 : 0.55));
    if (inp.fire && p.gunCd <= 0 && p.heat < 1.2) { this.fireGun(p, 0.012); p.gunCd = this.overdrive > 0 ? 0.04 : 0.065; p.heat += this.overdrive > 0 ? 0.015 : 0.03; if (p.heat >= 1.2) p.gunCd = 1.2; }
    // 락온
    const t = this.bestTarget(p);
    if (t) { if (p.lockId !== t.id) { p.lockId = t.id; p.lockT = 0; this.events.push({ t: 'lock', id: t.id }); } else if (p.lockT < LOCK_TIME) { p.lockT += dt; if (p.lockT >= LOCK_TIME) this.events.push({ t: 'lockdone' }); } }
    else { p.lockId = 0; p.lockT = 0; }
    p.missileCd -= dt;
    if (inp.missile && p.missileCd <= 0 && p.missiles > 0) {
      const locked = p.lockT >= LOCK_TIME ? this.get(p.lockId) : undefined;
      this.fireMissile(p, locked ? locked.id : 0); p.missiles--; p.missileCd = 0.8; p.lockT = locked ? 0 : p.lockT;
    }
    p.flare -= dt;
    if (inp.flare && p.flare <= 0) { p.flare = 4; this.events.push({ t: 'flare', id: p.id }); for (const m of this.missiles) if (m.alive && m.target === p.id && Math.random() < 0.75) m.target = 0; }
    // 미사일 자연 보충
    if (p.missiles < 6) { p.missileCd = Math.max(p.missileCd, 0); this.missileRegen += dt; if (this.missileRegen > 14) { this.missileRegen = 0; p.missiles++; } }
  }
  private missileRegen = 0; private edging = false; private stallWarnT = 0; private afterburner = 0;

  /** 공용 비행 모델: 뱅크(기울기)가 선회를 만들고, 피치는 기수 상하. 입력 -1..1 */
  flyJet(j: Jet, pitchIn: number, rollIn: number, throttle: number, dt: number, yawIn = 0): void {
    const heavy = j.kind === 'bomber' || j.kind === 'boss';
    const targetSpeed = THREE.MathUtils.lerp(MIN_SPEED, MAX_SPEED, throttle) * (heavy ? 0.7 : 1) * (j.team === 'player' ? 1 + 0.3 * this.afterburner : j.boosting ? 1.3 : 1);
    j.speed += (targetSpeed - Math.sin(j.pitch) * 90 - j.speed) * Math.min(1, dt * 0.9); // 오르면 느려지고 내리면 빨라짐
    j.speed = THREE.MathUtils.clamp(j.speed, MIN_SPEED * 0.8, MAX_SPEED * 1.45);
    const agile = j.kind === 'boss' ? 0.4 : j.kind === 'bomber' ? 0.55 : 1;
    const rate = (1.0 + (1 - (j.speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 0.4) * agile;
    const player = j.team === 'player';
    const authority = player ? THREE.MathUtils.clamp((j.speed - MIN_SPEED * 0.6) / (MIN_SPEED * 0.3), 0.55, 1) : 1;
    const rudder = player ? THREE.MathUtils.clamp(yawIn, -1, 1) : 0;
    j.roll += ((rollIn * 1.25 + rudder * 0.12) - j.roll) * Math.min(1, dt * 3.2 * authority);
    const yawRate = -Math.sin(j.roll) * rate * 1.15 * authority - rudder * 0.5 * authority;
    j.yaw += yawRate * dt;
    let pitchRate = (pitchIn * rate * 0.9 + Math.abs(Math.sin(j.roll)) * 0.18) * authority;
    if (player) {
      j.g = THREE.MathUtils.clamp(1 + Math.hypot(yawRate * Math.cos(j.pitch), pitchRate) * j.speed / 35, 0.5, 9);
      pitchRate *= 1 - Math.max(0, j.g - 6) * 0.04;
      if (j.speed < MIN_SPEED * 0.9) pitchRate -= 0.12 * (1 - authority) / 0.45;
    }
    j.pitch += pitchRate * dt;
    if (j.team === 'player' && Math.abs(rollIn) < 0.04 && Math.abs(pitchIn) < 0.04) j.pitch *= 1 - Math.min(1, dt * 0.4); // 손을 떼면 서서히 수평
    j.pitch = THREE.MathUtils.clamp(j.pitch, -1.2, 1.2);
    j.q.setFromEuler(eul.set(j.pitch, j.yaw, -j.roll, 'YXZ'));
    forward(j, tmpV); j.pos.addScaledVector(tmpV, j.speed * dt);
    if (j.team !== 'player' && !this.edging && Math.hypot(j.pos.x, j.pos.z) > WORLD_R) { this.edging = true; this.steerTo(j, tmpV2.set(0, j.pos.y, 0), dt, 1.2); this.edging = false; } // 재귀 방지
    else if (j.team === 'player') { const r = Math.hypot(j.pos.x, j.pos.z); if (r > WORLD_R * 1.12) j.pos.multiplyScalar(WORLD_R * 1.12 / r); } // 플레이어는 경계 밖으로 못 나감
  }

  /** 월드 가장자리 경고 정도(0~1) */
  edge(p: Jet): number { return THREE.MathUtils.clamp((Math.hypot(p.pos.x, p.pos.z) - WORLD_R * 0.9) / (WORLD_R * 0.25), 0, 1); }

  /** 목표 방향으로 같은 비행 모델을 조종합니다. 반환: 기수와 목표 방향의 일치도(1=정면) */
  steerTo(j: Jet, target: THREE.Vector3, dt: number, gain = 1): number {
    const d = tmpV.copy(target).sub(j.pos).normalize();
    const wantYaw = Math.atan2(-d.x, -d.z), wantPitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    let dy = wantYaw - j.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const roll = THREE.MathUtils.clamp(-dy * 2.2 * gain, -1, 1), pitch = THREE.MathUtils.clamp((wantPitch - j.pitch) * 2.5 * gain, -1, 1);
    const fwd = forward(j, tmpV2); const dot = fwd.dot(d);
    this.flyJet(j, pitch, roll, j.throttle, dt);
    return dot;
  }

  private stepAI(e: Jet, dt: number): void {
    const p = this.player; e.think -= dt; e.gunCd -= dt; e.missileCd -= dt; e.strafe -= dt; e.evade -= dt;
    const target = p.alive ? p : null;
    if (!target) { this.flyJet(e, 0, 0.3, 0.5, dt); return; }
    const to = tmpV2.copy(target.pos).sub(e.pos); const dist = to.length();
    const myFwd = forward(e, new THREE.Vector3()); const align = myFwd.dot(to.clone().divideScalar(dist || 1));
    e.throttle = e.kind === 'bomber' ? 0.4 : THREE.MathUtils.clamp(0.55 + (dist - 500) / 1500, 0.4, 1);
    // 나를 노리는 미사일 회피
    const threatened = this.missiles.some(m => m.alive && m.target === e.id && m.pos.distanceTo(e.pos) < 700);
    if (threatened && e.evade <= 0) { e.evade = rnd(0.9, 1.6); e.bailT = Math.random() < 0.5 ? 1 : -1; if (Math.random() < 0.5 * e.skill) this.missiles.forEach(m => { if (m.alive && m.target === e.id && Math.random() < 0.55) m.target = 0; }); }
    if (e.evade > 0) { this.flyJet(e, 0.7, e.bailT, 1, dt); return; }
    // 지형 회피
    const ahead = tmpV.copy(e.pos).addScaledVector(myFwd, 380);
    if (ahead.y < terrainY(ahead.x, ahead.z) + 90 || e.pos.y < 90) { this.flyJet(e, -1, 0, 0.9, dt); return; }
    if (e.kind === 'bomber' || e.kind === 'boss') {
      // 폭격기: 느린 직선 순항, 플레이어 쪽으로 선회하며 후방 기총(느린 탄)
      const a = this.steerTo(e, target.pos, dt, 0.5);
      if (a > 0.9 && dist < 700 && e.gunCd <= 0) { this.fireGun(e, 0.04 * (2 - e.skill)); e.gunCd = e.kind === 'boss' ? 0.12 : 0.35; }
      if (e.kind === 'boss' && e.missiles > 0 && e.missileCd <= 0 && a > 0.8 && dist < 1600) { if (Math.random() < 0.7) { this.fireMissile(e, p.id); e.missiles--; } e.missileCd = rnd(5, 8); }
      return;
    }
    // 전투기: 추격 → 근접하면 사선 이탈(strafe)로 오버슈트 방지
    let aim = this.leadPoint(e, target, 520, new THREE.Vector3());
    if (dist < 260 && e.strafe <= 0) { e.strafe = rnd(1.6, 3.2); e.bailT = Math.random() < 0.5 ? 1 : -1; }
    if (dist < 300 && e.strafe > 0 && e.strafe < 2) { aim = e.pos.clone().addScaledVector(myFwd, 400).add(new THREE.Vector3(0, 220, 0)); aim.x += e.bailT * 240; }
    const a = this.steerTo(e, aim, dt, 0.55 + e.skill * 0.5);
    if (align > 0.992 && dist < GUN_RANGE * 0.9 && e.gunCd <= 0) { this.fireGun(e, 0.03 * e.aimJitter * (2 - e.skill)); e.gunCd = e.kind === 'ace' ? 0.1 : 0.17; }
    if (e.missiles > 0 && e.missileCd <= 0 && a > 0.95 && dist > 500 && dist < 1500) { if (Math.random() < 0.55) { this.fireMissile(e, p.id); e.missiles--; } e.missileCd = rnd(8, 14) / e.skill; }
  }

  fireGun(j: Jet, spread: number): void {
    if (j.team === 'player') this.shots++;
    const dir = forward(j, new THREE.Vector3()); dir.x += rnd(-spread, spread); dir.y += rnd(-spread, spread); dir.z += rnd(-spread, spread); dir.normalize();
    const side = new THREE.Vector3(j.kind === 'bomber' || j.kind === 'boss' ? 0 : (Math.random() < 0.5 ? -4 : 4), -1, 0).applyQuaternion(j.q);
    this.bullets.push({ pos: j.pos.clone().add(side).addScaledVector(dir, 12), vel: dir.multiplyScalar(j.speed + 680), life: GUN_RANGE / 680, team: j.team, owner: j.id, alive: true });
    this.events.push({ t: 'gun', id: j.id });
  }
  fireMissile(j: Jet, target: number): void {
    const dir = forward(j, new THREE.Vector3());
    this.missiles.push({ id: this.nid++, owner: j.id, team: j.team, pos: j.pos.clone().addScaledVector(dir, 10).add(new THREE.Vector3(0, -3, 0)), vel: dir.multiplyScalar(j.speed + 160), target, life: 7, alive: true });
    this.events.push({ t: 'missile', id: j.id });
  }

  private stepPickups(dt: number): void {
    const p = this.player;
    for (const k of this.pickups) {
      k.life -= dt; if (!p.alive || p.pos.distanceTo(k.pos) > 55) continue;
      k.life = 0; this.events.push({ t: 'pickup', kind: k.kind });
      if (k.kind === 'repair') p.hp = Math.min(p.maxHp, p.hp + 30); else if (k.kind === 'ammo') p.missiles = Math.min(8, p.missiles + 2); else this.shield = Math.min(50, this.shield + 30);
    }
    this.pickups = this.pickups.filter(k => k.life > 0);
  }

  private stepMissiles(dt: number): void {
    for (const m of this.missiles) {
      if (!m.alive) continue; m.life -= dt;
      if (m.team === 'enemy' && this.player.alive && !m.dodged) { const d = m.pos.distanceTo(this.player.pos); if (d < 120) m.nearPlayer = true; else if (m.nearPlayer && d > 180) { m.dodged = true; this.score += 150; this.events.push({ t: 'dodge', points: 150 }); } }
      const tgt = m.target ? this.get(m.target) : undefined;
      if (tgt) {
        const want = tmpV.copy(tgt.pos).sub(m.pos); const d = want.length() || 1; want.divideScalar(d);
        const cur = tmpV2.copy(m.vel).normalize(); const sp = Math.min(m.vel.length() + 260 * dt, 520);
        const turn = Math.min(1, dt * 2.4 * (m.team === 'player' ? 1.15 : 0.8)); cur.lerp(want, turn).normalize(); m.vel.copy(cur).multiplyScalar(sp);
        if (d < 28) { this.damage(tgt, m.team === 'player' ? MISSILE_DMG : MISSILE_DMG * 0.6, m.owner, m.pos); this.events.push({ t: 'boom', pos: m.pos.clone(), big: false }); m.alive = false; continue; }
      } else m.vel.multiplyScalar(1 + dt * 0.1);
      m.pos.addScaledVector(m.vel, dt);
      if (m.life <= 0 || m.pos.y < terrainY(m.pos.x, m.pos.z) + 2 || m.pos.y < SEA_Y) { this.events.push({ t: 'boom', pos: m.pos.clone(), big: false }); m.alive = false; }
      // 우연한 근접 폭발
      else if (!tgt) for (const j of this.jets) if (j.alive && j.team !== m.team && j.pos.distanceTo(m.pos) < 20) { this.damage(j, MISSILE_DMG, m.owner, m.pos); this.events.push({ t: 'boom', pos: m.pos.clone(), big: false }); m.alive = false; break; }
    }
    this.missiles = this.missiles.filter(m => m.alive);
  }

  private stepBullets(dt: number): void {
    for (const b of this.bullets) {
      if (!b.alive) continue; b.life -= dt;
      const prev = tmpV.copy(b.pos); b.pos.addScaledVector(b.vel, dt);
      for (const j of this.jets) {
        if (!j.alive || j.team === b.team) continue;
        // 선분-구 판정(고속 탄 통과 방지)
        const r = j.kind === 'boss' ? 36 : j.kind === 'bomber' ? 22 : 13; const seg = tmpV2.copy(b.pos).sub(prev); const len2 = seg.lengthSq();
        const tt = len2 > 0 ? THREE.MathUtils.clamp(new THREE.Vector3().copy(j.pos).sub(prev).dot(seg) / len2, 0, 1) : 0;
        if (new THREE.Vector3().copy(prev).addScaledVector(seg, tt).distanceTo(j.pos) < r) { if (b.team === 'player') this.hits++; this.damage(j, b.team === 'player' ? GUN_DMG : GUN_DMG * 0.35, b.owner, b.pos); b.alive = false; break; }
      }
      if (b.life <= 0 || b.pos.y < SEA_Y) b.alive = false;
    }
    this.bullets = this.bullets.filter(b => b.alive);
  }

  damage(j: Jet, dmg: number, by: number, at: THREE.Vector3): void {
    if (!j.alive) return; if (j === this.player && this.shield > 0) { const absorbed = Math.min(this.shield, dmg); this.shield -= absorbed; dmg -= absorbed; } if (j.kind === 'boss' && j.hp < j.maxHp * 0.5) dmg *= 1.25; j.hp -= dmg; this.events.push({ t: 'hit', id: j.id, pos: at.clone() });
    if (j.hp <= 0) this.kill(j, by);
  }
  kill(j: Jet, by: number): void {
    j.alive = false; this.events.push({ t: 'boom', pos: j.pos.clone(), big: true });
    let points = 0;
    if (j.team === 'enemy' && (j.kind === 'boss' || Math.random() < 0.25)) { const drop = Math.random(); this.pickups.push({ id: this.nid++, kind: j.kind === 'boss' ? 'repair' : drop < 0.34 ? 'shield' : drop < 0.67 ? 'repair' : 'ammo', pos: j.pos.clone(), life: 25 }); }
    if (j.team === 'enemy' && by === this.player.id) {
      this.kills++; this.combo = Math.min(5, this.combo + 1); this.bestCombo = Math.max(this.bestCombo, this.combo); this.comboT = 6;
      points = Math.round((j.kind === 'boss' ? 2500 : j.kind === 'bomber' ? 300 : j.kind === 'ace' ? 500 : 200) * (1 + (this.combo - 1) * 0.25)); this.score += points;
      if (this.combo === 5 && this.overdrive <= 0) { this.overdrive = 5; this.events.push({ t: 'overdrive' }); }
    }
    this.events.push({ t: 'kill', by, id: j.id, points, combo: this.combo });
  }
  private collideTerrain(j: Jet): void {
    const h = Math.max(SEA_Y, terrainY(j.pos.x, j.pos.z)); if (j.pos.y < h + 4) { this.events.push({ t: 'crash', id: j.id }); this.kill(j, 0); }
  }
}
