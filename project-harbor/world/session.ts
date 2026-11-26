import { CHUNK, DEPTH, WIDTH, roadDistance } from './domain';
import { World, type ChunkView } from './application';
import {
  MAX_HEALTH, WEAPONS, addWanted, applyHit, armWeapon, cashOnDeath, createVitals, decayWanted,
  hospital, makePed, makeWeapon, nearestItem, nearestPed, pickpocket, policeShot, populationFor,
  rayHit, rob, starCount, stepActor, takeItem,
  type CrimeResult, type GroundItem, type Ped, type ShotLine, type Vitals,
} from './street';
import type { Ride } from './traffic';
import { HIJACK_RANGE, type Hijack } from './hijack';
import { CrimeLedger } from './pursuit';
import { StreetSim, type SimEvent } from './street-sim';
import { surfaceAt, type Bed, type Ear } from './civic/audio';
import { scare, seedCrowd, stepCrowd, type Stimulus } from './civic/life';

export interface RoamInput {
  forward: number;
  side: number;
  sprint: boolean;
  look: number;
  use: boolean;
  pickpocket: boolean;
  rob: boolean;
  fire: boolean;
  reload: boolean;
  throttle: number;
  steer: number;
  handbrake: boolean;
}

export const IDLE_INPUT: RoamInput = {
  forward: 0, side: 0, sprint: false, look: 0, use: false, pickpocket: false, rob: false, fire: false, reload: false,
  throttle: 0, steer: 0, handbrake: false,
};

interface Bucket { peds: Ped[]; items: GroundItem[]; refill: number }

export class FreeRoam {
  readonly world: World;
  readonly vitals: Vitals = createVitals();
  notice = '';
  readonly shots: ShotLine[] = [];
  private time = 0;
  private noticeUntil = 0;
  private rollState = 0x9e3779b9;
  private dropped = 0;
  private policeWait = 0;
  private generation = 1;
  private crimeSeq = 1;
  private stepMeter = 0;
  private readonly filed = new Set<number>();
  private alarm = 0;
  private readonly stimuli: Stimulus[] = [];
  private readonly life = new Map<string, Bucket>();
  private readonly police: Ped[] = [];
  private readonly sim = new StreetSim();
  private readonly crimes = new CrimeLedger();
  private seekingId = -1;
  private seekLeft = 0;
  private responseNoted = false;
  private militaryNoted = false;
  private heatPulse = false;
  ears: Ear[] = [];

  constructor(view: ChunkView) {
    this.world = new World(view);
    this.ensureAround(2);
    this.seedEncounter();
    this.world.stream(12);
  }

  get x() { return this.world.x; }
  get z() { return this.world.z; }
  get yaw() { return this.world.yaw; }
  set yaw(value: number) { this.world.yaw = value; }
  get peds(): Ped[] { return [...this.actorsIn(1), ...this.police]; }
  get items(): GroundItem[] { return this.itemsIn(2); }
  get rides(): readonly Ride[] { return this.sim.vehicles() as Ride[]; }
  get vehicle(): Ride | null {
    const car = this.sim.playerCar;
    return car ? this.sim.ride(car) as Ride : null;
  }
  get hijack(): Hijack | null { return this.sim.hijack; }
  get cars() { return this.sim.cars; }
  get driving() { return this.sim.driving; }
  get activePedCount() { return this.peds.length; }
  get siren(): Bed | null {
    const stars = starCount(this.vitals.wanted);
    if (stars < 2) return null;
    const car = this.sim.cars.find(entry => (entry.kind === 'police' || entry.kind === 'military') && entry.mode !== 'withdraw');
    if (car) return { x: car.x, z: car.z, urgent: stars >= 4 };
    const cop = this.police.find(ped => ped.health > 0);
    if (!cop) return null;
    return { x: cop.x, z: cop.z, urgent: stars >= 4 };
  }
  engines(): Bed[] {
    return this.sim.cars
      .filter(car => Math.hypot(car.x - this.world.x, car.z - this.world.z) < 70 && Math.abs(car.speed) > 0.4)
      .sort((a, b) => Math.hypot(a.x - this.world.x, a.z - this.world.z) - Math.hypot(b.x - this.world.x, b.z - this.world.z))
      .slice(0, 2)
      .map(car => ({ x: car.x, z: car.z, rate: 0.7 + Math.abs(car.speed) / 18 }));
  }

