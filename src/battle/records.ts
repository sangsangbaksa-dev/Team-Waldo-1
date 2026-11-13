import { getMap, isMapId, MAP_IDS, type MapId } from './maps';
import { CONTRACTS, validOperationsState } from './operations';
import type { Difficulty, War } from './war';

export const EXPEDITION_RECORDS_KEY = 'waldo.expeditions.v1';
export const MAX_EXPEDITION_RECORDS = 20;
export type AchievementId = 'first-expedition' | 'first-victory' | 'three-frontiers' | 'grand-victory'
  | 'all-contracts' | 'veteran' | 'field-support' | 'supply-master';

export interface ExpeditionRecord {
  id: string;
  recordedAt: number;
  mapId: MapId;
  difficulty: Difficulty;
  grandBattle: boolean;
  victory: boolean;
  seconds: number;
  kills: number;
  lost: number;
  trained: number;
  captures: number;
  researches: number;
  goldEarned: number;
  peakArmy: number;
  contractsCompleted: number;
  contractsTotal: number;
  supportUses: number;
}
export interface ExpeditionTotals {
  matches: number;
  wins: number;
  losses: number;
  kills: number;
  captures: number;
  contractsCompleted: number;
  supportUses: number;
  grandWins: number;
  contractSweeps: number;
  bestSurvival: number;
  bestKills: number;
  mapWins: Record<MapId, number>;
}
export interface ExpeditionRecords {
  version: 1;
  records: ExpeditionRecord[];
  totals: ExpeditionTotals;
  unlockedAt: Record<AchievementId, number | null>;
}
export interface AchievementDefinition {
  id: AchievementId;
  title: string;
  description: string;
  symbol: string;
  target: number;
}
export interface AchievementStatus extends AchievementDefinition {
  current: number;
  unlocked: boolean;
  unlockedAt: number | null;
}

/** Badges record accomplishments only; they never change combat or grant resources. */
export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: 'first-expedition', title: '첫 원정의 기록', description: '새 기록실에서 첫 전투를 마치세요.', symbol: 'flag', target: 1 },
  { id: 'first-victory', title: '승전의 깃발', description: '한 번의 원정에서 마지막 생존 왕국이 되세요.', symbol: 'crown', target: 1 },
  { id: 'three-frontiers', title: '세 전장의 정복자', description: '강철 분지·황혼 변경·서리 대륙에서 각각 승리하세요.', symbol: 'map', target: 3 },
  { id: 'grand-victory', title: '군단의 지휘관', description: '100 대 500 대규모 전쟁에서 승리하세요.', symbol: 'army', target: 1 },
  { id: 'all-contracts', title: '완벽한 보급 작전', description: '한 원정에서 모든 계약의 보상을 수령하세요.', symbol: 'check', target: 1 },
  { id: 'veteran', title: '노련한 원정가', description: '전투 10회를 마치세요. 승패와 관계없이 집계합니다.', symbol: 'shield', target: 10 },
  { id: 'field-support', title: '전술 지원 전문가', description: '완료한 원정에서 전장 지원을 누적 20회 사용하세요.', symbol: 'bolt', target: 20 },
  { id: 'supply-master', title: '보급로의 주인', description: '완료한 원정에서 거점을 누적 50회 점령하세요.', symbol: 'target', target: 50 },
];

const achievementIds = ACHIEVEMENTS.map(achievement => achievement.id);
const recordedWorlds = new WeakSet<War>();
let sequence = 0;

function emptyRecords(): ExpeditionRecords {
  return { version: 1, records: [],
    totals: { matches: 0, wins: 0, losses: 0, kills: 0, captures: 0, contractsCompleted: 0, supportUses: 0,
      grandWins: 0, contractSweeps: 0, bestSurvival: 0, bestKills: 0, mapWins: { classic: 0, frontier: 0, continental: 0 } },
    unlockedAt: Object.fromEntries(achievementIds.map(id => [id, null])) as Record<AchievementId, null> };
}

function progress(totals: ExpeditionTotals, id: AchievementId): number {
  switch (id) {
    case 'first-expedition': case 'veteran': return totals.matches;
    case 'first-victory': return totals.wins;
    case 'three-frontiers': return MAP_IDS.filter(mapId => totals.mapWins[mapId] > 0).length;
    case 'grand-victory': return totals.grandWins;
    case 'all-contracts': return totals.contractSweeps;
    case 'field-support': return totals.supportUses;
    case 'supply-master': return totals.captures;
  }
}

