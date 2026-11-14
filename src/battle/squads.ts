import { MAP_HALF_SIZE, type War, type Unit } from './war';

/** Up to five groups: slot 0 is the main army, slots 1–4 are independent squads. */
export const SQUAD_NAMES = ['주력군', '기동대', '수비대', '돌격대', '정찰대'] as const;
export const SQUAD_COUNT = 5;
export const SQUAD_COLORS = ['#5ee3ca', '#f8e09c', '#e0b5fa', '#9fd3ff', '#ffb38a'] as const;
export type SquadId = 0 | 1 | 2 | 3 | 4;
export type IndependentSquadId = Exclude<SquadId, 0>;
/** One slot per squad; a null slot means the squad holds its last position. */
export type SquadOrders = [SquadCommand | null, SquadCommand | null, SquadCommand | null, SquadCommand | null, SquadCommand | null];
export const isSquadId = (value: unknown): value is SquadId =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < SQUAD_COUNT;
export type SquadCommand =
  | { kind: 'move'; x: number; z: number }
  | { kind: 'home' }
  | { kind: 'outpost'; id: number }
  | { kind: 'faction'; id: number };

export const squadOf = (unit: Pick<Unit, 'squad'>): SquadId =>
  isSquadId(unit.squad) ? unit.squad : 0;

export const isIndependent = (squad: unknown): squad is IndependentSquadId =>
  isSquadId(squad) && squad !== 0;

export function squadUnits(w: War, squad: SquadId): Unit[] {
  return w.units.filter(unit => unit.owner === 0 && unit.hp > 0 && squadOf(unit) === squad);
}

/** Transfer up to three available troops from the main army to an independent squad. */
export function assignSquad(w: War, squad: SquadId, amount = 3): number {
  if (!isIndependent(squad) || w.over || !w.factions[0].alive ||
      !Number.isInteger(amount) || amount < 1 || amount > (w.grandBattle ? 100 : 18)) return 0;
  const source = squadUnits(w, 0).sort((a, b) => a.id - b.id);
  const selected = source.slice(0, amount);
  for (const unit of selected) unit.squad = squad;
  return selected.length;
}

/** Rejoin the main army, including troops whose independent orders have not completed. */
export function dismissSquad(w: War, squad: SquadId): number {
  if (!isIndependent(squad) || w.over) return 0;
  const units = squadUnits(w, squad);
  for (const unit of units) unit.squad = 0;
  if (w.squadOrders) w.squadOrders[squad] = null;
  return units.length;
}

/** Validate commands before storing them: map-clicks cannot send troops outside the world. */
export function commandSquad(w: War, squad: SquadId, command: SquadCommand): boolean {
  if (w.over || !w.factions[0].alive || !isSquadId(squad) ||
      squadUnits(w, squad).length === 0) return false;
  if (command.kind === 'move' &&
      (!Number.isFinite(command.x) || !Number.isFinite(command.z) ||
       Math.abs(command.x) > MAP_HALF_SIZE - 5 || Math.abs(command.z) > MAP_HALF_SIZE - 5)) return false;
  if (command.kind === 'outpost' &&
      (!Number.isInteger(command.id) || !w.outposts[command.id])) return false;
  if (command.kind === 'faction' &&
      (!Number.isInteger(command.id) || command.id === 0 || !w.factions[command.id]?.alive)) return false;
  w.squadOrders ??= [null, null, null, null, null];
  w.squadOrders[squad] = command;
  return true;
}

export function squadDestination(w: War, squad: SquadId): { x: number; z: number } | null {
  const command = w.squadOrders?.[squad];
  if (!command) return null;
  if (command.kind === 'move') return { x: command.x, z: command.z };
  if (command.kind === 'home') return { x: w.factions[0].x, z: w.factions[0].z };
  const objective = command.kind === 'outpost' ? w.outposts[command.id] : w.factions[command.id];
  return objective ? { x: objective.x, z: objective.z } : null;
}

export function squadOrderLabel(w: War, squad: SquadId): string {
  const order = w.squadOrders?.[squad];
  if (!order) return squad === 0 ? '기본 작전' : '본부 대기';
  return order.kind === 'home' ? '본부 복귀' : order.kind === 'move' ? '지정 위치 이동' :
    order.kind === 'outpost' ? '거점 확보' : '적 본부 공격';
}
