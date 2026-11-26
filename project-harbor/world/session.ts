import { CHUNK, DEPTH, WIDTH, roadDistance } from './domain';
import { World, type ChunkView } from './application';
import {
  MAX_HEALTH, WEAPONS, addWanted, applyHit, armWeapon, cashOnDeath, createVitals, decayWanted,
  hospital, makePed, makeWeapon, nearestItem, nearestPed, pickpocket, policeShot, populationFor,
  rayHit, rob, starCount, stepActor, takeItem,
  type CrimeResult, type GroundItem, type Ped, type ShotLine, type Vitals,
} from './street';

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
}

export const IDLE_INPUT: RoamInput = {
  forward: 0, side: 0, sprint: false, look: 0, use: false, pickpocket: false, rob: false, fire: false, reload: false,
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
  private readonly life = new Map<string, Bucket>();
  private readonly police: Ped[] = [];

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
  get activePedCount() { return this.peds.length; }

  tick(input: RoamInput, dt: number) {
    const step = Math.max(0, Math.min(0.05, dt));
    this.time += step;
    this.shots.length = 0;
    this.world.yaw = Math.atan2(Math.sin(this.world.yaw + input.look), Math.cos(this.world.yaw + input.look));
    if (this.vitals.invulnerable > 0) this.vitals.invulnerable = Math.max(0, this.vitals.invulnerable - step);
    if (this.vitals.health <= 0) this.respawn();
    this.world.move(input.forward, input.side, step, input.sprint);
    this.world.stream();
    this.ensureAround(2);
    this.interact(input);
    const weapon = this.vitals.weapon;
    const trigger = armWeapon(this.vitals, step, input.fire, input.reload);
    if (trigger === 'shot' && weapon) this.fire(weapon);
    else if (trigger === 'empty' && input.fire) this.say('쏠 총이나 탄약이 없습니다.');
    else if (trigger === 'reload' && weapon) this.say(WEAPONS[weapon].name + ' 재장전');
    const blockedAt = (x: number, z: number) => !this.world.open(x, z, 0.45);
    for (const ped of this.actorsIn(1)) stepActor(ped, step, this.world.x, this.world.z, blockedAt);
    for (const ped of this.police) stepActor(ped, step, this.world.x, this.world.z, blockedAt);
    this.updatePolice(step, blockedAt);
    this.reap(step);
    decayWanted(this.vitals, step);
    if (this.vitals.health <= 0) this.respawn();
    if (this.time >= this.noticeUntil) this.notice = '';
  }

  hint(): string {
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
    if (ped) parts.push('F · 소매치기 · G · 강도');
    else if (nearestPed(this.actorsIn(1), this.x, this.z, 12, true)) parts.push('앞에 사람이 있습니다');
    if (this.vitals.weapon) parts.push('클릭 · 사격 · R · 재장전');
    return parts.join('   ');
  }

  placePed(x: number, z: number, extra: Partial<Ped> = {}): Ped {
    const key = Math.floor(x / CHUNK) + ':' + Math.floor(z / CHUNK);
    const ped = makePed(extra.id ?? 'placed-' + this.dropped++, x, z, { ...extra, chunk: key });
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

  private interact(input: RoamInput) {
    if (input.use) {
      const item = nearestItem(this.items, this.world.x, this.world.z, 3.2);
      if (!item) this.say('주울 것이 없습니다.');
      else this.collect(item);
      return;
    }
    if (!input.rob && !input.pickpocket) return;
    const ped = nearestPed(this.actorsIn(1), this.world.x, this.world.z, 3.4, true);
    if (!ped) { this.say('가까운 사람이 없습니다.'); return; }
    const before = this.vitals.health;
    const result = input.rob ? rob(this.vitals, ped) : pickpocket(this.vitals, ped, this.roll());
    if (this.vitals.invulnerable > 0) this.vitals.health = before;
    this.sayCrime(result);
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
    if (!hit) return;
    const killed = applyHit(hit.ped, spec.damage);
    for (const ped of this.actorsIn(1)) {
      if (ped.kind === 'civilian' && ped.health > 0 && Math.hypot(ped.x - this.world.x, ped.z - this.world.z) < 18) ped.state = 'flee';
    }
    if (killed && hit.ped.kind === 'police') this.say('경찰을 쓰러뜨렸습니다. 수배가 올랐습니다.');
  }

  private updatePolice(step: number, blockedAt: (x: number, z: number) => boolean) {
    const needed = starCount(this.vitals.wanted) >= 2 ? Math.min(4, starCount(this.vitals.wanted)) : 0;
    for (let i = this.police.length - 1; i >= 0; i--) {
      const ped = this.police[i];
      if (!ped) continue;
      if (ped.health <= 0) {
        ped.down += step;
        if (ped.down > 3) this.police.splice(i, 1);
        continue;
      }
      if (Math.hypot(ped.x - this.world.x, ped.z - this.world.z) > 80) this.police.splice(i, 1);
    }
    while (this.police.filter(ped => ped.health > 0).length > needed) {
      const index = this.police.findIndex(ped => ped.health > 0);
      if (index < 0) break;
      this.police.splice(index, 1);
    }
    const alive = this.police.filter(ped => ped.health > 0).length;
    this.policeWait = Math.max(0, this.policeWait - step);
    if (alive < needed && this.policeWait === 0) {
      this.spawnPolice();
      this.policeWait = 1.4;
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
      life.refill = 20;
    }
  }

  private respawn() {
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