export function expeditionAchievements(archive: ExpeditionRecords): AchievementStatus[] {
  return ACHIEVEMENTS.map(achievement => ({ ...achievement,
    current: Math.min(achievement.target, progress(archive.totals, achievement.id)),
    unlocked: archive.unlockedAt[achievement.id] !== null,
    unlockedAt: archive.unlockedAt[achievement.id] }));
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown, min = 0, max = 1e12): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const timestamp = (value: unknown): value is number => integer(value, 0, 8640000000000000);
const difficulty = (value: unknown): value is Difficulty => value === 'easy' || value === 'normal' || value === 'hard';

function validRecord(value: unknown): value is ExpeditionRecord {
  if (!record(value) || typeof value.id !== 'string' || !/^[a-zA-Z0-9-]{1,96}$/.test(value.id) ||
    !timestamp(value.recordedAt) || !isMapId(value.mapId) || !difficulty(value.difficulty) ||
    typeof value.grandBattle !== 'boolean' || typeof value.victory !== 'boolean' ||
    !integer(value.seconds, 0, 86400) || !integer(value.peakArmy, 0, 400) ||
    !integer(value.contractsTotal, 1, 100) || !integer(value.contractsCompleted, 0, Number(value.contractsTotal))) return false;
  return ['kills', 'lost', 'trained', 'captures', 'researches', 'supportUses'].every(key => integer(value[key], 0, 1e7)) &&
    integer(value.goldEarned, 0, 1e12);
}

/** Bounded, internally consistent data only; stored names or HTML are never trusted. */
export function decodeExpeditionRecords(raw: string | null): ExpeditionRecords {
  const fallback = emptyRecords();
  if (!raw || raw.length > 120000) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.version !== 1 || !Array.isArray(value.records) || value.records.length > MAX_EXPEDITION_RECORDS ||
      !value.records.every(validRecord) || !record(value.totals) || !record(value.unlockedAt)) return fallback;
    const history = value.records;
    if (new Set(history.map(item => item.id)).size !== history.length) return fallback;
    const totals = value.totals;
    if (!['matches', 'wins', 'losses', 'kills', 'captures', 'contractsCompleted', 'supportUses', 'grandWins',
      'contractSweeps', 'bestSurvival', 'bestKills'].every(key => integer(totals[key])) || !record(totals.mapWins) ||
      !MAP_IDS.every(mapId => integer(totals.mapWins && (totals.mapWins as Record<string, unknown>)[mapId])) ||
      totals.matches !== Number(totals.wins) + Number(totals.losses) || history.length !== Math.min(Number(totals.matches), MAX_EXPEDITION_RECORDS) ||
      Number(totals.grandWins) > Number(totals.wins) || Number(totals.contractSweeps) > Number(totals.matches) ||
      Number(totals.bestSurvival) > 86400 || Number(totals.bestKills) > 1e7 ||
      MAP_IDS.reduce((sum, mapId) => sum + Number((totals.mapWins as Record<string, unknown>)[mapId]), 0) !== totals.wins) return fallback;
    const sum = (key: 'kills' | 'captures' | 'contractsCompleted' | 'supportUses') => history.reduce((total, item) => total + item[key], 0);
    if (['kills', 'captures', 'contractsCompleted', 'supportUses'].some(key => Number(totals[key]) < sum(key as 'kills' | 'captures' | 'contractsCompleted' | 'supportUses')) ||
      Number(totals.wins) < history.filter(item => item.victory).length ||
      Number(totals.losses) < history.filter(item => !item.victory).length ||
      Number(totals.grandWins) < history.filter(item => item.victory && item.grandBattle).length ||
      Number(totals.contractSweeps) < history.filter(item => item.contractsCompleted === item.contractsTotal).length ||
      Number(totals.bestSurvival) < Math.max(0, ...history.map(item => item.seconds)) ||
      Number(totals.bestKills) < Math.max(0, ...history.map(item => item.kills)) ||
      MAP_IDS.some(mapId => Number((totals.mapWins as Record<string, unknown>)[mapId]) < history.filter(item => item.victory && item.mapId === mapId).length)) return fallback;
    const typedTotals = totals as unknown as ExpeditionTotals;
    for (const achievement of ACHIEVEMENTS) {
      const unlocked = value.unlockedAt[achievement.id];
      const earned = progress(typedTotals, achievement.id) >= achievement.target;
      if (earned ? !timestamp(unlocked) : unlocked !== null) return fallback;
    }
    return value as unknown as ExpeditionRecords;
  } catch { return fallback; }
}