  tick(input: RoamInput, dt: number) {
    const step = Math.max(0, Math.min(0.05, dt));
    this.time += step;
    this.shots.length = 0;
    this.ears = [];
    this.stimuli.length = 0;
    this.alarm = Math.max(0, this.alarm - step);
    const fromX = this.world.x;
    const fromZ = this.world.z;
    if (!this.sim.driving && !this.sim.busy) {
      this.world.yaw = Math.atan2(Math.sin(this.world.yaw + input.look), Math.cos(this.world.yaw + input.look));
    }
    if (this.vitals.invulnerable > 0) this.vitals.invulnerable = Math.max(0, this.vitals.invulnerable - step);
    if (this.vitals.health <= 0) this.respawn();
    let vehicleUse = false;
    if (this.sim.driving) {
      vehicleUse = input.use;
      this.world.hours = (this.world.hours + step * 24 / 720) % 24;
    } else if (!this.sim.busy) {
      const seeking = this.sim.cars.find(car => car.id === this.seekingId) ?? null;
      if (seeking && input.forward === 0 && input.side === 0) {
        this.seekLeft = Math.max(0, this.seekLeft - step);
        const dx = seeking.x - this.world.x;
        const dz = seeking.z - this.world.z;
        const dist = Math.hypot(dx, dz) || 1;
        const glide = Math.min(dist, 12 * step);
        const previousX = this.world.x;
        const previousZ = this.world.z;
        this.glide(this.world.x + dx / dist * glide, this.world.z + dz / dist * glide);
        this.keepOut(previousX, previousZ);
        if (Math.hypot(seeking.x - this.world.x, seeking.z - this.world.z) <= HIJACK_RANGE) vehicleUse = true;
        else if (this.seekLeft === 0) {
          this.seekingId = -1;
          this.say('차로 가는 길이 막혀 있습니다.');
        }
      } else {
        if (input.forward !== 0 || input.side !== 0) this.seekingId = -1;
        const previousX = this.world.x;
        const previousZ = this.world.z;
        this.world.move(input.forward, input.side, step, input.sprint);
        this.keepOut(previousX, previousZ);
      }
      if (input.use) vehicleUse = this.approachCar() || vehicleUse;
    }
    const heatAt = this.vitals.wanted;
    const events = this.sim.step(step, {
      x: this.world.x,
      z: this.world.z,
      yaw: this.world.yaw,
      use: vehicleUse,
      throttle: input.throttle,
      steer: input.steer,
      handbrake: input.handbrake,
      stars: this.vitals.wanted,
      crimePulse: this.heatPulse,
      seen: this.pursuitSees(),
      blocked: (x, z) => !this.world.open(x, z, 0.7),
      clear: (x, z) => this.world.open(x, z, 0.45),
    });
    this.applyEvents(events);
    const left = this.sim.consumeExit();
    if (left) {
      this.world.x = left.x;
      this.world.z = left.z;
    }
    const driven = this.sim.playerCar;
    if (driven) {
      this.world.x = driven.x;
      this.world.z = driven.z;
      this.world.yaw = driven.yaw;
      this.seekingId = -1;
    }
    if (this.sim.notice) {
      this.say(this.sim.notice);
      this.sim.notice = '';
    }
    this.world.stream();
    this.ensureAround(2);
    const driving = this.sim.driving || this.sim.busy;
    if (!driving) this.interact(input);
    const weapon = this.vitals.weapon;
    const trigger = armWeapon(this.vitals, step, !this.sim.driving && input.fire, !this.sim.driving && input.reload);
    if (trigger === 'shot' && weapon && !this.sim.driving) this.fire(weapon);
    else if (trigger === 'empty' && input.fire && !this.sim.driving) this.say('쏠 총이나 탄약이 없습니다.');
    else if (trigger === 'reload' && weapon && !this.sim.driving) this.say(WEAPONS[weapon].name + ' 재장전');
    const blockedAt = (x: number, z: number) => !this.world.open(x, z, 0.45);
    const crowd = stepCrowd(this.actorsIn(1), {
      dt: step,
      hours: this.world.hours,
      playerX: this.world.x,
      playerZ: this.world.z,
      stimuli: this.stimuli,
      blocked: blockedAt,
      cars: this.sim.cars.map(car => ({ x: car.x, z: car.z, speed: Math.abs(car.speed) })),
    });
    this.ears.push(...crowd.ears);
    for (const report of crowd.reports) this.fileReport(report);
    for (const car of this.sim.cars) {
      if (Math.abs(car.speed) < 6 || car.control === 'player') continue;
      for (const ped of this.actorsIn(1)) {
        if (ped.health <= 0 || Math.hypot(ped.x - car.x, ped.z - car.z) > 3.4) continue;
        const ear = scare(ped, car.x, car.z, Math.abs(car.speed) > 8);
        if (ear) this.ears.push(ear);
      }
    }
    const moved = Math.hypot(this.world.x - fromX, this.world.z - fromZ);
    this.stepMeter += moved;
    const stride = input.sprint ? 0.42 : 0.68;
    if (moved > 0.01 && this.stepMeter >= stride) {
      this.stepMeter = 0;
      this.ears.push({
        kind: 'step', x: this.world.x, z: this.world.z, gain: input.sprint ? 0.7 : 0.45, pitch: input.sprint ? 1.15 : 1,
        surface: surfaceAt(this.world.x, this.world.z),
      });
    }
    if (input.use || input.pickpocket || input.rob || input.reload) {
      this.ears.push({ kind: 'ui', x: this.world.x, z: this.world.z, gain: 0.45, pitch: 1.05 });
    }
    const goal = this.sim.pursuit.phase === 'searching'
      ? { x: this.sim.pursuit.lastX, z: this.sim.pursuit.lastZ }
      : { x: this.world.x, z: this.world.z };
    for (const ped of this.police) stepActor(ped, step, goal.x, goal.z, blockedAt);
    this.updatePolice(step, blockedAt);
    this.reap(step);
    decayWanted(this.vitals, step);
    this.heatPulse = this.vitals.wanted > heatAt;
    if (this.vitals.health <= 0) this.respawn();
    if (this.time >= this.noticeUntil) this.notice = '';
  }

