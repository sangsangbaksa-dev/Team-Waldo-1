// OUTLAW CITY — 길거리 범죄 상호작용: 총으로 위협해 지갑 빼앗기, 매장 털기. 소리 없는 신고(경보)가 경찰을 부릅니다.
import type { Sim } from './sim';
import { PLAYER_ID, WEAPONS, wrapAngle, type Ped } from './types';

export interface Store { x: number; z: number; name: string }
interface State { stores: Store[]; mapRef: unknown; cool: Map<number, number>; hold: { index: number; t: number; hp: number } | null; mug: Map<number, number>; done: Set<number>; text: string }
const states = new WeakMap<Sim, State>();
export const HOLDUP_SECONDS = 3.5, MUG_SECONDS = 1.4, STORE_COOLDOWN = 300;
const NAMES: Record<string, string> = { kiosk: '가판 매장', newsstand: '신문 가판대', food_cart: '푸드 카트' };

function state(sim: Sim): State {
  let s = states.get(sim);
  if (s && s.mapRef === sim.map) return s;
  // 매장은 가판·가판대·푸드 카트 중 서로 80m 이상 떨어진 것만 씁니다.
  const stores: Store[] = [];
  for (const p of sim.map.props) {
    if (p.kind !== 'kiosk' && p.kind !== 'newsstand' && p.kind !== 'food_cart') continue;
    if (stores.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 80)) continue;
    stores.push({ x: p.x, z: p.z, name: NAMES[p.kind] ?? '매장' });
  }
  s = { stores, mapRef: sim.map, cool: new Map(), hold: null, mug: new Map(), done: new Set(), text: '' }; states.set(sim, s); return s;
}
export const stores = (sim: Sim): Store[] => state(sim).stores;
const armed = (sim: Sim): boolean => { const g = sim.curGun(sim.player); return !!g && !WEAPONS[g.id].melee && g.mag > 0; };

export interface HoldupOffer { index: number; store: Store; ok: boolean; why: string }
/** 가까운 매장과 지금 털 수 있는지 */
export function holdupOffer(sim: Sim): HoldupOffer | null {
  const s = state(sim), p = sim.player; if (!p.alive || p.vehicle || sim.downKind || s.hold) return null;
  let best = -1, bd = 4.5;
  s.stores.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = i; } });
  if (best < 0) return null;
  const store = s.stores[best]!, cd = (s.cool.get(best) ?? 0) - sim.t;
  let why = '';
  if (cd > 0) why = '금전 등록기가 비어 있습니다';
  else if (sim.mission.active || sim.job.active || sim.activity.active) why = '진행 중인 일을 먼저 끝내세요';
  else if (!armed(sim)) why = '총을 꺼내 들어야 합니다';
  return { index: best, store, ok: !why, why };
}
export function startHoldup(sim: Sim, index: number): string {
  const s = state(sim), o = holdupOffer(sim); if (!o || o.index !== index) return '매장 앞에서만 할 수 있습니다'; if (!o.ok) return o.why;
  s.hold = { index, t: 0, hp: sim.player.hp + sim.player.armor }; sim.say('“손 들어! 금전 등록기를 열어!”', 2.5); return '';
}
export const holdupText = (sim: Sim): string => state(sim).text;
export const holdupActive = (sim: Sim): boolean => !!state(sim).hold;

function fail(sim: Sim, s: State, why: string): void { s.hold = null; s.text = ''; sim.say(why, 2.5); }
function scare(sim: Sim, x: number, z: number): void {
  for (const q of sim.peds) if (q.alive && q.team === 'civ' && !q.keep && !q.vehicle && Math.hypot(q.x - x, q.z - z) < 28) { q.mode = 'flee'; q.fear = 1; q.timer = 8; const a = Math.atan2(q.z - z, q.x - x); q.tx = q.x + Math.cos(a) * 40; q.tz = q.z + Math.sin(a) * 40; }
}

