import { DEPTH, WIDTH, districtAt, roadDistance, type District } from './domain';
import { beginHijack, doorOpen, doorPoint, stepHijack, type Hijack } from './hijack';
import {
  dispatchCommand, initialPursuit, policyFor, pursuitMode, spawnBudget, stepPursuit,
  type PursuitClock, type UnitCommand,
} from './pursuit';
import {
  buildLanes, endPoint, nearestLane, poseOn, signalOpen, SPAWN, vehicleYawFromWorld, worldForward, worldYawFromVehicle,
  type LaneEdge,
} from './roads';
import { makeVehicle, hitWall, longitudinal, stepVehicle, type VehicleInput, type VehicleBody } from '../vehicles/domain.js';
import {
  DISTRICT_CAP, SIM_STEP, claimSignal, lodOf, neighborsOnLane, releaseSignal, separateCars, stepTraffic,
  SpatialHash, type Reservation, type TrafficCar, type TrafficKind,
} from './lane';

export { SIM_STEP };

export interface SimContext {
  x: number;
  z: number;
  yaw: number;
  use: boolean;
  throttle: number;
  steer: number;
  handbrake: boolean;
  stars: number;
  crimePulse: boolean;
  seen: boolean;
  blocked: (x: number, z: number) => boolean;
  clear: (x: number, z: number) => boolean;
}

export interface SimEvent {
  type: 'driver' | 'board' | 'crime' | 'wreck';
  id: string;
  amount: number;
  x: number;
  z: number;
  yaw: number;
}

const COLOR: Record<District, number> = {
  forest: 0x4d6a45,
  desert: 0xb08958,
  city: 0x6d7c86,
  rich: 0xd7d2c4,
  slum: 0x8a705f,
  base: 0x71785a,
};

export class FixedClock {
  private acc = 0;

  advance(dt: number, onStep: (step: number) => void) {
    this.acc = Math.min(0.25, this.acc + Math.max(0, dt));
    let steps = 0;
    while (this.acc >= SIM_STEP && steps < 8) {
      onStep(SIM_STEP);
      this.acc -= SIM_STEP;
      steps += 1;
    }
  }
}

export class StreetSim {
  readonly cars: TrafficCar[] = [];
  readonly edges: readonly LaneEdge[];
  pursuit: PursuitClock;
  hijack: Hijack | null = null;
  notice = '';
  command: UnitCommand = dispatchCommand(0, 'clear');
  private readonly clock = new FixedClock();
  private readonly hash = new SpatialHash();
  private readonly reservations: Reservation[] = [];
  private readonly bodies = new Map<number, VehicleBody>();
  private exitPoint: { x: number; z: number } | null = null;
  private playerId = -1;
  private attempt = 1;
  private nextId = 1;
  private time = 0;
  private stars = 0;
  private readonly cooldown = { police: 0, military: 0, block: 0 };

  constructor() {
    this.edges = buildLanes();
    this.pursuit = initialPursuit(SPAWN.x, SPAWN.z);
    this.populate();
  }

  get driving(): boolean {
    return this.playerId >= 0;
  }

  get busy(): boolean {
    return this.hijack !== null;
  }

  get sight(): number {
    return policyFor(this.stars).sight;
  }

  get playerCar(): TrafficCar | null {
    return this.playerId < 0 ? null : this.car(this.playerId);
  }

  nearest(x: number, z: number, range: number): TrafficCar | null {
    let best: TrafficCar | null = null;
    let distance = range;
    for (const car of this.cars) {
      if (car.kind === 'block' || car.control === 'player') continue;
      const gap = Math.hypot(car.x - x, car.z - z);
      if (gap < distance) {
        best = car;
        distance = gap;
      }
    }
    return best;
  }

  consumeExit(): { x: number; z: number } | null {
    const point = this.exitPoint;
    this.exitPoint = null;
    return point;
  }

  clearResponse() {
    this.pursuit = initialPursuit(this.playerCar?.x ?? SPAWN.x, this.playerCar?.z ?? SPAWN.z);
    this.command = dispatchCommand(0, 'clear');
    if (this.playerId >= 0) this.releasePlayer();
    this.cars.splice(0, this.cars.length, ...this.cars.filter(car => car.kind === 'civil'));
  }