  hint(): string {
    const car = this.sim.playerCar;
    if (car) {
      const speed = Math.round(Math.abs(car.speed) * 3.6);
      return 'E · 하차 · ' + speed + ' km/h · WASD 운전 · Space 브레이크';
    }
    if (this.sim.busy) return '차량 문을 여는 중입니다';
    if (this.seekingId >= 0) return '차량으로 다가가는 중';
    const closeCar = this.sim.nearest(this.x, this.z, HIJACK_RANGE);
    const farCar = closeCar ? null : this.sim.nearest(this.x, this.z, 18);
    const item = nearestItem(this.items, this.x, this.z, 3.2);
    const ped = nearestPed(this.actorsIn(1), this.x, this.z, 3.4, true);
    const parts: string[] = [];
    if (item?.kind === 'med') parts.push('E · 치료');
    else if (item?.weapon) parts.push('E · ' + WEAPONS[item.weapon].name + ' 줍기');
    else {
      const nearby = nearestItem(this.items, this.x, this.z, 12);
      if (nearby?.kind === 'weapon') parts.push('앞에 무기가 있습니다');
      else if (nearby?.kind === 'med') parts.push('앞에 치료제가 있습니다');
    }
    if (closeCar) parts.unshift(closeCar.occupied ? 'E · 운전자를 끌어내리기' : 'E · 탑승');
    else if (farCar) parts.unshift('E · 차량으로 다가가기');
    if (ped) parts.push('F · 소매치기 · G · 강도');
    else if (nearestPed(this.actorsIn(1), this.x, this.z, 12, true)) parts.push('앞에 사람이 있습니다');
    if (this.vitals.weapon) parts.push('클릭 · 사격 · R · 재장전');
    return parts.join('   ');
  }