function stepHoldup(sim: Sim, s: State, dt: number): void {
  const h = s.hold!, p = sim.player, st = s.stores[h.index]!;
  if (!p.alive || sim.downKind) { fail(sim, s, '강도 실패'); return; }
  if (p.vehicle || Math.hypot(st.x - p.x, st.z - p.z) > 8) { fail(sim, s, '자리를 떴습니다 · 강도 실패'); return; }
  if (!armed(sim)) { fail(sim, s, '총을 거뒀습니다 · 강도 실패'); return; }
  if (sim.mission.active || sim.job.active) { fail(sim, s, '강도 중단'); return; }
  if (p.hp + p.armor < h.hp - 25) { fail(sim, s, '반격을 받았습니다 · 강도 실패'); return; }
  h.t += dt; const left = Math.max(0, HOLDUP_SECONDS - h.t);
  s.text = `${st.name} 털기 · ${left.toFixed(1)}초 · 총구를 내리지 마세요`;
  if (h.t < HOLDUP_SECONDS) return;
  const take = Math.round((260 + sim.rng() * 440) * sim.perk.loot);
  sim.addCash(take); sim.count('holdups'); sim.count('robbed', take); s.cool.set(h.index, sim.t + STORE_COOLDOWN); s.hold = null; s.text = '';
  // 점원이 누른 비상벨: 목격자가 없어도 경찰이 알게 됩니다.
  sim.addCrime('robbery', st.x, st.z, PLAYER_ID, 0, 4.2); scare(sim, st.x, st.z);
  sim.say(`금전 등록기 털기 성공 · +$${take.toLocaleString('en-US')} · 경보가 울렸다!`, 3.5);
}

/** 매 틱: 매장 강도 진행과 총구 협박 */
export function stepRobbery(sim: Sim, dt: number): void {
  const s = state(sim), p = sim.player;
  if (s.hold) stepHoldup(sim, s, dt); else if (s.text) s.text = '';
  if (!p.alive || p.vehicle || !p.aiming || !armed(sim) || sim.downKind) { if (s.mug.size) s.mug.clear(); return; }
  const gun = sim.curGun(p); if (!gun) return; let held: Ped | undefined, hd = 15;
  for (const q of sim.peds) {
    if (!q.alive || q.team !== 'civ' || q.kind !== 'civ' || q.vehicle || q.keep || s.done.has(q.id)) continue;
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz); if (d > hd || d < 0.8) continue;
    if (Math.abs(wrapAngle(Math.atan2(dz, dx) - p.yaw)) > 0.28 || !sim.canSee(p.x, p.z, q.x, q.z, p.y + 1.5)) continue;
    held = q; hd = d;
  }
  for (const id of [...s.mug.keys()]) if (id !== held?.id) { const t = (s.mug.get(id) ?? 0) - dt * 2; if (t <= 0) s.mug.delete(id); else s.mug.set(id, t); }
  if (!held) return;
  const t = (s.mug.get(held.id) ?? 0) + dt; s.mug.set(held.id, t);
  held.mode = 'cower'; held.timer = 2; held.input.yaw = Math.atan2(p.z - held.z, p.x - held.x);
  if (t < MUG_SECONDS) return;
  s.mug.delete(held.id); s.done.add(held.id);
  const take = Math.max(25, Math.round(held.loot * 2.2 * sim.perk.loot)); held.loot = 0;
  sim.addCash(take); sim.count('mugs'); sim.say(`지갑을 빼앗았다 +$${take}`, 2);
  sim.addCrime('assault', held.x, held.z, PLAYER_ID, held.id, 0.7);
  held.mode = 'flee'; held.fear = 1; held.timer = 9; const a = Math.atan2(held.z - p.z, held.x - p.x); held.tx = held.x + Math.cos(a) * 45; held.tz = held.z + Math.sin(a) * 45;
  sim.emit({ t: 'scream', id: held.id });
}
