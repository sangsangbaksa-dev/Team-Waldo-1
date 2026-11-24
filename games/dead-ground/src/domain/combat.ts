import { clamp, direction, lerp, segmentBox, segmentSphere, vec, type Vec3 } from './math.js';
import { HALF_MAP, type World } from './world.js';

export const TICK = 1 / 60;
export const ROUND_SECONDS = 360;
export const SCORE_LIMIT = 12;
export const MAX_PLAYERS = 6;
export const RESPAWN_SECONDS = 3;
export const PROTECTION_SECONDS = 3;
export const RIFLE = {
  magazine: 5, reserve: 30, cycle: 1.08, reload: 2.6,
  velocity: 285, gravity: 15, lifetime: 4.5, bodyDamage: 65,
} as const;
export const PLAYER_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.18;

export interface Input {
  yaw: number; pitch: number;
  forward: number; strafe: number;
  crouch: boolean; sprint: boolean; aim: boolean; breath: boolean;
  fire: number; reload: number;
}

export const neutralInput = (yaw = 0, pitch = 0): Input => ({
  yaw, pitch, forward: 0, strafe: 0, crouch: false, sprint: false,
  aim: false, breath: false, fire: 0, reload: 0,
});

export interface Player {
  id: string; name: string; bot: boolean;
  position: Vec3; yaw: number; pitch: number; height: number;
  crouched: boolean; aiming: boolean; sprinting: boolean; moving: boolean;
  health: number; alive: boolean; protectedUntil: number; respawnAt: number;
  breath: number; breathExhausted: boolean; steady: boolean; flinch: number;
  ammo: number; reserve: number; boltUntil: number; reloadUntil: number;
  kills: number; deaths: number; headshots: number;
  generation: number;
}

export interface Bullet {
  id: number; owner: string; position: Vec3; velocity: Vec3; expires: number;
}

export interface Movement {
  position: Vec3; height: number; crouched: boolean; sprinting: boolean; moving: boolean;
}

export function movePlayer(world: World, state: Movement, input: Input, dt: number): Movement {
  const crouched = input.crouch || (state.crouched && !world.canStand(state.position.x, state.position.z, PLAYER_HEIGHT));
  const targetHeight = crouched ? CROUCH_HEIGHT : PLAYER_HEIGHT;
  const height = lerp(state.height, targetHeight, Math.min(1, dt * 13));
  const sprinting = input.sprint && input.forward > 0 && !input.aim && !crouched;
  const speed = crouched ? (input.aim ? 2.1 : 3.05) : input.aim ? 2.7 : sprinting ? 10 : 6.2;
  const length = Math.max(1, Math.hypot(input.forward, input.strafe));
  const rate = speed * dt / length;
  const forward = direction(input.yaw, 0), right = direction(input.yaw - Math.PI / 2, 0);
  const from = state.position;
  const x = clamp(from.x + (forward.x * input.forward + right.x * input.strafe) * rate, -HALF_MAP + 3, HALF_MAP - 3);
  const z = clamp(from.z + (forward.z * input.forward + right.z * input.strafe) * rate, -HALF_MAP + 3, HALF_MAP - 3);
  const canStep = (nextX: number, nextZ: number) =>
    world.heightAt(nextX, nextZ) - from.y <= 0.55 && world.canStand(nextX, nextZ, targetHeight);
  const nextX = canStep(x, from.z) ? x : from.x;
  const nextZ = canStep(nextX, z) ? z : from.z;
  return { position: vec(nextX, world.heightAt(nextX, nextZ), nextZ), height, crouched, sprinting,
    moving: Math.hypot(nextX - from.x, nextZ - from.z) > 0.001 };
}

export const eye = (player: Pick<Player, 'position' | 'height'>) =>
  vec(player.position.x, player.position.y + player.height - 0.15, player.position.z);

export const BODY_FLINCH = 0.62;

/** Aim point ahead of a moving target, including drop. Velocity is clamped so a bad sample cannot throw the shot. */
export function shotLead(aimAt: Vec3, velocity: Vec3, distance: number): Vec3 {
  const flight = Math.max(0, distance) / RIFLE.velocity;
  const speed = Math.hypot(velocity.x, velocity.z);
  const scale = speed > 12 ? 12 / speed : 1;
  return vec(
    aimAt.x + velocity.x * scale * flight,
    aimAt.y + RIFLE.gravity * flight * flight / 2 - 0.32,
    aimAt.z + velocity.z * scale * flight,
  );
}

export function aimSway(state: Pick<Player, 'aiming' | 'steady' | 'moving' | 'crouched'> & { flinch?: number }, time: number) {
  const kicked = 1 + Math.min(0.7, Math.max(0, state.flinch ?? 0)) * 5.5;
  const amplitude = (state.aiming ? 0.0035 : 0.008) * (state.steady ? 0.12 : state.crouched ? 0.72 : 1)
    * (state.moving ? 2 : 1) * kicked;
  return {
    yaw: amplitude * (Math.sin(time * 2.1) + 0.34 * Math.sin(time * 3.7)),
    pitch: amplitude * (0.78 * Math.cos(time * 1.7) + 0.22 * Math.sin(time * 4.3)),
  };
}

export function advanceBullet(bullet: Bullet, dt: number): Vec3 {
  return vec(bullet.position.x + bullet.velocity.x * dt,
    bullet.position.y + bullet.velocity.y * dt - RIFLE.gravity * dt * dt / 2,
    bullet.position.z + bullet.velocity.z * dt);
}

export function hitPlayer(a: Vec3, b: Vec3, target: Player): { fraction: number; headshot: boolean } {
  const { x, y, z } = target.position;
  const head = segmentSphere(a, b, vec(x, y + target.height - 0.15, z), 0.17);
  const body = segmentBox(a, b, vec(x - 0.29, y + 0.06, z - 0.24),
    vec(x + 0.29, y + target.height - 0.30, z + 0.24));
  return { fraction: Math.min(head, body), headshot: head < body };
}

export function ranked(players: readonly Player[]): Player[] {
  return [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || b.headshots - a.headshots
    || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