  placePed(x: number, z: number, extra: Partial<Ped> = {}): Ped {
    const key = Math.floor(x / CHUNK) + ':' + Math.floor(z / CHUNK);
    const ped = makePed(extra.id ?? 'placed-' + this.dropped++, x, z, { ...extra, chunk: key });
    seedCrowd([ped], this.world.hours);
    this.bucket(key).peds.push(ped);
    return ped;
  }

  placeItem(item: GroundItem) {
    const key = Math.floor(item.x / CHUNK) + ':' + Math.floor(item.z / CHUNK);
    this.bucket(key).items.push(item);
  }

  private roll(): number {
    this.rollState = (Math.imul(this.rollState, 1664525) + 1013904223) >>> 0;
    return this.rollState / 4294967296;
  }

  private say(text: string, seconds = 2.6) {
    if (this.notice === text && this.time < this.noticeUntil) return;
    this.notice = text;
    this.noticeUntil = this.time + seconds;
  }

  private bucket(key: string): Bucket {
    let life = this.life.get(key);
    if (!life) {
      life = { peds: [], items: [], refill: 20 };
      this.life.set(key, life);
    }
    return life;
  }

  private ensureAround(radius: number) {
    const cx = Math.floor(this.world.x / CHUNK);
    const cz = Math.floor(this.world.z / CHUNK);
    for (let i = cx - radius; i <= cx + radius; i++) {
      for (let j = cz - radius; j <= cz + radius; j++) {
        if (i < 0 || j < 0 || i >= WIDTH / CHUNK || j >= DEPTH / CHUNK) continue;
        const key = i + ':' + j;
        if (this.life.has(key)) continue;
        const born = populationFor(i, j);
        seedCrowd(born.peds, this.world.hours);
        this.life.set(key, { peds: born.peds, items: born.items, refill: 20 });
      }
    }
  }

  private keys(radius: number): string[] {
    const cx = Math.floor(this.world.x / CHUNK);
    const cz = Math.floor(this.world.z / CHUNK);
    const keys: string[] = [];
    for (let i = cx - radius; i <= cx + radius; i++) {
      for (let j = cz - radius; j <= cz + radius; j++) {
        if (i < 0 || j < 0 || i >= WIDTH / CHUNK || j >= DEPTH / CHUNK) continue;
        keys.push(i + ':' + j);
      }
    }
    return keys;
  }

  private actorsIn(radius: number): Ped[] {
    const list: Ped[] = [];
    for (const key of this.keys(radius)) {
      const life = this.life.get(key);
      if (life) list.push(...life.peds);
    }
    return list;
  }

  private itemsIn(radius: number): GroundItem[] {
    const list: GroundItem[] = [];
    for (const key of this.keys(radius)) {
      const life = this.life.get(key);
      if (life) list.push(...life.items);
    }
    return list;
  }

  private findOpen(x: number, z: number, radius: number, offroad = false): { x: number; z: number } | null {
    const good = (px: number, pz: number) => this.world.open(px, pz, radius) && (!offroad || roadDistance(px, pz) >= 2.5);
    if (good(x, z)) return { x, z };
    for (const ring of [4, 7, 11, 15, 20]) {
      for (let turn = 0; turn < 8; turn++) {
        const angle = turn * Math.PI / 4;
        const px = x + Math.cos(angle) * ring;
        const pz = z + Math.sin(angle) * ring;
        if (good(px, pz)) return { x: px, z: pz };
      }
    }
    return null;
  }

  private seedEncounter() {
    // Spawn faces −z, so the first gun and pedestrian sit on the sidewalk ahead.
    if (!nearestItem(this.items, this.world.x, this.world.z, 16)) {
      const spot = this.findOpen(this.world.x + 3.2, this.world.z - 8, 0.7, true)
        ?? this.findOpen(this.world.x + 3.2, this.world.z - 8, 0.7, false);
      if (spot) this.placeItem(makeWeapon('starter-pistol', spot.x, spot.z, 'pistol'));
    }
    if (!nearestPed(this.actorsIn(1), this.world.x, this.world.z, 14, true)) {
      const spot = this.findOpen(this.world.x - 1.2, this.world.z - 12, 0.7, true)
        ?? this.findOpen(this.world.x - 1.2, this.world.z - 12, 0.7, false);
      if (spot) this.placePed(spot.x, spot.z, { id: 'starter-ped', cash: 120, health: 60 });
    }
  }

