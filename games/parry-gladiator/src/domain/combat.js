export const MAX_HP = 100;
export const MAX_STAMINA = 100;
export const ARENA_RADIUS = 9;
export const PARRY_WINDOW = 0.17;
export const DODGE_DURATION = 0.43;
export const FEINT_DURATION = 0.26;

export const attacks = {
  light: { cost: 17, windup: 0.34, active: 0.12, recovery: 0.31, damage: 17, range: 2.38, guard: 25, lunge: 0.44 },
  heavy: { cost: 30, windup: 0.65, active: 0.15, recovery: 0.46, damage: 30, range: 2.68, guard: 43, lunge: 0.68 },
  riposte: { cost: 12, windup: 0.19, active: 0.12, recovery: 0.44, damage: 36, range: 2.75, guard: 45, lunge: 0.63 },
};

export function fighter(id, x, z) {
  return {
    id, x, z, angle: id ? -Math.PI / 2 : Math.PI / 2,
    hp: MAX_HP, stamina: MAX_STAMINA, wins: 0,
    state: 'idle', timer: 0, attack: null, hit: false,
    guardHeld: false, guardStart: 0, parryLock: 0, riposte: 0,
    staminaDelay: 0, stun: 0, stunDuration: 0, dodgeX: 0, dodgeZ: 0,
    moveX: 0, moveZ: 0, buffered: null, bufferTime: 0,
  };
}

function spend(f, cost, delay) {
  f.stamina = Math.max(0, f.stamina - cost);
  f.staminaDelay = delay;
}

function guard(f, fresh) {
  f.state = 'block';
  if (fresh && f.parryLock <= 0) {
    f.guardStart = PARRY_WINDOW;
    f.parryLock = 0.48;
  }
}

function neutral(f) {
  f.state = 'idle';
  f.timer = 0;
  f.attack = null;
  if (f.guardHeld && f.stamina > 0) guard(f, false);
}

export function act(f, action, direction = {}, buffer = true) {
  if (action === 'release') {
    f.guardHeld = false;
    if (f.state === 'block') neutral(f);
    return false;
  }
  if (action === 'block') {
    if (f.guardHeld) return false;
    f.guardHeld = true;
    if (f.state === 'idle' && f.stamina > 0) {
      guard(f, true);
      return 'block';
    }
    return false;
  }
  if (action === 'feint') {
    if (f.state !== 'attack' || f.attack !== 'heavy' || f.timer >= attacks.heavy.windup - 0.035) return false;
    f.stamina = Math.min(MAX_STAMINA, f.stamina + 15);
    f.state = 'feint';
    f.timer = 0;
    f.attack = null;
    return 'feint';
  }
  if (action !== 'light' && action !== 'heavy' && action !== 'dodge') return false;
  if (f.state !== 'idle' && f.state !== 'block') {
    if (buffer && f.state !== 'stunned') {
      f.buffered = { action, direction };
      f.bufferTime = 0.16;
    }
    return false;
  }
  if (action === 'dodge') {
    if (f.stamina < 23) return false;
    const length = Math.hypot(direction.x || 0, direction.z || 0);
    f.dodgeX = length > 0 ? direction.x / length : -Math.sin(f.angle);
    f.dodgeZ = length > 0 ? direction.z / length : -Math.cos(f.angle);
    spend(f, 23, 0.45);
    f.state = 'dodge';
    f.timer = 0;
    f.guardStart = 0;
    return 'dodge';
  }

  const kind = action === 'light' && f.riposte > 0 ? 'riposte' : action;
  if (f.stamina < attacks[kind].cost) return false;
  spend(f, attacks[kind].cost, 0.50);
  f.state = 'attack';
  f.attack = kind;
  f.timer = 0;
  f.hit = false;
  f.guardStart = 0;
  f.riposte = 0;
  return kind;
}

function age(f, key, dt) {
  f[key] = Math.max(0, f[key] - dt);
}

