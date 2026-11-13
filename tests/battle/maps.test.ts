import { describe, expect, it } from 'vitest';
import {
  createWar, getIncome, mapHalfSizeFor, outpostName, stepWar, stormStartFor,
  train, trainSquad, maxUnitsFor, maxReserveFor, setReserve,
  MAP_HALF_SIZE, OUTPOST_NAMES,
} from '../../src/battle/war';
import { getMap, MAP_IDS, type MapId } from '../../src/battle/maps';
import { decodeWar, encodeWar } from '../../src/battle/save';
import { commandSquad } from '../../src/battle/squads';
import { minimapToWorld, worldToMinimap } from '../../src/battle/mapCommands';
import {
  getBattlefieldFeatures, isBattlefieldBlocked, battlefieldCoverAt,
} from '../../src/battle/battlefieldLayout';

describe('three distinct battlefields', () => {
  it.each([
    ['classic', 520, 9, 112], ['frontier', 780, 13, 210], ['continental', 1040, 17, 300],
  ] as const)('starts %s with its own full-sized tactical layout', (mapId, width, posts, hq) => {
    const w = createWar({ mapId });
    expect(mapHalfSizeFor(w) * 2).toBe(width);
    expect(w.outposts).toHaveLength(posts);
    expect(w.factions[0]).toMatchObject({ x: -hq, z: -hq });
    expect(w.zone).toBe(width / 2 - 6);
    expect(w.outposts.every(p => Math.abs(p.x) < width / 2 && Math.abs(p.z) < width / 2)).toBe(true);
    expect(w.factions.every(f => Math.hypot(f.x, f.z) < w.zone)).toBe(true);
    expect(w.outposts.every(p => outpostName(w, p.id).length > 2)).toBe(true);
  });

  it('preserves the industrial default while putting new objectives beyond its old edge', () => {
    const classic = createWar(), frontier = createWar({ mapId: 'frontier' });
    const continental = createWar({ mapId: 'continental' });
    expect(classic.mapId).toBe('classic');
    expect(MAP_HALF_SIZE).toBe(260);
    expect(OUTPOST_NAMES[5]).toBe('북서부 관문');
    expect(frontier.outposts.some(p => Math.abs(p.x) > MAP_HALF_SIZE)).toBe(true);
    expect(continental.outposts.some(p => Math.abs(p.z) > getMap('frontier').halfSize)).toBe(true);
    expect(stormStartFor(frontier)).toBeGreaterThan(stormStartFor(classic));
    expect(stormStartFor(continental)).toBeGreaterThan(stormStartFor(frontier));
  });

  it.each([['classic', 18, 6], ['frontier', 30, 10], ['continental', 48, 16]] as const)(
    'lets %s field %i troops with a matching defensive reserve', (mapId, limit, reserve) => {
      const w = createWar({ mapId }), faction = w.factions[0];
      faction.gold = 100000; faction.food = 100000;
      expect(maxUnitsFor(w)).toBe(limit);
      expect(maxReserveFor(w)).toBe(reserve);
      for (let i = 4; i < limit; i++) expect(train(w, 0)).toBe(true);
      expect(w.units.filter(unit => unit.owner === 0)).toHaveLength(limit);
      const resources = [faction.gold, faction.food];
      expect(train(w, 0)).toBe(false);
      expect(trainSquad(w, 0, 'infantry', 3)).toBe(false);
      expect([faction.gold, faction.food]).toEqual(resources);
      expect(setReserve(w, 0, reserve)).toBe(true);
      expect(setReserve(w, 0, reserve + 1)).toBe(false);
      expect(decodeWar(encodeWar(w))).toEqual(w);
    },
  );

  it('preserves batch limits and the 400-troop grand-battle cap on every map', () => {
    for (const mapId of MAP_IDS) {
      const ordinary = createWar({ mapId }), grand = createWar({ mapId, grandBattle: true });
      ordinary.factions[0].gold = grand.factions[0].gold = 100000;
      ordinary.factions[0].food = grand.factions[0].food = 100000;
      expect(trainSquad(ordinary, 0, 'infantry', 6)).toBe(false);
      expect(trainSquad(grand, 0, 'infantry', 51)).toBe(false);
      expect(maxUnitsFor(grand)).toBe(400);
      expect(maxReserveFor(grand)).toBe(60);
      for (let i = 0; i < 6; i++) expect(trainSquad(grand, 0, 'infantry', 50)).toBe(true);
      expect(train(grand, 0)).toBe(false);
      expect(grand.units.filter(unit => unit.owner === 0)).toHaveLength(400);
      expect(decodeWar(encodeWar(grand))).toEqual(grand);
    }
  });

  it('makes outer supply posts produce their actual regional income', () => {
    const w = createWar({ mapId: 'continental' }), post = w.outposts[16];
    const before = getIncome(w, 0);
    post.owner = 0;
    const after = getIncome(w, 0);
    expect(after.gold - before.gold).toBeCloseTo(1.5);
    expect(after.food - before.food).toBeCloseTo(3.5);
    const gold = w.factions[0].gold;
    stepWar(w, .1);
    expect(w.factions[0].gold - gold).toBeCloseTo(after.gold * .1);
  });

  it.each(MAP_IDS)('scales minimap drawing and clicks together on %s', mapId => {
    const half = getMap(mapId).halfSize;
    for (const [x, z] of [[0, 0], [-half, half], [half * .73, -half * .51]]) {
      const screen = worldToMinimap(x, z, 220, mapId);
      const world = minimapToWorld(screen.x, screen.y, 220, 220, mapId);
      expect(world.x).toBeCloseTo(x);
      expect(world.z).toBeCloseTo(z);
    }
    expect(minimapToWorld(-50, 400, 220, 220, mapId)).toEqual({ x: -half, z: half });
  });

  it('uses the selected world bounds for independent commands and marching', () => {
    const classic = createWar(), w = createWar({ mapId: 'continental' });
    expect(commandSquad(classic, 0, { kind: 'move', x: 500, z: 0 })).toBe(false);
    expect(commandSquad(w, 0, { kind: 'move', x: 520, z: 0 })).toBe(false);
    expect(commandSquad(w, 0, { kind: 'move', x: 500, z: 0 })).toBe(true);
    w.factions.slice(1).forEach(f => { f.aiTimer = 10000; });
    for (const unit of w.units.filter(u => u.owner === 0)) { unit.x = 390; unit.z = 0; }
    for (let i = 0; i < 250; i++) stepWar(w, .1);
    expect(w.units.filter(u => u.owner === 0).every(u => u.x > 480 && u.x < 520)).toBe(true);
    expect(decodeWar(encodeWar(w))).toEqual(w);
  });

  it.each(MAP_IDS)('marches through the southeast approach without stalling on %s', mapId => {
    const w = createWar({ mapId }), southeast = w.factions[3], target = w.outposts[5];
    w.units = w.units.filter(unit => unit.owner === 0);
    for (const unit of w.units) { unit.x = southeast.x; unit.z = southeast.z - 8; }
    for (const faction of w.factions.slice(1)) { faction.aiTimer = 10000; faction.turretCooldown = 100; }
    expect(commandSquad(w, 0, { kind: 'outpost', id: target.id })).toBe(true);
    for (let i = 0; i < 1000; i++) stepWar(w, .1);
    expect(target.owner).toBe(0);
    expect(w.units.filter(unit => unit.owner === 0).every(unit =>
      Math.hypot(unit.x - target.x, unit.z - target.z) < 8)).toBe(true);
  });

  it.each(MAP_IDS)('keeps %s terrain deterministic and strategic centers traversable', mapId => {
    const map = getMap(mapId), features = getBattlefieldFeatures(mapId);
    expect(getBattlefieldFeatures(mapId)).toBe(features);
    expect(features.length).toBeGreaterThan(180);
    expect(features.every(f => Math.abs(f.x) < map.halfSize && Math.abs(f.z) < map.halfSize)).toBe(true);
    for (const p of map.outposts) expect(isBattlefieldBlocked(p.x, p.z, .7, mapId)).toBe(false);
    for (const [x, z] of map.factionPositions) expect(isBattlefieldBlocked(x, z, .7, mapId)).toBe(false);
    const hangar = features.find(f => f.kind === 'hangar')!;
    expect(isBattlefieldBlocked(hangar.x, hangar.z, .7, mapId)).toBe(true);
    expect(battlefieldCoverAt(hangar.x + hangar.radius + 2, hangar.z, mapId)).toBeGreaterThan(0);
  });
});

