import { UNIT_STATS, type Unit, type War } from './war';
import { squadOf, type SquadId } from './squads';

/** Optional field on War so saves from the original campaign can be upgraded. */
export interface OperationsState {
  claimed: ContractId[];
  readyAt: Record<SupportId, number>;
  effects: SupportEffect[];
  supportUses: number;
}

export type ContractId =
  | 'foundation' | 'recruits' | 'first-banner' | 'research'
  | 'combined-arms' | 'commanders' | 'supply-network' | 'stronghold' | 'conqueror';
export type SupportId = 'medical' | 'march' | 'shield';
export type OperationsFocus = 'economy' | 'army' | 'orders' | 'research' | 'base';
export interface Resources { gold: number; food: number; }
export interface ContractDefinition {
  id: ContractId;
  title: string;
  description: string;
  focus: OperationsFocus;
  reward: Resources;
}
export interface ContractStatus extends ContractDefinition {
  current: number;
  target: number;
  progress: number;
  ready: boolean;
  claimed: boolean;
  reward: Resources;
}
export interface SupportDefinition {
  id: SupportId;
  title: string;
  description: string;
  cost: Resources;
  cooldown: number;
  duration: number;
}
export interface SupportEffect {
  kind: 'march' | 'shield';
  squad: SquadId;
  startedAt: number;
  expiresAt: number;
}
export interface SupportStatus extends SupportDefinition {
  available: boolean;
  reason: string;
  remaining: number;
  activeFor: number;
  affected: number;
}

/** Objectives are evaluated from the actual simulation, never from button clicks. */
export const CONTRACTS: readonly ContractDefinition[] = [
  { id: 'foundation', title: '자립하는 영지', description: '금광과 농장을 모두 Lv.2로 강화하세요.', focus: 'economy', reward: { gold: 55, food: 40 } },
  { id: 'recruits', title: '새로운 선봉대', description: '새 병력을 훈련해 원정대를 보강하세요.', focus: 'army', reward: { gold: 55, food: 45 } },
  { id: 'first-banner', title: '첫 번째 깃발', description: '전략 거점 1개를 아군 영토로 확보하세요.', focus: 'orders', reward: { gold: 75, food: 55 } },
  { id: 'research', title: '기술의 힘', description: '왕국 연구소에서 첫 기술 연구를 완료하세요.', focus: 'research', reward: { gold: 65, food: 55 } },
  { id: 'combined-arms', title: '함께 싸우는 군단', description: '살아 있는 아군에 3종 이상의 병종을 편성하세요.', focus: 'army', reward: { gold: 85, food: 65 } },
  { id: 'commanders', title: '지휘관의 깃발', description: '기지 관리에서 장군 1명을 모집하세요.', focus: 'base', reward: { gold: 80, food: 65 } },
  { id: 'supply-network', title: '이어지는 보급로', description: '전략 거점 3개를 동시에 보유하세요.', focus: 'orders', reward: { gold: 120, food: 100 } },
  { id: 'stronghold', title: '흔들리지 않는 본부', description: '본부 방어를 Lv.3까지 강화하세요.', focus: 'economy', reward: { gold: 100, food: 75 } },
  { id: 'conqueror', title: '새로운 패권', description: '적 왕국 1개가 함락될 때까지 살아남으세요.', focus: 'orders', reward: { gold: 180, food: 140 } },
];

export const SUPPORTS: readonly SupportDefinition[] = [
  { id: 'medical', title: '야전 치료', description: '선택 부대의 생존 병력을 최대 체력의 35%만큼 즉시 회복합니다.', cost: { gold: 55, food: 45 }, cooldown: 45, duration: 0 },
  { id: 'march', title: '강행군', description: '14초 동안 선택 부대의 이동 속도를 40% 높입니다.', cost: { gold: 45, food: 35 }, cooldown: 50, duration: 14 },
  { id: 'shield', title: '방어 진형', description: '14초 동안 선택 부대가 받는 전투 피해를 30% 줄입니다. 폭풍은 막지 못합니다.', cost: { gold: 65, food: 45 }, cooldown: 60, duration: 14 },
];

const contractById = new Map(CONTRACTS.map(definition => [definition.id, definition]));
const supportById = new Map(SUPPORTS.map(definition => [definition.id, definition]));
type WarWithOperations = War & { operations?: OperationsState };
const validSquad = (value: number): value is SquadId => value === 0 || value === 1 || value === 2;
const livingPlayer = (w: War): boolean => !w.over && Boolean(w.factions[0]?.alive && w.factions[0].hp > 0);