export function stepFighter(f, dt, input = {}) {
  for (const key of ['guardStart', 'parryLock', 'riposte', 'staminaDelay', 'stun', 'bufferTime']) age(f, key, dt);
  if (!f.bufferTime) f.buffered = null;
  f.moveX = 0;
  f.moveZ = 0;
  const before = f.timer;
  f.timer += dt;
  if (f.state === 'attack') {
    const a = attacks[f.attack];
    const start = a.windup * 0.72;
    const advance = Math.max(0, Math.min(f.timer, a.windup) - Math.max(before, start));
    f.moveX = Math.sin(f.angle) * a.lunge * advance / (a.windup - start);
    f.moveZ = Math.cos(f.angle) * a.lunge * advance / (a.windup - start);
    if (f.timer >= a.windup + a.active + a.recovery) neutral(f);
  } else if (f.state === 'dodge') {
    const stride = Math.max(0, 7.5 * (1 - f.timer / (DODGE_DURATION * 1.15))) * dt;
    f.moveX = f.dodgeX * stride;
    f.moveZ = f.dodgeZ * stride;
    if (f.timer >= DODGE_DURATION) neutral(f);
  } else if (f.state === 'feint') {
    if (f.timer >= FEINT_DURATION) neutral(f);
  } else if (f.state === 'stunned') {
    if (f.stun <= 0) neutral(f);
  } else {
    const speed = f.state === 'block' ? 1.55 : 3.55;
    const x = input.x || 0, z = input.z || 0;
    const scale = speed * dt / Math.max(1, Math.hypot(x, z));
    f.moveX = x * scale;
    f.moveZ = z * scale;
  }
  f.x += f.moveX;
  f.z += f.moveZ;

  if (!f.staminaDelay && f.state !== 'attack' && f.state !== 'dodge') {
    const rate = f.state === 'block' ? 5 : 24;
    f.stamina = Math.min(MAX_STAMINA, f.stamina + dt * rate);
  }
  if ((f.state === 'idle' || f.state === 'block') && f.buffered) {
    const { action, direction } = f.buffered;
    f.buffered = null;
    return act(f, action, direction, false);
  }
  return false;
}

function stagger(f, seconds) {
  f.state = 'stunned';
  f.stun = f.stunDuration = seconds;
  f.timer = 0;
  f.attack = null;
  f.buffered = null;
  f.guardStart = 0;
}

export function strikes(f) {
  if (f.state !== 'attack' || f.hit) return false;
  const a = attacks[f.attack];
  return f.timer >= a.windup && f.timer < a.windup + a.active;
}

export function inStrikeRange(attacker, defender) {
  if (!strikes(attacker)) return false;
  const dx = defender.x - attacker.x, dz = defender.z - attacker.z;
  const distance = Math.hypot(dx, dz);
  const facing = dx * Math.sin(attacker.angle) + dz * Math.cos(attacker.angle);
  return distance <= attacks[attacker.attack].range && facing >= distance * 0.38;
}

export function resolveClash(a, b) {
  for (const f of [a, b]) {
    spend(f, 8, 0.42);
    stagger(f, 0.35);
  }
}

export function resolve(attacker, defender) {
  if (!inStrikeRange(attacker, defender)) return null;
  const a = attacks[attacker.attack];
  const dx = defender.x - attacker.x, dz = defender.z - attacker.z;
  const distance = Math.hypot(dx, dz);
  attacker.hit = true;
  if (defender.state === 'dodge' && defender.timer >= 0.02 && defender.timer <= 0.27) return { type: 'evade' };
  const frontal = -dx * Math.sin(defender.angle) - dz * Math.cos(defender.angle) >= distance * 0.35;
  if (defender.state === 'block' && frontal) {
    if (defender.guardStart > 0) {
      defender.guardStart = 0;
      defender.riposte = 1.2;
      stagger(attacker, 0.95);
      return { type: 'parry' };
    }
    spend(defender, a.guard, 0.65);
    if (defender.stamina === 0) {
      stagger(defender, 1.03);
      const damage = Math.min(8, defender.hp);
      defender.hp -= damage;
      return { type: 'break', damage };
    }
    return { type: 'block' };
  }
  const type = attacker.attack === 'riposte' ? 'riposte' : 'hit';
  const damage = Math.min(a.damage, defender.hp);
  defender.hp -= damage;
  stagger(defender, attacker.attack === 'heavy' ? 0.49 : 0.29);
  return { type, damage };
}

export function face(f, opponent) {
  f.angle = Math.atan2(opponent.x - f.x, opponent.z - f.z);
}

function clampToArena(f) {
  const distance = Math.hypot(f.x, f.z);
  if (distance > ARENA_RADIUS) {
    f.x *= ARENA_RADIUS / distance;
    f.z *= ARENA_RADIUS / distance;
  }
}

export function constrain(a, b) {
  for (const f of [a, b]) clampToArena(f);
  const dx = b.x - a.x, dz = b.z - a.z;
  const distance = Math.hypot(dx, dz);
  const separation = 1.27;
  if (distance >= separation) return;
  const x = distance > 0.001 ? dx / distance : Math.sin(a.angle);
  const z = distance > 0.001 ? dz / distance : Math.cos(a.angle);
  const overlap = separation - distance;
  const aSpace = spaceToEdge(a, -x, -z);
  const bSpace = spaceToEdge(b, x, z);
  const shiftA = Math.min(aSpace, Math.max(overlap / 2, overlap - bSpace));
  const shiftB = Math.min(bSpace, overlap - shiftA);
  a.x -= x * shiftA;
  a.z -= z * shiftA;
  b.x += x * shiftB;
  b.z += z * shiftB;
}

function spaceToEdge(f, x, z) {
  const along = f.x * x + f.z * z;
  const inside = ARENA_RADIUS * ARENA_RADIUS - f.x * f.x - f.z * f.z;
  return Math.max(0, Math.sqrt(Math.max(0, along * along + inside)) - along);
}
