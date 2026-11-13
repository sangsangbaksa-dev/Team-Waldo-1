/** Serializable battle state. Runtime indexes live outside this model. */
import type { SquadCommand } from './squads';
import type { BaseState } from './base';

export type Upgrade = 'farm' | 'mine' | 'barracks' | 'fort';
export type EconomyPolicy = 'balanced' | 'growth' | 'war';
export type UnitKind = 'infantry' | 'archer' | 'guardian' | 'cavalry';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Research = 'weapons' | 'armor' | 'logistics';
export interface Faction {
  id: number; x: number; z: number; hp: number; maxHp: number;
  gold: number; food: number; farm: number; mine: number; barracks: number; fort: number;
  alive: boolean; target: number | null; rally: number | null;
  reserve: number; policy: EconomyPolicy;
  research: Record<Research, number>;
  aiTimer: number; turretCooldown: number;
}
export interface Unit {
  id: number; owner: number; kind: UnitKind; x: number; z: number;
  hp: number; cooldown: number; squad?: 0 | 1 | 2;
}
export interface Outpost {
  id: number; x: number; z: number; owner: number | null;
  contender: number | null; progress: number;
}
export interface WarEvent { time: number; text: string; }
/** Starting troops and starting resources are not counted as purchases or income. */
export interface WarStats {
  trained: number; kills: number; lost: number; captures: number;
  goldEarned: number; foodEarned: number; damageDealt: number;
  researches: number; upgrades: number; peakArmy: number;
}
export interface War {
  factions: Faction[]; units: Unit[]; outposts: Outpost[]; events: WarEvent[];
  time: number; zone: number; over: boolean; winner: number | null; nextUnit: number;
  difficulty: Difficulty; stats: WarStats[];
  squadOrders?: [SquadCommand | null, SquadCommand | null, SquadCommand | null];
  /** Grand battle preserves original skirmish rules for existing saves. */
  grandBattle?: boolean;
  /** Player's home-base layout and hired generals; legacy saves initialize on load. */
  base?: BaseState;
}