export function createOperationsState(): OperationsState {
  return { claimed: [], readyAt: { medical: 0, march: 0, shield: 0 }, effects: [], supportUses: 0 };
}

export function getOperationsState(w: War): OperationsState {
  const world = w as WarWithOperations;
  world.operations ??= createOperationsState();
  return world.operations;
}

/** Grand battles reward and charge three times as much; the rules stay the same. */
function scaled(w: War, value: Resources): Resources {
  const multiplier = w.grandBattle ? 3 : 1;
  return { gold: value.gold * multiplier, food: value.food * multiplier };
}

function contractValues(w: War, id: ContractId): { current: number; target: number } {
  const faction = w.factions[0];
  switch (id) {
    case 'foundation': return { current: Number(faction.mine >= 2) + Number(faction.farm >= 2), target: 2 };
    case 'recruits': return { current: w.stats[0].trained, target: w.grandBattle ? 25 : 4 };
    case 'first-banner': return { current: w.outposts.filter(post => post.owner === 0).length, target: 1 };
    case 'research': return { current: w.stats[0].researches, target: 1 };
    case 'combined-arms': return { current: new Set(w.units.filter(unit => unit.owner === 0 && unit.hp > 0).map(unit => unit.kind)).size, target: 3 };
    case 'commanders': return { current: w.base?.generals.length ?? 0, target: 1 };
    case 'supply-network': return { current: w.outposts.filter(post => post.owner === 0).length, target: 3 };
    case 'stronghold': return { current: faction.fort, target: 3 };
    case 'conqueror': return { current: w.factions.slice(1).filter(enemy => !enemy.alive).length, target: 1 };
  }
}

/** Returning immutable status records keeps rendering separate from claiming rewards. */
export function listContracts(w: War): ContractStatus[] {
  const claimed = new Set(getOperationsState(w).claimed);
  return CONTRACTS.map(definition => {
    const { current, target } = contractValues(w, definition.id);
    const complete = claimed.has(definition.id);
    return { ...definition, reward: scaled(w, definition.reward), current: Math.min(current, target), target,
      progress: complete ? 1 : Math.min(1, Math.max(0, current / target)),
      ready: livingPlayer(w) && !complete && current >= target, claimed: complete };
  });
}

export function contractProgress(w: War, id: ContractId): ContractStatus | null {
  if (!contractById.has(id)) return null;
  return listContracts(w).find(contract => contract.id === id) ?? null;
}

function announce(w: War, message: string): void {
  w.events.unshift({ time: Math.floor(w.time), text: message });
  if (w.events.length > 8) w.events.length = 8;
}

/** Re-evaluate on submission so stale UI or repeated input cannot grant rewards twice. */
export function claimContract(w: War, id: ContractId): boolean {
  if (!livingPlayer(w)) return false;
  const contract = contractProgress(w, id);
  if (!contract?.ready) return false;
  getOperationsState(w).claimed.push(id);
  const faction = w.factions[0];
  faction.gold += contract.reward.gold;
  faction.food += contract.reward.food;
  w.stats[0].goldEarned += contract.reward.gold;
  w.stats[0].foodEarned += contract.reward.food;
  announce(w, `원정 계약 완료 · ${contract.title} · 금 +${contract.reward.gold} / 식량 +${contract.reward.food}`);
  return true;
}

function members(w: War, squad: SquadId): Unit[] {
  return w.units.filter(unit => unit.owner === 0 && unit.hp > 0 && squadOf(unit) === squad);
}