/** Legacy career counters are intentionally not read, guessed, or rewritten. */
export function readExpeditionRecords(): ExpeditionRecords {
  try { return decodeExpeditionRecords(localStorage.getItem(EXPEDITION_RECORDS_KEY)); }
  catch { return emptyRecords(); }
}

function makeRecord(w: War): ExpeditionRecord | null {
  const player = w.factions[0];
  if (!player || !(w.over || !player.alive) || w.over && w.winner === 0 && !player.alive ||
    !difficulty(w.difficulty) || w.mapId !== undefined && !isMapId(w.mapId) || !Number.isFinite(w.time) || w.time < 0 || w.time > 86400 ||
    w.operations && !validOperationsState(w.operations, w)) return null;
  // A winner can only be the sole living kingdom. Player elimination may end
  // the player's session while the remaining AI kingdoms are still alive.
  const survivors = w.factions.filter(faction => faction.alive);
  if (w.over && (survivors.length > 1 || w.winner !== (survivors[0]?.id ?? null)) ||
    !player.alive && player.hp > 0 || player.alive && player.hp <= 0) return null;
  const stats = w.stats[0];
  if (!stats) return null;
  const recordedAt = Date.now();
  const entry: ExpeditionRecord = {
    id: `expedition-${recordedAt.toString(36)}-${(++sequence).toString(36)}`,
    recordedAt, mapId: getMap(w.mapId).id, difficulty: w.difficulty, grandBattle: w.grandBattle === true,
    victory: w.over && w.winner === 0, seconds: Math.floor(w.time),
    kills: stats.kills, lost: stats.lost, trained: stats.trained, captures: stats.captures,
    researches: stats.researches, goldEarned: Math.floor(stats.goldEarned), peakArmy: stats.peakArmy,
    contractsCompleted: w.operations?.claimed.length ?? 0, contractsTotal: CONTRACTS.length,
    supportUses: w.operations?.supportUses ?? 0,
  };
  return validRecord(entry) ? entry : null;
}

/** Persist one completed expedition atomically. A failed write never blocks play. */
export function recordExpedition(w: War): boolean {
  if (recordedWorlds.has(w)) return false;
  try {
    const entry = makeRecord(w);
    if (!entry) return false;
    // Read failure is different from malformed data: never overwrite records
    // that this browser refused to let us inspect.
    const archive = decodeExpeditionRecords(localStorage.getItem(EXPEDITION_RECORDS_KEY));
    while (archive.records.some(record => record.id === entry.id)) {
      entry.id = `expedition-${entry.recordedAt.toString(36)}-${(++sequence).toString(36)}`;
    }
    const totals = archive.totals;
    totals.matches++; totals.wins += Number(entry.victory); totals.losses += Number(!entry.victory);
    totals.kills += entry.kills; totals.captures += entry.captures;
    totals.contractsCompleted += entry.contractsCompleted; totals.supportUses += entry.supportUses;
    totals.grandWins += Number(entry.victory && entry.grandBattle);
    totals.contractSweeps += Number(entry.contractsCompleted === entry.contractsTotal);
    totals.bestSurvival = Math.max(totals.bestSurvival, entry.seconds);
    totals.bestKills = Math.max(totals.bestKills, entry.kills);
    if (entry.victory) totals.mapWins[entry.mapId]++;
    for (const achievement of ACHIEVEMENTS) {
      if (archive.unlockedAt[achievement.id] === null && progress(totals, achievement.id) >= achievement.target) {
        archive.unlockedAt[achievement.id] = entry.recordedAt;
      }
    }
    archive.records.unshift(entry);
    archive.records.length = Math.min(archive.records.length, MAX_EXPEDITION_RECORDS);
    const encoded = JSON.stringify(archive);
    if (decodeExpeditionRecords(encoded).totals.matches !== archive.totals.matches) return false;
    localStorage.setItem(EXPEDITION_RECORDS_KEY, encoded);
    recordedWorlds.add(w);
    return true;
  } catch { return false; }
}
