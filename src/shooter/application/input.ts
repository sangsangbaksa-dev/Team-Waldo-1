import type { Input } from '../sim';

export interface InputState {
  keys: ReadonlySet<string>;
  mouse: { fire: boolean; ads: boolean };
  touch: { fire: boolean; ads: boolean; crouch: boolean; move: { x: number; y: number } };
  active: boolean;
  yaw: number; pitch: number; dt: number;
  air: number; vehicle: number; currentSlot: number; hasOtherGun: boolean;
  nade: boolean; smoke: boolean; flash: boolean; heal: number; reload: boolean;
  interact: boolean; jumpQueued: boolean; slot: number; swap: boolean;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Translate device-neutral input state to a simulation command. No browser events or clock. */
export function composeInput(s: InputState): { input: Input; looked: boolean } {
  const { keys, mouse, touch, active } = s;
  const aiming = keys.has('KeyK');
  const axis = (positive: string, negative: string) => Number(keys.has(positive)) - Number(keys.has(negative));
  const lookX = axis('ArrowRight', 'ArrowLeft'), lookY = axis('ArrowUp', 'ArrowDown');
  const looked = active && aiming && (lookX !== 0 || lookY !== 0);
  const yaw = looked ? s.yaw + lookX * s.dt * 0.8 : s.yaw;
  const pitch = looked ? clamp(s.pitch + lookY * s.dt * 0.8, -1.4, 1.4) : s.pitch;
  const sx = touch.move.x, sy = -touch.move.y;
  const kx = Number(keys.has('KeyD') || (!aiming && keys.has('ArrowRight'))) - Number(keys.has('KeyA') || (!aiming && keys.has('ArrowLeft')));
  const kz = Number(keys.has('KeyW') || (!aiming && keys.has('ArrowUp'))) - Number(keys.has('KeyS') || (!aiming && keys.has('ArrowDown')));
  const slot = s.swap ? (s.hasOtherGun ? 1 - s.currentSlot : -1) : s.slot;
  return { looked, input: {
    yaw, pitch, mx: active ? clamp(kx + sx, -1, 1) : 0, mz: active ? clamp(kz + sy, -1, 1) : 0,
    fire: active && (mouse.fire || touch.fire || keys.has('KeyJ')),
    ads: active && (mouse.ads || touch.ads || aiming),
    sprint: active && (keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(sx, sy) > 0.92),
    crouch: active && (keys.has('KeyC') || touch.crouch),
    nade: active && s.nade, smoke: active && s.smoke, flash: active && s.flash,
    heal: active ? s.heal : 0, reload: active && s.reload, interact: active && s.interact,
    jump: active && (keys.has('Space') || s.jumpQueued || (s.air > 0 && s.interact) || (s.vehicle >= 0 && touch.crouch)),
    slot: active ? slot : -1,
  } };
}