export function supportStatus(w: War, id: SupportId, squad: SquadId): SupportStatus | null {
  const definition = supportById.get(id);
  if (!definition) return null;
  const state = getOperationsState(w), faction = w.factions[0];
  const units = validSquad(squad) ? members(w, squad) : [];
  const affected = id === 'medical' ? units.filter(unit => unit.hp < UNIT_STATS[unit.kind].hp - 1e-6).length : units.length;
  const remaining = Math.max(0, state.readyAt[id] - w.time);
  const activeFor = Math.max(0, ...state.effects.filter(effect => effect.kind === id && effect.squad === squad).map(effect => effect.expiresAt - w.time));
  const cost = scaled(w, definition.cost);
  const reason = !livingPlayer(w) ? '전투가 종료되었습니다' : !validSquad(squad) ? '올바른 부대를 선택하세요' :
    units.length === 0 ? '선택한 부대에 생존 병력이 없습니다' : remaining > 1e-6 ? `${Math.ceil(remaining)}초 후 재사용` :
    affected === 0 ? '선택한 부대의 체력이 가득 찼습니다' :
    faction.gold < cost.gold || faction.food < cost.food ? '자원이 부족합니다' : '지원 준비 완료';
  return { ...definition, cost, affected, remaining, activeFor, reason,
    available: livingPlayer(w) && validSquad(squad) && affected > 0 && remaining <= 1e-6 && faction.gold >= cost.gold && faction.food >= cost.food };
}

/** Commands are atomic and use simulation time, so a pause freezes all cooldowns. */
export function useSupport(w: War, id: SupportId, squad: SquadId): boolean {
  const status = supportStatus(w, id, squad);
  if (!status?.available) return false;
  const state = getOperationsState(w), faction = w.factions[0];
  faction.gold -= status.cost.gold;
  faction.food -= status.cost.food;
  state.readyAt[id] = w.time + status.cooldown;
  state.supportUses++;
  state.effects = state.effects.filter(effect => effect.expiresAt > w.time && effect.kind !== id);
  if (id === 'medical') {
    for (const unit of members(w, squad)) {
      const maxHp = UNIT_STATS[unit.kind].hp;
      unit.hp = Math.min(maxHp, unit.hp + maxHp * .35);
    }
  } else {
    state.effects.push({ kind: id, squad, startedAt: w.time, expiresAt: w.time + status.duration });
  }
  const squadNames = ['주력군', '기동대', '수비대'];
  announce(w, `${squadNames[squad]} · ${status.title} 지원${status.duration ? ` (${status.duration}초)` : ''}`);
  return true;
}

/** The simulation multiplies speed by 1+bonus, and combat damage by 1-bonus. */
export function operationsBonus(w: War, unit: Unit, specialty: 'speed' | 'armor'): number {
  if (unit.owner !== 0 || unit.hp <= 0) return 0;
  const state = (w as WarWithOperations).operations;
  if (!state) return 0;
  const kind = specialty === 'speed' ? 'march' : 'shield';
  return state.effects.some(effect => effect.kind === kind && effect.squad === squadOf(unit) && effect.expiresAt > w.time) ?
    specialty === 'speed' ? .4 : .3 : 0;
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Validate user-controlled save fields before they can grant bonuses or free rewards. */
export function validOperationsState(candidate: unknown, w: War): candidate is OperationsState {
  if (!record(candidate) || !Array.isArray(candidate.claimed) || candidate.claimed.length > CONTRACTS.length ||
    !candidate.claimed.every(id => typeof id === 'string' && contractById.has(id as ContractId)) ||
    new Set(candidate.claimed).size !== candidate.claimed.length || !record(candidate.readyAt) ||
    !Array.isArray(candidate.effects) || candidate.effects.length > 2 ||
    !finite(candidate.supportUses, 0, 1e7) || !Number.isInteger(candidate.supportUses)) return false;
  let usedTypes = 0;
  for (const support of SUPPORTS) {
    const readyAt = candidate.readyAt[support.id];
    if (!finite(readyAt, 0, w.time + support.cooldown + 1e-6) || readyAt > 0 && readyAt < support.cooldown) return false;
    if (readyAt > 0) usedTypes++;
  }
  if (candidate.supportUses < usedTypes) return false;
  const kinds = new Set<SupportId>();
  for (const effect of candidate.effects) {
    if (!record(effect) || (effect.kind !== 'march' && effect.kind !== 'shield') ||
      !validSquad(effect.squad as number) || !finite(effect.startedAt, 0, w.time) ||
      !finite(effect.expiresAt, 0, w.time + 14 + 1e-6) ||
      Math.abs(effect.expiresAt - effect.startedAt - 14) > 1e-6 || kinds.has(effect.kind)) return false;
    const support = supportById.get(effect.kind)!;
    if (Math.abs(Number(candidate.readyAt[effect.kind]) - effect.startedAt - support.cooldown) > 1e-6) return false;
    kinds.add(effect.kind);
  }
  return true;
}
