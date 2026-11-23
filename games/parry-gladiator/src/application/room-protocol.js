export const PROTOCOL_VERSION = 1;
export const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_LENGTH = 5;
export const roomCode = value => typeof value === 'string' ? value.toUpperCase().trim() : '';
export const validRoom = value => typeof value === 'string' && value.length === ROOM_LENGTH && [...value].every(letter => ROOM_ALPHABET.includes(letter));
export const roomActions = new Set(['light', 'heavy', 'block', 'release', 'dodge', 'feint']);

export function readDirection(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.z)) return { x: 0, z: 0 };
  const x = Math.max(-1, Math.min(1, value.x)), z = Math.max(-1, Math.min(1, value.z));
  const divisor = Math.max(1, Math.hypot(x, z));
  return { x: x / divisor, z: z / divisor };
}

const phases = new Set(['ready', 'fight', 'over', 'finished']);
const stances = new Set(['idle', 'block', 'dodge', 'attack', 'feint', 'stunned']);
const strikes = new Set(['light', 'heavy', 'riposte']);
const between = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const score = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;

function validFighter(fighter) {
  return fighter && between(fighter.x, -10, 10) && between(fighter.z, -10, 10)
    && between(fighter.angle, -Math.PI, Math.PI) && between(fighter.hp, 0, 100)
    && between(fighter.stamina, 0, 100) && score(fighter.wins, 2)
    && stances.has(fighter.state) && between(fighter.timer, 0, Number.MAX_SAFE_INTEGER)
    && (fighter.state === 'attack' ? strikes.has(fighter.attack) : fighter.attack === null)
    && ['guardStart', 'stun', 'dodgeX', 'moveX', 'moveZ', 'riposte'].every(key => between(fighter[key], -2, 2));
}

function validStats(stats) {
  return stats && ['damage', 'parries', 'ripostes'].every(key => score(stats[key], 1_000));
}

export function validSnapshot(state) {
  return state && Array.isArray(state.players) && state.players.length === 2 && state.players.every(validFighter)
    && Array.isArray(state.stats) && state.stats.length === 2 && state.stats.every(validStats)
    && phases.has(state.phase) && score(state.round, 3) && state.round >= 1
    && between(state.count, -0.1, 3) && between(state.time, 0, 65)
    && [-1, 0, 1].includes(state.winner) && ['', 'knockout', 'time', 'overtime'].includes(state.reason);
}