  private glide(x: number, z: number) {
    const previousX = this.world.x;
    const previousZ = this.world.z;
    if (this.world.open(x, previousZ)) this.world.x = x;
    if (this.world.open(this.world.x, z)) this.world.z = z;
    this.keepOut(previousX, previousZ);
  }

  private keepOut(previousX: number, previousZ: number) {
    const blocked = (x: number, z: number) => this.sim.cars.some(car => car.control !== 'player' && car.control !== 'reserved' && Math.hypot(car.x - x, car.z - z) < car.length * 0.42 + 0.55);
    if (blocked(this.world.x, previousZ)) this.world.x = previousX;
    if (blocked(this.world.x, this.world.z)) this.world.z = previousZ;
  }

  private approachCar(): boolean {
    const close = this.sim.nearest(this.world.x, this.world.z, HIJACK_RANGE);
    if (close) {
      this.seekingId = -1;
      return true;
    }
    const item = nearestItem(this.items, this.world.x, this.world.z, 3.2);
    if (item) {
      this.collect(item);
      return false;
    }
    const far = this.sim.nearest(this.world.x, this.world.z, 18);
    if (far) {
      this.seekingId = far.id;
      this.seekLeft = 5;
      this.say('차량으로 다가갑니다.');
      return false;
    }
    this.say('주울 것이 없습니다.');
    return false;
  }

  private interact(input: RoamInput) {
    if (input.use) return;
    if (!input.rob && !input.pickpocket) return;
    const ped = nearestPed(this.actorsIn(1), this.world.x, this.world.z, 3.4, true);
    if (!ped) { this.say('가까운 사람이 없습니다.'); return; }
    const before = this.vitals.health;
    const result = input.rob ? rob(this.vitals, ped) : pickpocket(this.vitals, ped, this.roll());
    if (this.vitals.invulnerable > 0) this.vitals.health = before;
    this.sayCrime(result);
    if (result.status === 'quiet' || result.status === 'spotted' || result.status === 'robbed') {
      const seen = result.status !== 'quiet';
      this.stimuli.push({
        kind: result.status === 'robbed' ? 'rob' : 'pocket',
        x: this.world.x, z: this.world.z,
        radius: result.status === 'robbed' ? 22 : seen ? 10 : 3,
        seen, victim: ped.id, crime: seen ? ++this.crimeSeq : 0,
      });
      if (result.amount > 0) this.ears.push({ kind: 'cash', x: this.world.x, z: this.world.z, gain: 0.55, pitch: 1 });
    }
  }

  private collect(item: GroundItem) {
    const previous = this.vitals.weapon;
    const result = takeItem(this.vitals, item);
    if (result === 'full') { this.say('체력이 이미 가득 찼습니다.'); return; }
    this.removeItem(item);
    if (result === 'swap' && previous) {
      const side = this.findOpen(
        this.world.x + Math.cos(this.world.yaw) * 2.4,
        this.world.z + Math.sin(this.world.yaw) * 2.4,
        0.4,
      );
      if (side) this.placeItem(makeWeapon('drop-' + this.dropped++, side.x, side.z, previous));
    }
    if (result === 'med') this.say('체력을 회복했습니다.');
    else if (item.weapon) {
      const name = WEAPONS[item.weapon].name;
      this.say(result === 'ammo' ? name + ' 탄약을 주웠습니다.' : name + '을 주웠습니다.');
    }
  }

  private removeItem(item: GroundItem) {
    const key = Math.floor(item.x / CHUNK) + ':' + Math.floor(item.z / CHUNK);
    const life = this.life.get(key);
    if (!life) return;
    life.items = life.items.filter(entry => entry !== item);
  }

