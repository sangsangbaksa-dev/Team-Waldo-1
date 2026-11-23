import { aimSway, eye, neutralInput, RIFLE, type Input, type Player } from './combat.js';
import type { Match } from './match.js';
import { angleDelta, clamp, horizontalDistance, randomSource, vec, type Vec3 } from './math.js';
import { LANDMARKS } from './world.js';

const TACTICS_INTERVAL = 0.28;
const TURN_RATE = 2.8;
const SAMPLE_ANGLES = [0, 0.45, -0.45, 0.9, -0.9, 1.5, -1.5, 2.25, -2.25, Math.PI];

interface PositionPair { hide: Vec3; peek: Vec3 }

export class Bot {
  private readonly rng: () => number;
  private nextThink = 0;
  private nextShot = 0;
  private nextMove = 0;
  private destination?: Vec3;
  private cover?: PositionPair;
  private target?: Player;
  private lastSeen?: Vec3;
  private searchUntil = 0;
  private hidingUntil = 0;
  private fire = 0;
  private reload = 0;
  private generation = -1;
  private patrolStep = 0;
  private errorX = 0;
  private errorY = 0;

  constructor(readonly id: string, readonly index: number) {
    this.rng = randomSource(6173 + index * 127);
  }

  decide(match: Match, dt: number): Input {
    const self = match.players.get(this.id);
    if (!self?.alive) return { ...neutralInput(), fire: this.fire, reload: this.reload };
    const { time, world } = match;
    if (self.generation !== this.generation) {
      this.generation = self.generation;
      this.target = undefined;
      this.cover = undefined;
      this.lastSeen = undefined;
      this.destination = undefined;
      this.nextThink = time;
      this.nextShot = time + 3 + this.rng() * 1.5;
      this.nextMove = time;
      this.hidingUntil = time;
    }

    if (time >= this.nextThink) {
      this.updateTactics(match, self);
      this.nextThink = time + TACTICS_INTERVAL + this.rng() * 0.13;
    }

    const input = { ...neutralInput(self.yaw, self.pitch), fire: this.fire, reload: this.reload };
    if (self.ammo < 2 && self.reserve && !self.reloadUntil && !self.boltUntil && (!this.target || self.ammo === 0)) {
      input.reload = ++this.reload;
    }

    const hiding = this.cover && time < this.hidingUntil;
    const destination = hiding ? this.cover?.hide : this.destination;
    const isMoving = destination && horizontalDistance(self.position, destination) > 0.85;
    if (isMoving && destination) {
      const heading = Math.atan2(self.position.x - destination.x, self.position.z - destination.z);
      const path = SAMPLE_ANGLES.find(offset => {
        const x = self.position.x - Math.sin(heading + offset) * 1.5;
        const z = self.position.z - Math.cos(heading + offset) * 1.5;
        return world.canStand(x, z, 1.8) && Math.abs(world.heightAt(x, z) - self.position.y) < 1.75;
      });
      if (path !== undefined) {
        input.yaw += clamp(angleDelta(self.yaw, heading + path), -TURN_RATE * dt, TURN_RATE * dt);
        input.forward = Math.abs(angleDelta(input.yaw, heading + path)) < 0.6 ? 1 : 0;
        input.sprint = !hiding;
        input.crouch = Boolean(hiding);
      }
      input.pitch *= 0.94;
      return input;
    }

    const target = this.target;
    if (!target?.alive || hiding) {
      input.crouch = Boolean(hiding);
      input.yaw += 0.24 * dt;
      return input;
    }

    const from = eye(self), to = eye(target);
    const distance = horizontalDistance(from, to);
    const flight = distance / RIFLE.velocity;
    const velocity = target.moving ? (target.sprinting ? 9.5 : 4.5) : 0;
    to.x -= Math.sin(target.yaw) * velocity * flight * 0.6;
    to.z -= Math.cos(target.yaw) * velocity * flight * 0.6;
    to.y += RIFLE.gravity * flight * flight / 2 - 0.32;
    input.aim = true;
    input.breath = self.breath > 0.18;
    input.crouch = Boolean(this.cover);
    const sway = aimSway(self, time + dt);
    const wantedYaw = Math.atan2(from.x - to.x, from.z - to.z) + this.errorX - sway.yaw;
    const wantedPitch = Math.atan2(to.y - from.y, distance) + this.errorY - sway.pitch;
    input.yaw += clamp(angleDelta(self.yaw, wantedYaw), -TURN_RATE * dt, TURN_RATE * dt);
    input.pitch += clamp(wantedPitch - self.pitch, -TURN_RATE * dt, TURN_RATE * dt);

    if (time >= this.nextShot && self.ammo > 0 && !self.boltUntil && !self.reloadUntil
      && target.protectedUntil <= time && Math.abs(angleDelta(input.yaw, wantedYaw)) < 0.006
      && Math.abs(input.pitch - wantedPitch) < 0.006 && world.trace(from, eye(target)) === Infinity) {
      input.fire = ++this.fire;
      this.nextShot = time + 1.9 + this.rng() * 1.8;
      this.errorX = (this.rng() - 0.5) * 0.009;
      this.errorY = (this.rng() - 0.5) * 0.006;
      if (this.cover && this.rng() < 0.78) this.hidingUntil = time + 1.25 + this.rng() * 0.9;
    }
    return input;
  }