  step(frameDt: number, ctx: SimContext): SimEvent[] {
    const events: SimEvent[] = [];
    let use = ctx.use;
    this.clock.advance(frameDt, step => {
      events.push(...this.substep(step, { ...ctx, use }));
      use = false;
    });
    return events;
  }

  private substep(dt: number, ctx: SimContext): SimEvent[] {
    this.time += dt;
    this.stars = ctx.stars;
    const events: SimEvent[] = [];
    this.pursuit = stepPursuit(this.pursuit, ctx.stars, ctx.seen, ctx.crimePulse, ctx.x, ctx.z, dt);
    this.reconcile(ctx, dt);
    const driven = this.playerCar;
    if (driven) this.pullBody(driven);
    if (ctx.use) this.use(ctx);
    if (this.hijack) this.advanceHijack(dt, events);
    const player = this.playerCar;
    if (player && Math.abs(player.speed) > 14) {
      for (const car of this.cars) {
        if (car.id !== player.id && Math.hypot(car.x - player.x, car.z - player.z) < 10) {
          car.panic = Math.max(car.panic, 1.6);
          car.parked = false;
        }
      }
    }
    for (const car of this.cars) {
      const distance = Math.hypot(car.x - ctx.x, car.z - ctx.z);
      car.lod = lodOf(distance, car.persistent || car.control === 'player');
      if (car.control === 'reserved') {
        car.speed = 0;
        car.vx = 0;
        car.vz = 0;
        continue;
      }
      if (car.control === 'player') {
        this.driveBody(car, { throttle: ctx.throttle, steer: ctx.steer, handbrake: ctx.handbrake }, dt, ctx);
        continue;
      }
      if (car.control === 'pursuit') {
        this.drivePursuit(car, ctx, dt);
        continue;
      }
      const edge = this.edges[car.edge];
      if (!edge) continue;
      const index = this.cars.indexOf(car);
      const remain = edge.length - car.progress;
      const end = endPoint(edge);
      const open = signalOpen(edge.axis, end.x, end.z, this.time) || car.wait > 6;
      const reserved = !car.parked && car.panic <= 0 && remain < 26 && open
        ? claimSignal(this.reservations, edge.crossing, car.id, this.time, car.speed > 0.8)
        : false;
      const flags = this.playerFlags(car, ctx);
      const decision = stepTraffic(
        car, edge, this.edges, neighborsOnLane(this.cars, index, this.edges),
        reserved, flags.ahead, flags.close, false, this.time, dt,
      );
      if (decision.release) releaseSignal(this.reservations, car.id);
    }
    for (const car of this.cars) {
      if (car.id !== this.hijack?.carId) car.door = Math.max(0, car.door - dt * 1.6);
    }
    this.separate(events);
    const staying = this.cars.filter(car => car.kind === 'civil' || car.control === 'player' || car.control === 'reserved' || car.mode !== 'withdraw' || Math.hypot(car.x - ctx.x, car.z - ctx.z) < 96);
    this.cars.splice(0, this.cars.length, ...staying);
    return events;
  }

  private use(ctx: SimContext) {
    if (this.playerId >= 0 && !this.hijack) {
      this.exit(ctx);
      return;
    }
    if (this.playerId >= 0 || this.hijack) return;
    let best: TrafficCar | null = null;
    let distance = 3.5;
    for (const car of this.cars) {
      if (car.control !== 'ai' || car.kind === 'block') continue;
      const gap = Math.hypot(car.x - ctx.x, car.z - ctx.z);
      if (gap < distance) {
        best = car;
        distance = gap;
      }
    }
    if (!best) {
      this.notice = '가까운 차량이 없습니다.';
      return;
    }
    const chosen = best;
    const started = beginHijack(chosen, ctx.x, ctx.z, this.attempt, (x, z) => this.exitClear(chosen, x, z, ctx));
    if (!started.hijack) {
      this.notice = started.reason === 'fast' ? '너무 빠른 차량입니다.'
        : started.reason === 'blocked' ? '내릴 공간이 없습니다.'
          : started.reason === 'owned' ? '이미 타고 있는 차량입니다.'
            : '차량에 탈 수 없습니다.';
      return;
    }
    this.attempt += 1;
    chosen.control = 'reserved';
    this.hijack = started.hijack;
    this.notice = chosen.occupied ? '운전자를 끌어내리는 중입니다.' : '차량에 탑승합니다.';
  }

