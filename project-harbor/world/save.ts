import { DEPTH, WIDTH } from './domain';
import { PACKAGES } from './exploration';
import { COURSES } from './time-trials';
import { SITES } from './services';
import { MAX_HEALTH, WEAPONS, type Vitals, type WeaponId } from './street';
import type { World } from './application';

export const SAVE_KEY = 'harbor-local-save-v1';
export interface SaveData {
  version: 1; x: number; z: number; yaw: number; hours: number;
  health: number; money: number; weapon: WeaponId | null; magazine: number; reserve: number;
  visited: string[]; collected: string[]; records?: Record<string, number>;
}
interface SaveState {
  world: World; vitals: Vitals; visitedServices: Set<string>; collectedPackages: Set<string>;
  driving: boolean; airborne: boolean; hijack: unknown; trialRecords?: Map<string, number>;
}
const siteIds = new Set(SITES.map(site => site.id));
const packageIds = new Set(PACKAGES.map(item => item.id));
function valid(n: unknown, low: number, high: number): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= low && n <= high;
}
function records(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (value && typeof value === 'object') for (const course of COURSES) {
    const time = (value as Record<string, unknown>)[course.id];
    if (valid(time, 0.01, course.limit - 0.001)) result[course.id] = time;
  }
  return result;
}
function ids(value: unknown, allowed: ReadonlySet<string>): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && allowed.has(id)))] : [];
}
export function parseSave(raw: string): SaveData | null {
  try {
    const d: unknown = JSON.parse(raw);
    if (!d || typeof d !== 'object') return null;
    const v = d as Record<string, unknown>;
    if (v.version !== 1 || !valid(v.x, 2, WIDTH - 2) || !valid(v.z, 2, DEPTH - 2) ||
        !valid(v.yaw, -Math.PI, Math.PI) || !valid(v.hours, 0, 24) ||
        !valid(v.health, 1, MAX_HEALTH) || !valid(v.money, 0, Number.MAX_SAFE_INTEGER)) return null;
    if (v.weapon !== null && v.weapon !== 'pistol' && v.weapon !== 'smg') return null;
    const spec = v.weapon ? WEAPONS[v.weapon] : null;
    if (!valid(v.magazine, 0, spec?.magazine ?? 0) || !valid(v.reserve, 0, (spec?.reserve ?? 0) * 3)) return null;
    return { version: 1, x: v.x, z: v.z, yaw: v.yaw, hours: v.hours % 24, health: v.health,
      money: Math.floor(v.money), weapon: v.weapon, magazine: Math.floor(v.magazine), reserve: Math.floor(v.reserve),
      visited: ids(v.visited, siteIds), collected: ids(v.collected, packageIds), records: records(v.records) };
  } catch { return null; }
}
export function canSave(state: SaveState): boolean {
  return !state.driving && !state.airborne && !state.hijack && state.vitals.wanted === 0 &&
    state.vitals.health >= 1 && state.world.open(state.world.x, state.world.z);
}
export function makeSave(state: SaveState): SaveData | null {
  if (!canSave(state)) return null;
  const { world: w, vitals: v } = state;
  return parseSave(JSON.stringify({ version: 1, x: w.x, z: w.z, yaw: Math.atan2(Math.sin(w.yaw), Math.cos(w.yaw)),
    hours: w.hours, health: v.health, money: v.money, weapon: v.weapon,
    magazine: v.weapon ? Math.min(v.magazine, WEAPONS[v.weapon].magazine) : 0,
    reserve: v.weapon ? Math.min(v.reserve, WEAPONS[v.weapon].reserve * 3) : 0,
    visited: [...state.visitedServices], collected: [...state.collectedPackages], records: Object.fromEntries(state.trialRecords ?? []) }));
}
export function restoreSave(state: SaveState, d: SaveData): boolean {
  if (!state.world.open(d.x, d.z)) return false;
  const w = state.world, v = state.vitals;
  w.x = d.x; w.z = d.z; w.yaw = d.yaw; w.hours = d.hours;
  v.health = d.health; v.money = d.money; v.weapon = d.weapon;
  v.magazine = d.magazine; v.reserve = d.reserve; v.cooldown = 0; v.reload = 0; v.wanted = 0; v.calm = 0;
  state.visitedServices.clear(); d.visited.forEach(id => state.visitedServices.add(id));
  state.collectedPackages.clear(); d.collected.forEach(id => state.collectedPackages.add(id));
  if (state.trialRecords) {
    state.trialRecords.clear();
    for (const [id, time] of Object.entries(d.records ?? {})) state.trialRecords.set(id, time);
  }
  w.stream(12);
  return true;
}