  private sayCrime(result: CrimeResult) {
    if (result.status === 'broke' || result.status === 'none') this.say('상대에게 남은 돈이 없습니다.');
    else if (result.status === 'quiet') this.say('소매치기 +$' + result.amount.toLocaleString('ko-KR'));
    else if (result.status === 'spotted') this.say('들켰습니다. 소매치기 +$' + result.amount.toLocaleString('ko-KR'));
    else this.say('강도 +$' + result.amount.toLocaleString('ko-KR'));
  }

  private fire(weapon: NonNullable<Vitals['weapon']>) {
    const spec = WEAPONS[weapon];
    const targets = [...this.actorsIn(1), ...this.police];
    const hit = rayHit(this.world.x, this.world.z, this.world.yaw, spec.range, targets);
    const dx = Math.sin(this.world.yaw);
    const dz = -Math.cos(this.world.yaw);
    const reach = hit ? hit.distance : spec.range;
    this.shots.push({ x: this.world.x, z: this.world.z, tx: this.world.x + dx * reach, tz: this.world.z + dz * reach });
    addWanted(this.vitals, hit ? (hit.ped.kind === 'police' ? 2 : 1) : 0.35);
    this.stimuli.push({
      kind: 'gun', x: this.world.x, z: this.world.z, radius: 48, seen: !!hit,
      victim: hit?.ped.id ?? '', crime: ++this.crimeSeq,
    });
    this.alarm = 1.4;
    this.ears.push({ kind: 'gun', x: this.world.x, z: this.world.z, gain: 1, pitch: weapon === 'smg' ? 1.2 : 0.9 });
    if (!hit) return;
    const killed = applyHit(hit.ped, spec.damage);
    if (killed && hit.ped.kind === 'police') this.say('경찰을 쓰러뜨렸습니다. 수배가 올랐습니다.');
  }

  private fileReport(report: { pedId: string; crime: number }) {
    if (report.crime <= 0 || this.filed.has(report.crime)) return;
    this.filed.add(report.crime);
    if (this.filed.size > 24) {
      const oldest = this.filed.values().next().value;
      if (oldest !== undefined) this.filed.delete(oldest);
    }
    this.vitals.calm = 0;
    if (this.vitals.wanted <= 0) addWanted(this.vitals, 1);
    this.say('목격자가 경찰에 신고했습니다.');
    this.ears.push({ kind: 'phone', x: this.world.x, z: this.world.z, gain: 0.4, pitch: 1 });
  }

  private updatePolice(step: number, blockedAt: (x: number, z: number) => boolean) {
    const order = this.sim.command;
    const alive = () => this.police.filter(ped => ped.health > 0);
    const target = order.withdraw ? 0 : order.allowSpawn ? order.foot : alive().length;
    for (let i = this.police.length - 1; i >= 0; i--) {
      const ped = this.police[i];
      if (!ped) continue;
      if (ped.health <= 0) {
        ped.down += step;
        if (ped.down > 3) this.police.splice(i, 1);
      }
    }
    while (alive().length > target) {
      const index = this.police.findIndex(ped => ped.health > 0);
      if (index < 0) break;
      this.police.splice(index, 1);
    }
    this.policeWait = Math.max(0, this.policeWait - step);
    if (alive().length < target && this.policeWait === 0) {
      this.spawnPolice();
      this.policeWait = 1.2;
    }
    if (this.vitals.invulnerable > 0) return;
    for (const ped of this.police) {
      if (ped.health <= 0) continue;
      const damage = policeShot(ped, this.world.x, this.world.z, step);
      if (damage <= 0) continue;
      const midX = (ped.x + this.world.x) / 2;
      const midZ = (ped.z + this.world.z) / 2;
      if (blockedAt(midX, midZ)) continue;
      this.vitals.health = Math.max(0, this.vitals.health - damage);
      this.shots.push({ x: ped.x, z: ped.z, tx: this.world.x, tz: this.world.z });
      this.say('총에 맞았습니다.');
    }
  }