  private exit(ctx: SimContext) {
    const car = this.playerCar;
    if (!car) return;
    if (Math.abs(car.speed) > 3) {
      this.notice = '속도를 줄인 뒤 내리세요.';
      return;
    }
    const door = doorPoint(car);
    const other = doorPoint(car, -1);
    const spot = this.exitClear(car, door.x, door.z, ctx) ? door : this.exitClear(car, other.x, other.z, ctx) ? other : null;
    if (!spot) {
      this.notice = '내릴 공간이 없습니다.';
      return;
    }
    this.releasePlayer();
    this.exitPoint = { x: spot.x, z: spot.z };
    this.notice = '차량에서 내렸습니다.';
  }

  private releasePlayer() {
    const car = this.playerCar;
    if (!car) return;
    car.control = 'ai';
    car.occupied = false;
    car.parked = false;
    this.playerId = -1;
    this.bodies.delete(car.id);
  }

  private advanceHijack(dt: number, events: SimEvent[]) {
    const hijack = this.hijack;
    if (!hijack) return;
    const car = this.car(hijack.carId);
    if (!car) {
      this.hijack = null;
      return;
    }
    const stepped = stepHijack(hijack, dt);
    this.hijack = stepped.hijack;
    car.door = this.hijack ? doorOpen(this.hijack) : Math.max(0, car.door - dt);
    for (const event of stepped.events) {
      if (event.type === 'driver') {
        car.occupied = false;
        this.alarm(event.x, event.z);
      }
      if (event.type === 'board') {
        car.control = 'player';
        car.occupied = false;
        car.parked = false;
        car.persistent = true;
        this.playerId = car.id;
        this.body(car);
      }
      events.push(event);
    }
    if (!this.hijack && events.some(event => event.type === 'crime')) this.notice = '차량을 탈취했습니다.';
    else if (!this.hijack && events.some(event => event.type === 'board')) this.notice = '차량에 탔습니다.';
  }

  private drivePursuit(car: TrafficCar, ctx: SimContext, dt: number) {
    const kind = car.kind === 'military' ? 'military' : car.kind === 'block' ? 'block' : 'police';
    const mode = pursuitMode(this.pursuit.phase, ctx.seen, kind);
    if (mode === 'block' || car.kind === 'block') {
      car.speed = 0;
      car.vx = 0;
      car.vz = 0;
      car.mode = 'hold';
      return;
    }
    const forward = worldForward(ctx.yaw);
    let tx = ctx.x;
    let tz = ctx.z;
    if (mode === 'search') {
      tx = this.pursuit.lastX;
      tz = this.pursuit.lastZ;
    } else if (mode === 'intercept') {
      tx += forward.x * 14;
      tz += forward.z * 14;
    } else if (mode === 'withdraw') {
      tx -= forward.x * 70;
      tz -= forward.z * 70;
    }
    const desired = Math.atan2(tx - car.x, -(tz - car.z));
    const error = Math.atan2(Math.sin(desired - car.yaw), Math.cos(desired - car.yaw));
    const dist = Math.hypot(tx - car.x, tz - car.z);
    this.driveBody(car, {
      throttle: dist < 7 ? 0 : 0.85,
      steer: Math.max(-1, Math.min(1, -error)),
      handbrake: false,
    }, dt, ctx);
    car.mode = mode === 'search' ? 'search' : mode === 'withdraw' ? 'withdraw' : 'chase';
  }

