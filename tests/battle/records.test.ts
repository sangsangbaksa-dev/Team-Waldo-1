import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWar, type War } from '../../src/battle/war';
import { CONTRACTS } from '../../src/battle/operations';
import { MAP_IDS, type MapId } from '../../src/battle/maps';
import { ACHIEVEMENTS, EXPEDITION_RECORDS_KEY, MAX_EXPEDITION_RECORDS, decodeExpeditionRecords,
  expeditionAchievements, readExpeditionRecords, recordExpedition, type ExpeditionRecords } from '../../src/battle/records';

const stored = new Map<string, string>();
const storage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value); },
};
function completed(options: { mapId?: MapId; victory?: boolean; grandBattle?: boolean } = {}): War {
  const w = createWar({ mapId: options.mapId, grandBattle: options.grandBattle });
  w.time = 244.7;
  if (options.victory) {
    w.over = true; w.winner = 0;
    for (const faction of w.factions.slice(1)) { faction.hp = 0; faction.alive = false; faction.target = null; faction.rally = null; }
    w.units = w.units.filter(unit => unit.owner === 0);
  } else {
    w.factions[0].hp = 0; w.factions[0].alive = false;
    w.units = w.units.filter(unit => unit.owner !== 0);
  }
  return w;
}

beforeEach(() => {
  stored.clear(); vi.stubGlobal('localStorage', storage);
  vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 13, 6, 10));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('completed expedition archive', () => {
  it('starts empty without importing or altering older career counters', () => {
    const legacy = JSON.stringify({ matches: 80, wins: 40, bestKills: 700, bestSurvival: 500 });
    stored.set('waldo.career.v1', legacy);
    expect(readExpeditionRecords().records).toEqual([]);
    expect(readExpeditionRecords().totals.matches).toBe(0);
    expect(expeditionAchievements(readExpeditionRecords()).every(achievement => !achievement.unlocked)).toBe(true);
    expect(recordExpedition(completed())).toBe(true);
    expect(stored.get('waldo.career.v1')).toBe(legacy);
    expect(readExpeditionRecords().totals.matches).toBe(1);
  });

  it('records actual map, mode, difficulty, outcome and performance while preserving the game state', () => {
    const w = completed({ mapId: 'continental', victory: true, grandBattle: true });
    w.difficulty = 'hard';
    Object.assign(w.stats[0], { kills: 72, lost: 11, trained: 50, captures: 8, researches: 4, goldEarned: 1930.9, peakArmy: 150 });
    w.operations!.supportUses = 3;
    w.operations!.claimed = ['foundation', 'first-banner'];
    const before = JSON.stringify(w);
    expect(recordExpedition(w)).toBe(true);
    const archive = readExpeditionRecords(), entry = archive.records[0];
    expect(entry).toMatchObject({ mapId: 'continental', difficulty: 'hard', grandBattle: true, victory: true,
      seconds: 244, kills: 72, lost: 11, trained: 50, captures: 8, researches: 4, goldEarned: 1930,
      peakArmy: 150, contractsCompleted: 2, contractsTotal: 9, supportUses: 3 });
    expect(archive.totals).toMatchObject({ matches: 1, wins: 1, losses: 0, kills: 72, captures: 8, supportUses: 3,
      grandWins: 1, bestSurvival: 244, bestKills: 72, mapWins: { classic: 0, frontier: 0, continental: 1 } });
    expect(JSON.stringify(w)).toBe(before);
  });

  it('rejects unfinished, internally inconsistent, or malformed game state', () => {
    expect(recordExpedition(createWar())).toBe(false);
    const falseVictory = createWar(); falseVictory.over = true; falseVictory.winner = 0;
    expect(recordExpedition(falseVictory)).toBe(false);
    const falseDefeat = createWar(); falseDefeat.factions[0].alive = false;
    expect(recordExpedition(falseDefeat)).toBe(false);
    const badStats = completed(); badStats.stats[0].kills = -1;
    expect(recordExpedition(badStats)).toBe(false);
    const badTime = completed(); badTime.time = Number.NaN;
    expect(recordExpedition(badTime)).toBe(false);
    const badMap = completed(); badMap.mapId = 'fake' as MapId;
    expect(recordExpedition(badMap)).toBe(false);
    expect(readExpeditionRecords().totals.matches).toBe(0);
  });

  it('records player elimination as a loss even while the AI kingdoms are still fighting', () => {
    const w = completed();
    expect(w.over).toBe(false);
    expect(w.factions.filter(faction => faction.alive)).toHaveLength(3);
    expect(recordExpedition(w)).toBe(true);
    expect(readExpeditionRecords().records[0].victory).toBe(false);
    expect(readExpeditionRecords().totals).toMatchObject({ wins: 0, losses: 1 });
  });

  it('prevents duplicate finish calls for the same object but keeps distinct identical expeditions', () => {
    const first = completed(), second = completed();
    expect(recordExpedition(first)).toBe(true);
    expect(recordExpedition(first)).toBe(false);
    expect(recordExpedition(second)).toBe(true);
    expect(readExpeditionRecords().totals.matches).toBe(2);
    const ids = readExpeditionRecords().records.map(entry => entry.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('keeps only twenty recent battles while preserving lifetime and map-win totals', () => {
    for (const mapId of MAP_IDS) expect(recordExpedition(completed({ mapId, victory: true }))).toBe(true);
    const awardedAt = readExpeditionRecords().unlockedAt['three-frontiers'];
    for (let index = 0; index < 22; index++) {
      const w = completed(); w.stats[0].kills = index;
      expect(recordExpedition(w)).toBe(true);
    }
    const archive = readExpeditionRecords();
    expect(archive.records).toHaveLength(MAX_EXPEDITION_RECORDS);
    expect(archive.records.every(entry => !entry.victory)).toBe(true);
    expect(archive.records[0].kills).toBe(21);
    expect(archive.records.at(-1)?.kills).toBe(2);
    expect(archive.totals).toMatchObject({ matches: 25, wins: 3, losses: 22, mapWins: { classic: 1, frontier: 1, continental: 1 } });
    expect(archive.unlockedAt['three-frontiers']).toBe(awardedAt);
    expect(archive.unlockedAt.veteran).not.toBeNull();
  });
});

describe('eight achievement badges', () => {
  it('unlocks badges from accumulated completed-game evidence and retains their first dates', () => {
    expect(ACHIEVEMENTS).toHaveLength(8);
    const first = completed({ victory: true, grandBattle: true, mapId: 'classic' });
    first.operations!.claimed = CONTRACTS.map(contract => contract.id);
    first.operations!.supportUses = 19; first.stats[0].captures = 49;
    expect(recordExpedition(first)).toBe(true);
    let archive = readExpeditionRecords();
    const firstVictoryDate = archive.unlockedAt['first-victory'];
    expect(expeditionAchievements(archive).filter(achievement => achievement.unlocked).map(achievement => achievement.id)).toEqual([
      'first-expedition', 'first-victory', 'grand-victory', 'all-contracts',
    ]);
    expect(expeditionAchievements(archive).find(achievement => achievement.id === 'field-support')?.current).toBe(19);
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 14));
    const next = completed({ victory: true, mapId: 'frontier' });
    next.operations!.supportUses = 1; next.stats[0].captures = 1;
    recordExpedition(next); recordExpedition(completed({ victory: true, mapId: 'continental' }));
    for (let index = 0; index < 7; index++) recordExpedition(completed());
    archive = readExpeditionRecords();
    expect(expeditionAchievements(archive).every(achievement => achievement.unlocked)).toBe(true);
    expect(archive.unlockedAt['first-victory']).toBe(firstVictoryDate);
    expect(archive.unlockedAt['field-support']).toBe(Date.UTC(2026, 10, 14));
    expect(archive.totals.matches).toBe(10);
  });

  it('does not treat an ordinary victory as a grand-battle victory or partial contracts as a sweep', () => {
    const w = completed({ victory: true });
    w.operations!.claimed = CONTRACTS.slice(0, -1).map(contract => contract.id);
    recordExpedition(w);
    const archive = readExpeditionRecords();
    expect(archive.unlockedAt['first-victory']).not.toBeNull();
    expect(archive.unlockedAt['grand-victory']).toBeNull();
    expect(archive.unlockedAt['all-contracts']).toBeNull();
    expect(archive.unlockedAt['three-frontiers']).toBeNull();
  });
});

describe('bounded archive and storage recovery', () => {
  it('returns independent empty archives for missing, corrupt, unsupported, or oversized data', () => {
    for (const input of [null, 'null', '[]', '{broken', '{"version":2}', 'x'.repeat(120001)]) {
      expect(decodeExpeditionRecords(input).totals.matches).toBe(0);
    }
    const first = readExpeditionRecords(); first.totals.mapWins.classic = 20;
    expect(readExpeditionRecords().totals.mapWins.classic).toBe(0);
  });

  it('rejects malformed records, contradictory totals, duplicate IDs, and unsupported badge claims', () => {
    recordExpedition(completed());
    const source = stored.get(EXPEDITION_RECORDS_KEY)!;
    const mutate = (change: (archive: ExpeditionRecords) => void) => {
      const archive = JSON.parse(source) as ExpeditionRecords; change(archive);
      return decodeExpeditionRecords(JSON.stringify(archive));
    };
    expect(mutate(archive => { archive.records[0].mapId = 'fake' as MapId; }).totals.matches).toBe(0);
    expect(mutate(archive => { archive.records[0].id = '<img src=x>'; }).totals.matches).toBe(0);
    expect(mutate(archive => { archive.records[0].kills = -1; }).totals.matches).toBe(0);
    expect(mutate(archive => { archive.records[0].seconds = 86401; }).totals.matches).toBe(0);
    expect(mutate(archive => { archive.records.push(archive.records[0]); }).totals.matches).toBe(0);
    expect(mutate(archive => { archive.totals.wins = 1; }).totals.matches).toBe(0);
    expect(mutate(archive => { archive.totals.bestSurvival = 0; }).totals.matches).toBe(0);
    expect(mutate(archive => { archive.unlockedAt['first-victory'] = Date.now(); }).totals.matches).toBe(0);
    expect(mutate(archive => { archive.unlockedAt['first-expedition'] = null; }).totals.matches).toBe(0);
  });

  it('recovers from corrupt stored data on the next valid completion', () => {
    stored.set(EXPEDITION_RECORDS_KEY, '{corrupt');
    expect(recordExpedition(completed({ victory: true }))).toBe(true);
    expect(readExpeditionRecords().totals).toMatchObject({ matches: 1, wins: 1 });
  });

  it('does not overwrite inaccessible data and returns safe results when storage reads are denied', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('access denied'); }, setItem });
    expect(readExpeditionRecords().records).toEqual([]);
    expect(recordExpedition(completed())).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('preserves previous records after quota failure and can retry the same result after recovery', () => {
    recordExpedition(completed());
    const previous = stored.get(EXPEDITION_RECORDS_KEY), next = completed({ victory: true });
    vi.stubGlobal('localStorage', { ...storage, setItem: () => { throw new Error('quota exceeded'); } });
    expect(recordExpedition(next)).toBe(false);
    expect(stored.get(EXPEDITION_RECORDS_KEY)).toBe(previous);
    vi.stubGlobal('localStorage', storage);
    expect(recordExpedition(next)).toBe(true);
    expect(readExpeditionRecords().totals).toMatchObject({ matches: 2, wins: 1, losses: 1 });
    expect(recordExpedition(next)).toBe(false);
  });
});