  private updateTactics(match: Match, self: Player): void {
    const { world, time } = match;
    const source = eye(self);
    const previous = this.target;
    this.target = [...match.players.values()]
      .filter(other => other.id !== self.id && other.alive && horizontalDistance(source, other.position) < 285)
      .sort((a, b) => horizontalDistance(source, a.position) - horizontalDistance(source, b.position))
      .find(other => world.trace(source, eye(other)) === Infinity);

    if (this.target) {
      this.lastSeen = { ...this.target.position };
      this.searchUntil = time + 12;
      if (this.target.id !== previous?.id && time >= this.hidingUntil) {
        this.nextShot = Math.max(this.nextShot, time + 0.85 + this.rng() * 1.05);
        this.errorX = (this.rng() - 0.5) * 0.006;
        this.errorY = (this.rng() - 0.5) * 0.004;
      }
      if (!this.cover || time >= this.nextMove) {
        this.cover = this.findCover(match, self, this.target);
        this.nextMove = time + 9 + this.rng() * 5;
      }
      this.destination = this.cover?.peek;
      return;
    }

    if (this.cover && time < this.nextMove && time < this.searchUntil) return;
    this.cover = undefined;
    if (this.destination && time < this.nextMove && horizontalDistance(self.position, this.destination) > 2) return;
    this.nextMove = time + 13 + this.rng() * 6;
    if (this.lastSeen && time < this.searchUntil && horizontalDistance(self.position, this.lastSeen) > 24) {
      const bearing = Math.atan2(self.position.z - this.lastSeen.z, self.position.x - this.lastSeen.x) + 0.63;
      this.destination = vec(this.lastSeen.x + Math.cos(bearing) * 31, 0, this.lastSeen.z + Math.sin(bearing) * 31);
      return;
    }
    const landmark = LANDMARKS[(this.index * 2 + this.patrolStep++ * 3) % LANDMARKS.length];
    this.destination = vec(landmark.x + (this.rng() - 0.5) * 42, 0, landmark.z + (this.rng() - 0.5) * 42);
  }

  private findCover(match: Match, self: Player, target: Player): PositionPair | undefined {
    const { world } = match;
    let best: PositionPair | undefined;
    let score = Infinity;
    const targetEye = eye(target);
    for (const item of world.cover) {
      if (item.h < 1.25 || item.kind === 'tree' || horizontalDistance(item, self.position) > 34) continue;
      const heading = Math.atan2(item.z - targetEye.z, item.x - targetEye.x);
      const radius = Math.min(9, Math.hypot(item.w, item.d) / 2 + 0.65);
      const sample = (angle: number, distance: number) => {
        const x = item.x + Math.cos(angle) * distance, z = item.z + Math.sin(angle) * distance;
        return vec(x, world.heightAt(x, z) + 1.01, z);
      };
      const hide = sample(heading, radius);
      const travel = horizontalDistance(hide, self.position);
      if (travel >= score || !world.canStand(hide.x, hide.z, 1.18) || world.trace(targetEye, hide) >= 1) continue;
      for (const side of [-1, 1]) {
        const peek = sample(heading + side * 1.32, radius + 0.8);
        if (!world.canStand(peek.x, peek.z, 1.18) || world.trace(targetEye, peek) < 1) continue;
        best = { hide, peek };
        score = travel;
        break;
      }
    }
    return best;
  }
}