  private driveBody(car: TrafficCar, input: VehicleInput, dt: number, ctx: SimContext) {
    const body = this.body(car);
    body.yaw = vehicleYawFromWorld(car.yaw);
    stepVehicle(body, input, dt, roadDistance(body.x, body.z) > 0.4);
    if (ctx.blocked(body.x, body.z)) hitWall(body, { x: body.x, z: body.z, w: 2.2, d: 2.2 });
    body.x = Math.max(4, Math.min(WIDTH - 4, body.x));
    body.z = Math.max(4, Math.min(DEPTH - 4, body.z));
    car.x = body.x;
    car.z = body.z;
    car.yaw = worldYawFromVehicle(body.yaw);
    car.vx = body.vx;
    car.vz = body.vz;
    car.speed = longitudinal(body);
    car.health = body.health;
    const lane = nearestLane(this.edges, car.x, car.z);
    if (lane) {
      car.edge = lane.edge.id;
      car.progress = lane.progress;
    }
  }

  private separate(events: SimEvent[]) {
    this.hash.clear();
    this.cars.forEach((car, index) => this.hash.insert(index, car.x, car.z));
    for (let i = 0; i < this.cars.length; i++) {
      const left = this.cars[i];
      if (!left) continue;
      for (const index of this.hash.around(left.x, left.z, 10)) {
        if (index <= i) continue;
        const right = this.cars[index];
        if (!right || !separateCars(left, right)) continue;
        const playerHit = left.control === 'player' ? right : right.control === 'player' ? left : null;
        if (playerHit && playerHit.kind === 'civil' && playerHit.health <= 0) {
          events.push({
            type: 'wreck', id: 'wreck:' + playerHit.id, amount: 0.45,
            x: playerHit.x, z: playerHit.z, yaw: playerHit.yaw,
          });
        }
      }
    }
  }

  private reconcile(ctx: SimContext, dt: number) {
    this.command = dispatchCommand(ctx.stars, this.pursuit.phase);
    this.cooldown.police = Math.max(0, this.cooldown.police - dt);
    this.cooldown.military = Math.max(0, this.cooldown.military - dt);
    this.cooldown.block = Math.max(0, this.cooldown.block - dt);
    if (this.command.withdraw) return;
    if (spawnBudget(this.count('police'), this.command.police, this.command.allowSpawn && this.cooldown.police === 0)) {
      if (this.spawnUnit('police', ctx, -26)) this.cooldown.police = 1.2;
    }
    if (spawnBudget(this.count('military'), this.command.military, this.command.allowSpawn && this.cooldown.military === 0)) {
      if (this.spawnUnit('military', ctx, -34)) this.cooldown.military = 1.2;
    }
    if (spawnBudget(this.count('block'), this.command.blocks, this.command.allowSpawn && this.cooldown.block === 0)) {
      if (this.spawnUnit('block', ctx, 40)) this.cooldown.block = 1.4;
    }
  }

  private spawnUnit(kind: TrafficKind, ctx: SimContext, distance: number): boolean {
    const forward = worldForward(ctx.yaw);
    const lane = nearestLane(this.edges, ctx.x + forward.x * distance, ctx.z + forward.z * distance)
      ?? nearestLane(this.edges, ctx.x, ctx.z);
    if (!lane) return false;
    const extra = kind === 'military' ? 28 : kind === 'block' ? 52 : 0;
    let edge = lane.edge;
    let progress = Math.min(edge.length, lane.progress + extra);
    for (let attempt = 0; attempt < 8; attempt++) {
      const pose = poseOn(edge, progress);
      const crowded = this.cars.some(car => Math.hypot(car.x - pose.x, car.z - pose.z) < 8);
      if (!crowded) {
        const type = kind === 'military' ? 'armor' : kind === 'block' ? 'truck' : 'police';
        const spec = makeVehicle(0, type, 0, 0, 0).spec;
        this.cars.push({
          id: this.nextId++,
          x: pose.x,
          z: pose.z,
          yaw: pose.yaw,
          speed: kind === 'block' ? 0 : 6,
          vx: 0,
          vz: 0,
          edge: edge.id,
          progress,
          kind,
          control: 'pursuit',
          mode: kind === 'block' ? 'hold' : 'chase',
          occupied: false,
          parked: kind === 'block',
          door: 0,
          health: kind === 'military' ? 220 : 140,
          panic: 0,
          wait: 0,
          cruise: kind === 'military' ? 16 : 14,
          length: spec.length,
          width: spec.width,
          color: spec.color,
          persistent: true,
          lod: 'near',
          type,
          drift: 0,
        });
        return true;
      }
      progress += 16;
      if (progress <= edge.length) continue;
      const next = this.edges[edge.next[0] ?? -1];
      if (!next) return false;
      progress = Math.min(next.length, progress - edge.length);
      edge = next;
    }
    return false;
  }

