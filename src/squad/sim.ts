import { UNITS, type UnitType } from './units';
export type Side = 0 | 1;
export interface Placement { type: UnitType; x: number; y: number }
export interface Soldier extends Placement { id: number; side: Side; hp: number; cooldown: number; kills: number; damage: number }
export interface Effect { x: number; y: number; x2: number; y2: number; value: number; side: Side; kind: 'hit' | 'heal' | 'siege' | 'death'; age: number }
// Math.hypot 은 엔진마다 마지막 자리가 다를 수 있어, 온라인 대전의 결정성을 위해 sqrt 로 직접 계산합니다.
const hyp = (a: number, b: number): number => Math.sqrt(a * a + b * b);
export const STEP = 1 / 30;
export const BUDGET = 1000;
export function validArmy(army: Placement[], side: Side): boolean {
  const cells = new Set<string>(); let cost = 0;
  for (const p of army) {
    if (!UNITS[p.type] || !Number.isInteger(p.x) || !Number.isInteger(p.y) || p.y < (side ? 0 : 10) || p.y >= (side ? 10 : 20) || p.x < 0 || p.x >= 12) return false;
    const key = `${p.x},${p.y}`; if (cells.has(key)) return false; cells.add(key); cost += UNITS[p.type].cost;
  }
  return cost <= BUDGET;
}
export class Battle {
  units: Soldier[]; effects: Effect[] = []; tick = 0; winner: Side | 'draw' | null = null; seed: number;
  constructor(blue: Placement[], red: Placement[], seed = 1) {
    if (!validArmy(blue, 0) || !validArmy(red, 1) || !blue.length || !red.length) throw new Error('Invalid army');
    this.seed = seed >>> 0;
    this.units = [blue, red].flatMap((army, side) => army.map((p, i) => ({ ...p, x: p.x + 0.5, y: p.y + 0.5, id: side * 100 + i, side: side as Side, hp: UNITS[p.type].hp, cooldown: 0, kills: 0, damage: 0 })));
  }
  random(): number { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  step(): void {
    if (this.winner !== null) return;
    this.tick++; this.effects.forEach(e => e.age += STEP); this.effects = this.effects.filter(e => e.age < 0.7);
    const alive = this.units.filter(u => u.hp > 0);
    for (const u of alive) {
      if (u.hp <= 0) continue;
      const d = UNITS[u.type]; u.cooldown -= STEP;
      // Find the nearest target in one pass rather than allocating and sorting
      // enemy/ally arrays for every soldier on every simulation tick.
      let target: Soldier | undefined, healing = false;
      let nearestEnemy = Infinity, nearestAlly = Infinity;
      let wounded: Soldier | undefined;
      for (const v of alive) {
        if (v.hp <= 0) continue;
        const dx = v.x - u.x, dy = v.y - u.y, distance2 = dx * dx + dy * dy;
        if (v.side !== u.side) {
          if (distance2 < nearestEnemy || (distance2 === nearestEnemy && v.id < (target?.id ?? Infinity))) {
            nearestEnemy = distance2; target = v;
          }
        } else if (u.type === 'medic' && v !== u && v.hp < UNITS[v.type].hp) {
          if (distance2 < nearestAlly || (distance2 === nearestAlly && v.id < (wounded?.id ?? Infinity))) {
            nearestAlly = distance2; wounded = v;
          }
        }
      }
      if (!target) continue;
      if (wounded) { target = wounded; healing = true; }
      const dist = (v: Soldier) => hyp(v.x - u.x, v.y - u.y);
      const distance = dist(target), desired = healing ? 2.2 : d.range;
      if (distance <= desired && u.cooldown <= 0) {
        u.cooldown = d.cooldown;
        if (healing) { const amount = Math.min(24, UNITS[target.type].hp - target.hp); target.hp += amount; this.effects.push({ x: u.x, y: u.y, x2: target.x, y2: target.y, value: amount, side: u.side, kind: 'heal', age: 0 }); }
        else {
          const victims = u.type === 'siege' ? alive.filter(v => v.side !== u.side && v.hp > 0 && hyp(v.x - target.x, v.y - target.y) < 1.3) : [target];
          for (const v of victims) {
            const counter = (u.type === 'guard' && v.type === 'striker') || (u.type === 'striker' && (v.type === 'archer' || v.type === 'siege')) || (u.type === 'archer' && v.type === 'guard');
            const amount = d.damage * (counter ? 1.8 : 1); const dealt = Math.min(v.hp, amount); v.hp -= amount; u.damage += dealt;
            this.effects.push({ x: u.x, y: u.y, x2: v.x, y2: v.y, value: dealt, side: u.side, kind: u.type === 'siege' ? 'siege' : 'hit', age: 0 });
            if (v.hp <= 0) { u.kills++; this.effects.push({ x: v.x, y: v.y, x2: v.x, y2: v.y, value: 0, side: v.side, kind: 'death', age: 0 }); }
          }
        }
      }
      let move = distance > desired * 0.92 ? 1 : ((u.type === 'archer' || u.type === 'siege') && distance < desired * 0.48 ? -1 : 0);
      if (healing && distance < 1.4) move = 0;
      let dx = distance ? (target.x - u.x) / distance * move : 0, dy = distance ? (target.y - u.y) / distance * move : 0;
      for (const other of alive) { if (other === u || other.hp <= 0) continue; const ox = u.x - other.x, oy = u.y - other.y, gap = hyp(ox, oy); if (gap > 0.001 && gap < 0.6) { dx += ox / gap * (0.6 - gap); dy += oy / gap * (0.6 - gap); } }
      u.x = Math.max(0.3, Math.min(11.7, u.x + dx * d.speed * STEP)); u.y = Math.max(0.3, Math.min(19.7, u.y + dy * d.speed * STEP));
    }
    const left = this.units.filter(u => u.side === 0 && u.hp > 0), right = this.units.filter(u => u.side === 1 && u.hp > 0);
    if (!left.length || !right.length || this.tick >= 1800) {
      const ratio = (side: Side) => { const all = this.units.filter(u => u.side === side); return all.reduce((n, u) => n + Math.max(0, u.hp), 0) / all.reduce((n, u) => n + UNITS[u.type].hp, 0); };
      const diff = ratio(0) - ratio(1); this.winner = Math.abs(diff) < 0.001 ? 'draw' : diff > 0 ? 0 : 1;
    }
  }
}