describe('map-aware save format', () => {
  it.each(MAP_IDS)('restores a naturally progressed %s battle and its outer orders', mapId => {
    const w = createWar({ mapId, grandBattle: true });
    expect(commandSquad(w, 0, { kind: 'outpost', id: w.outposts.length - 1 })).toBe(true);
    for (let i = 0; i < 80; i++) stepWar(w, .1);
    const restored = decodeWar(encodeWar(w));
    expect(restored).toEqual(w);
    expect(restored?.squadOrders?.[0]).toEqual({ kind: 'outpost', id: w.outposts.length - 1 });
  });

  it('migrates an original v3 game without moving troops or resetting progress', () => {
    const w = createWar();
    for (let i = 0; i < 200; i++) stepWar(w, .1);
    const legacy = JSON.parse(encodeWar(w));
    legacy.version = 3;
    delete legacy.war.mapId;
    delete legacy.war.operations;
    const restored = decodeWar(JSON.stringify(legacy));
    expect(restored).toEqual(w);
    expect(restored?.mapId).toBe('classic');
  });

  it('rejects mismatched layouts, out-of-world troops and invalid objective references', () => {
    const raw = JSON.parse(encodeWar(createWar({ mapId: 'continental' })));
    raw.war.mapId = 'classic';
    expect(decodeWar(JSON.stringify(raw))).toBeNull();
    raw.war.mapId = 'not-a-map';
    expect(decodeWar(JSON.stringify(raw))).toBeNull();
    raw.war.mapId = 'continental' satisfies MapId;
    raw.war.units[0].x = 521;
    expect(decodeWar(JSON.stringify(raw))).toBeNull();
    raw.war.units[0].x = -300;
    raw.war.factions[0].rally = 17;
    expect(decodeWar(JSON.stringify(raw))).toBeNull();
    raw.war.factions[0].rally = 16;
    expect(decodeWar(JSON.stringify(raw))).not.toBeNull();
  });

  it('requires the map ID in v4 and refuses to reinterpret new maps as old saves', () => {
    const raw = JSON.parse(encodeWar(createWar({ mapId: 'frontier' })));
    delete raw.war.mapId;
    expect(decodeWar(JSON.stringify(raw))).toBeNull();
    raw.version = 3;
    raw.war.mapId = 'frontier';
    expect(decodeWar(JSON.stringify(raw))).toBeNull();
  });
});