  private populate() {
    const buckets = new Map<District, LaneEdge[]>();
    for (const edge of this.edges) {
      const list = buckets.get(edge.district) ?? [];
      list.push(edge);
      buckets.set(edge.district, list);
    }
    (Object.keys(DISTRICT_CAP) as District[]).forEach((district, districtIndex) => {
      const pool = buckets.get(district) ?? [];
      const ranked = pool.slice().sort((a, b) => mix(a.id + districtIndex * 17) - mix(b.id + districtIndex * 17));
      const cap = DISTRICT_CAP[district];
      let placed = 0;
      for (const edge of ranked) {
        if (placed >= cap) break;
        let progress = 20 + ((placed * 71 + edge.id * 13) % Math.max(1, Math.floor(edge.length - 40)));
        for (let n = 0; n < 6; n++) {
          const trial = poseOn(edge, progress);
          if (Math.hypot(trial.x - SPAWN.x, trial.z - SPAWN.z) > 24 && districtAt(trial.x, trial.z).id === district) break;
          progress = (progress + 37) % Math.max(1, edge.length - 16);
        }
        const pose = poseOn(edge, progress);
        if (districtAt(pose.x, pose.z).id !== district) continue;
        if (Math.hypot(pose.x - SPAWN.x, pose.z - SPAWN.z) <= 24) continue;
        const spec = makeVehicle(0, 'sedan', 0, 0, 0).spec;
        this.cars.push({
          id: this.nextId++,
          x: pose.x,
          z: pose.z,
          yaw: pose.yaw,
          speed: 8 + (placed % 4),
          vx: 0,
          vz: 0,
          edge: edge.id,
          progress,
          kind: 'civil',
          control: 'ai',
          mode: 'lane',
          occupied: true,
          parked: false,
          door: 0,
          health: 100,
          panic: 0,
          wait: 0,
          cruise: 9 + (placed % 5),
          length: spec.length,
          width: spec.width,
          color: COLOR[district],
          persistent: false,
          lod: 'sleep',
          type: 'sedan',
          drift: 0,
        });
        placed += 1;
      }
    });
    let parked: TrafficCar | null = null;
    let best = Infinity;
    for (const car of this.cars) {
      if (car.kind !== 'civil' || districtAt(car.x, car.z).id !== 'city') continue;
      const gap = Math.hypot(car.x - 1568, car.z - 578);
      if (gap < best) {
        best = gap;
        parked = car;
      }
    }
    if (!parked) {
      this.parkEmpty(SPAWN.x + 9, SPAWN.z - 1.6);
      return;
    }
    const lane = nearestLane(this.edges, 1568, 578);
    if (!lane) {
      this.parkEmpty(SPAWN.x + 9, SPAWN.z - 1.6);
      return;
    }
    const pose = poseOn(lane.edge, lane.progress);
    parked.x = pose.x;
    parked.z = pose.z;
    parked.yaw = pose.yaw;
    parked.edge = lane.edge.id;
    parked.progress = lane.progress;
    parked.speed = 0;
    parked.parked = true;
    parked.occupied = true;
    parked.mode = 'hold';
    this.parkEmpty(SPAWN.x + 9, SPAWN.z - 1.6, parked);
  }