  private applyEvents(events: readonly SimEvent[]) {
    for (const event of events) {
      if (event.amount > 0 && this.crimes.claim(event.id)) addWanted(this.vitals, event.amount);
      if (event.type !== 'driver') continue;
      this.placePed(event.x, event.z, {
        id: 'driver-' + event.id, state: 'flee', cash: 20, health: 50, yaw: event.yaw,
      });
      for (const ped of this.actorsIn(1)) {
        if (ped.kind === 'civilian' && ped.health > 0 && Math.hypot(ped.x - event.x, ped.z - event.z) < 16) ped.state = 'flee';
      }
      this.stimuli.push({
        kind: 'rob', x: event.x, z: event.z, radius: 18, seen: true, victim: 'driver-' + event.id, crime: ++this.crimeSeq,
      });
      this.alarm = Math.max(this.alarm, 1.4);
    }
    const phase = this.sim.pursuit.phase;
    if (phase === 'clear' || phase === 'cooldown') {
      if (this.responseNoted && phase === 'cooldown') this.say('추격을 벗어났습니다.');
      this.responseNoted = false;
      this.militaryNoted = false;
      return;
    }
    if (!this.responseNoted && (phase === 'engaged' || phase === 'searching')) {
      this.responseNoted = true;
      this.say('경찰이 추격합니다.');
    }
    if (this.sim.cars.some(car => car.kind === 'military' && car.mode !== 'withdraw') && !this.militaryNoted) {
      this.militaryNoted = true;
      this.say('군대가 출동했습니다.');
    }
  }

  private pursuitSees(): boolean {
    const sight = this.sim.sight;
    if (sight <= 0) return false;
    const near = (x: number, z: number) => Math.hypot(x - this.world.x, z - this.world.z) < sight && this.lineOpen(x, z);
    if (this.police.some(ped => ped.health > 0 && near(ped.x, ped.z))) return true;
    return this.sim.cars.some(car => (car.kind === 'police' || car.kind === 'military') && car.health > 0 && near(car.x, car.z));
  }

  private lineOpen(x: number, z: number): boolean {
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      if (!this.world.open(x + (this.world.x - x) * t, z + (this.world.z - z) * t, 0.25)) return false;
    }
    return true;
  }

  private spawnPolice() {
    const yaw = this.world.yaw;
    const behindX = this.world.x - Math.sin(yaw) * 16;
    const behindZ = this.world.z + Math.cos(yaw) * 16;
    const spot = this.findOpen(behindX, behindZ, 0.6) ?? this.findOpen(this.world.x + 14, this.world.z, 0.6);
    if (!spot) return;
    this.police.push(makePed('police-' + this.dropped++, spot.x, spot.z, {
      kind: 'police', state: 'chase', health: 80, cash: 0, attack: 0.8, chunk: 'police',
    }));
  }

  private reap(step: number) {
    const near = new Set(this.keys(1));
    for (const [key, life] of this.life) {
      if (!near.has(key)) continue;
      for (let i = life.peds.length - 1; i >= 0; i--) {
        const ped = life.peds[i];
        if (!ped || ped.health > 0) continue;
        ped.down += step;
        if (ped.down > 8) life.peds.splice(i, 1);
      }
      const living = life.peds.some(ped => ped.health > 0);
      if (living) { life.refill = 20; continue; }
      life.refill -= step;
      if (life.refill > 0) continue;
      const parts = key.split(':');
      const cx = Number(parts[0]);
      const cz = Number(parts[1]);
      if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue;
      this.generation += 1;
      for (const ped of populationFor(cx, cz).peds) {
        ped.id = ped.id + ':' + this.generation;
        life.peds.push(ped);
      }
      seedCrowd(life.peds, this.world.hours);
      life.refill = 20;
    }
  }

  private respawn() {
    this.seekingId = -1;
    this.sim.clearResponse();
    this.responseNoted = false;
    this.militaryNoted = false;
    const site = hospital(this.world.x, this.world.z);
    const spot = this.findOpen(site.x, site.z, 0.75) ?? site;
    this.world.x = spot.x;
    this.world.z = spot.z;
    this.vitals.health = MAX_HEALTH;
    this.vitals.money = cashOnDeath(this.vitals.money);
    this.vitals.wanted = 0;
    this.vitals.calm = 0;
    this.vitals.invulnerable = 2.5;
    this.police.length = 0;
    this.say('쓰러졌습니다. 돈의 일부를 잃고 길에서 일어납니다.', 3.4);
    this.ensureAround(2);
  }
}