  private parkEmpty(x: number, z: number, except?: TrafficCar) {
    const lane = nearestLane(this.edges, x, z);
    if (!lane) return;
    const pose = poseOn(lane.edge, lane.progress);
    const donor = this.cars.find(car => car !== except && car.kind === 'civil' && districtAt(car.x, car.z).id === 'city');
    const spec = makeVehicle(0, 'sedan', 0, 0, 0).spec;
    const car = donor ?? {
      id: this.nextId++,
      x: pose.x,
      z: pose.z,
      yaw: pose.yaw,
      speed: 0,
      vx: 0,
      vz: 0,
      edge: lane.edge.id,
      progress: lane.progress,
      kind: 'civil' as const,
      control: 'ai' as const,
      mode: 'hold' as const,
      occupied: false,
      parked: true,
      door: 0,
      health: 100,
      panic: 0,
      wait: 0,
      cruise: 0,
      length: spec.length,
      width: spec.width,
      color: spec.color,
      persistent: false,
      lod: 'near' as const,
      type: 'sedan',
      drift: 0,
    };
    car.x = pose.x;
    car.z = pose.z;
    car.yaw = pose.yaw;
    car.speed = 0;
    car.vx = 0;
    car.vz = 0;
    car.edge = lane.edge.id;
    car.progress = lane.progress;
    car.occupied = false;
    car.parked = true;
    car.mode = 'hold';
    car.control = 'ai';
    if (!donor) this.cars.push(car);
  }

  private playerFlags(car: TrafficCar, ctx: SimContext): { ahead: boolean; close: boolean } {
    if (car.control === 'player') return { ahead: false, close: false };
    const forward = worldForward(car.yaw);
    const dx = ctx.x - car.x;
    const dz = ctx.z - car.z;
    const ahead = dx * forward.x + dz * forward.z;
    const dist = Math.hypot(dx, dz);
    return { ahead: ahead > 1 && ahead < 22 && dist < 8, close: dist < 6.5 && ahead > 0 };
  }

  private alarm(x: number, z: number) {
    for (const car of this.cars) {
      if (car.control === 'player' || Math.hypot(car.x - x, car.z - z) > 18) continue;
      car.panic = Math.max(car.panic, 3);
      car.parked = false;
    }
  }

  private exitClear(car: TrafficCar | null, x: number, z: number, ctx: SimContext): boolean {
    if (!ctx.clear(x, z)) return false;
    return !this.cars.some(other => other !== car && Math.hypot(other.x - x, other.z - z) < other.width * 0.6 + 0.4);
  }

  private count(kind: TrafficKind): number {
    return this.cars.filter(car => car.kind === kind && car.mode !== 'withdraw').length;
  }

  private car(id: number): TrafficCar | null {
    return this.cars.find(car => car.id === id) ?? null;
  }

  ride(car: TrafficCar): VehicleBody {
    const body = this.body(car);
    body.driver = car.occupied && car.control !== 'player';
    body.x = car.x;
    body.z = car.z;
    body.yaw = vehicleYawFromWorld(car.yaw);
    body.health = car.health;
    body.door = car.door;
    if (car.control !== 'player') {
      body.vx = car.vx;
      body.vz = car.vz;
    }
    return body;
  }

  vehicles(): VehicleBody[] {
    return this.cars.map(car => this.ride(car));
  }

  private pullBody(car: TrafficCar) {
    const body = this.bodies.get(car.id);
    if (!body) return;
    car.x = body.x;
    car.z = body.z;
    car.yaw = worldYawFromVehicle(body.yaw);
    car.vx = body.vx;
    car.vz = body.vz;
    car.speed = longitudinal(body);
    car.health = body.health;
  }

  private body(car: TrafficCar): VehicleBody {
    let body = this.bodies.get(car.id);
    if (!body) {
      body = makeVehicle(car.id, car.type, car.x, car.z, vehicleYawFromWorld(car.yaw), false);
      const forward = worldForward(car.yaw);
      body.vx = forward.x * car.speed;
      body.vz = forward.z * car.speed;
      this.bodies.set(car.id, body);
    }
    body.x = car.x;
    body.z = car.z;
    body.health = car.health;
    return body;
  }
}

function mix(value: number): number {
  let seed = (Math.imul(value + 1, 1664525) + 1013904223) >>> 0;
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
