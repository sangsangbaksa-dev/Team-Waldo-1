import { describe, expect, it } from 'vitest';
import { createWar, stepWar, UNIT_STATS, upgrade, type War } from '../../src/battle/war';
import { decodeWar, encodeWar } from '../../src/battle/save';
import { commandSquad } from '../../src/battle/squads';
import {
  CONTRACTS, SUPPORTS, claimContract, contractProgress, createOperationsState,
  getOperationsState, listContracts, operationsBonus, supportStatus, useSupport,
  validOperationsState, type ContractId, type OperationsState,
} from '../../src/battle/operations';

function fundedWar(grandBattle = false): War {
  const w = createWar({ grandBattle });
  w.factions[0].gold = 10000;
  w.factions[0].food = 10000;
  return w;
}

describe('expedition contracts', () => {
  it('tracks nine actual campaign milestones without granting rewards just by viewing them', () => {
    const w = createWar(), before = { gold: w.factions[0].gold, food: w.factions[0].food };
    expect(CONTRACTS).toHaveLength(9);
    expect(listContracts(w)).toHaveLength(9);
    expect(listContracts(w).every(contract => !contract.ready && !contract.claimed)).toBe(true);
    expect(contractProgress(w, 'foundation')).toMatchObject({ current: 0, target: 2, progress: 0 });
    expect(contractProgress(w, 'stronghold')).toMatchObject({ current: 1, target: 3 });
    expect(w.factions[0]).toMatchObject(before);
    expect(getOperationsState(w).claimed).toEqual([]);
  });

  it('rechecks a completed objective and grants a one-time reward recorded in earned resources', () => {
    const w = fundedWar();
    expect(claimContract(w, 'foundation')).toBe(false);
    upgrade(w, 0, 'mine');
    expect(contractProgress(w, 'foundation')).toMatchObject({ current: 1, target: 2, progress: .5, ready: false });
    upgrade(w, 0, 'farm');
    const before = { gold: w.factions[0].gold, food: w.factions[0].food };
    const reward = contractProgress(w, 'foundation')!.reward;
    expect(claimContract(w, 'foundation')).toBe(true);
    expect(w.factions[0].gold).toBe(before.gold + reward.gold);
    expect(w.factions[0].food).toBe(before.food + reward.food);
    expect(w.stats[0].goldEarned).toBe(reward.gold);
    expect(w.stats[0].foodEarned).toBe(reward.food);
    expect(contractProgress(w, 'foundation')).toMatchObject({ ready: false, claimed: true, progress: 1 });
    expect(claimContract(w, 'foundation')).toBe(false);
    expect(w.factions[0].gold).toBe(before.gold + reward.gold);
    expect(getOperationsState(w).claimed).toEqual(['foundation']);
  });

  it('requires territory at claim time and keeps an already earned reward after territory is lost', () => {
    const w = fundedWar();
    w.outposts[0].owner = 0;
    expect(contractProgress(w, 'first-banner')?.ready).toBe(true);
    w.outposts[0].owner = 1;
    expect(claimContract(w, 'first-banner')).toBe(false);
    w.outposts[0].owner = 0;
    expect(claimContract(w, 'first-banner')).toBe(true);
    w.outposts[0].owner = 1;
    expect(contractProgress(w, 'first-banner')).toMatchObject({ claimed: true, ready: false, progress: 1 });
    expect(claimContract(w, 'first-banner')).toBe(false);
  });

  it('uses purchased recruits rather than starting armies and scales grand-battle rewards', () => {
    const w = fundedWar(true);
    expect(contractProgress(w, 'recruits')).toMatchObject({ current: 0, target: 25, ready: false });
    w.stats[0].trained = 24;
    expect(claimContract(w, 'recruits')).toBe(false);
    w.stats[0].trained = 25;
    const reward = CONTRACTS.find(contract => contract.id === 'recruits')!.reward;
    const gold = w.factions[0].gold;
    expect(claimContract(w, 'recruits')).toBe(true);
    expect(w.factions[0].gold - gold).toBe(reward.gold * 3);
  });

  it('derives specialist, research, territorial, and conquest milestones from game state', () => {
    const w = fundedWar();
    w.units[0].kind = 'archer';
    w.units[1].kind = 'guardian';
    expect(contractProgress(w, 'combined-arms')?.ready).toBe(true);
    w.units[1].hp = 0;
    expect(contractProgress(w, 'combined-arms')?.ready).toBe(false);
    w.base!.generals.push({ id: 'sora', squad: null });
    w.stats[0].researches = 1;
    w.outposts.slice(0, 3).forEach(post => { post.owner = 0; });
    w.factions[1].alive = false;
    for (const id of ['commanders', 'research', 'supply-network', 'conqueror'] as const) {
      expect(contractProgress(w, id)?.ready).toBe(true);
    }
  });

  it('rejects unknown contracts and claims after player defeat or a finished campaign', () => {
    const w = fundedWar(true), before = w.factions[0].gold;
    expect(contractProgress(w, '<script>' as ContractId)).toBeNull();
    expect(claimContract(w, 'unknown' as ContractId)).toBe(false);
    w.over = true;
    expect(claimContract(w, 'foundation')).toBe(false);
    w.over = false;
    w.factions[0].hp = 0;
    expect(claimContract(w, 'foundation')).toBe(false);
    expect(w.factions[0].gold).toBe(before);
  });
});

describe('squad support commands', () => {
  it('does not spend supplies or a cooldown when the target is invalid, empty, uninjured, or unaffordable', () => {
    const w = createWar(), before = { gold: w.factions[0].gold, food: w.factions[0].food };
    expect(SUPPORTS).toHaveLength(3);
    expect(supportStatus(w, 'medical', 0)?.reason).toContain('가득');
    expect(useSupport(w, 'medical', 0)).toBe(false);
    expect(useSupport(w, 'march', 1)).toBe(false);
    expect(useSupport(w, 'march', 3 as never)).toBe(false);
    expect(useSupport(w, 'unknown' as never, 0)).toBe(false);
    expect(w.factions[0]).toMatchObject(before);
    expect(getOperationsState(w).supportUses).toBe(0);
    w.factions[0].food = 0;
    expect(useSupport(w, 'march', 0)).toBe(false);
    expect(getOperationsState(w).readyAt.march).toBe(0);
    expect(w.factions[0].gold).toBe(before.gold);
  });

  it('heals only living members of the selected squad and caps every unit at its own maximum health', () => {
    const w = fundedWar(), player = w.units.filter(unit => unit.owner === 0), enemy = w.units.find(unit => unit.owner === 1)!;
    player[0].squad = 1; player[0].hp = 10;
    player[1].squad = 1; player[1].hp = 50;
    player[2].squad = 1; player[2].hp = 0;
    player[3].squad = 0; player[3].hp = 8;
    enemy.hp = 5;
    expect(supportStatus(w, 'medical', 1)?.affected).toBe(2);
    const before = w.factions[0].gold;
    expect(useSupport(w, 'medical', 1)).toBe(true);
    expect(player[0].hp).toBeCloseTo(10 + UNIT_STATS.infantry.hp * .35);
    expect(player[1].hp).toBe(UNIT_STATS.infantry.hp);
    expect(player[2].hp).toBe(0);
    expect(player[3].hp).toBe(8);
    expect(enemy.hp).toBe(5);
    expect(w.factions[0].gold).toBe(before - 55);
    expect(useSupport(w, 'medical', 1)).toBe(false);
    expect(w.factions[0].gold).toBe(before - 55);
  });

  it('freezes durations and global support cooldowns until simulation time advances', () => {
    const w = fundedWar(), first = w.units[0];
    w.time = 12;
    expect(useSupport(w, 'march', 0)).toBe(true);
    expect(operationsBonus(w, first, 'speed')).toBe(.4);
    expect(supportStatus(w, 'march', 0)).toMatchObject({ remaining: 50, activeFor: 14, available: false });
    for (let i = 0; i < 100; i++) listContracts(w);
    expect(supportStatus(w, 'march', 0)?.remaining).toBe(50);
    w.time = 25.9;
    expect(operationsBonus(w, first, 'speed')).toBe(.4);
    w.time = 26;
    expect(operationsBonus(w, first, 'speed')).toBe(0);
    expect(useSupport(w, 'march', 0)).toBe(false);
    w.time = 62;
    expect(useSupport(w, 'march', 0)).toBe(true);
    expect(getOperationsState(w).effects).toHaveLength(1);
    expect(getOperationsState(w).supportUses).toBe(2);
  });

  it('supports a particular squad, never buffs rivals, and stacks distinct support types without duplicates', () => {
    const w = fundedWar(), [first, second] = w.units;
    first.squad = 1;
    expect(useSupport(w, 'march', 1)).toBe(true);
    expect(useSupport(w, 'shield', 1)).toBe(true);
    expect(operationsBonus(w, first, 'speed')).toBe(.4);
    expect(operationsBonus(w, first, 'armor')).toBe(.3);
    expect(operationsBonus(w, second, 'speed')).toBe(0);
    expect(operationsBonus(w, w.units.find(unit => unit.owner === 1)!, 'armor')).toBe(0);
    expect(getOperationsState(w).effects).toHaveLength(2);
    expect(useSupport(w, 'shield', 0)).toBe(false);
    expect(getOperationsState(w).effects).toHaveLength(2);
    first.hp = 0;
    expect(operationsBonus(w, first, 'armor')).toBe(0);
  });

  it('scales costs for the 600-unit campaign and never permits support after defeat', () => {
    const w = fundedWar(true), before = w.factions[0].gold;
    expect(supportStatus(w, 'shield', 0)?.cost).toEqual({ gold: 195, food: 135 });
    expect(useSupport(w, 'shield', 0)).toBe(true);
    expect(w.factions[0].gold).toBe(before - 195);
    w.over = true;
    expect(useSupport(w, 'march', 0)).toBe(false);
    w.over = false;
    w.factions[0].alive = false;
    expect(useSupport(w, 'march', 0)).toBe(false);
  });

  it('limits announcements to the same eight-event history as the core simulation', () => {
    const w = fundedWar();
    for (let i = 0; i < 12; i++) {
      w.time = i * 60;
      expect(useSupport(w, 'march', 0)).toBe(true);
    }
    expect(w.events).toHaveLength(8);
    expect(w.events[0].text).toContain('강행군');
  });

  it('changes actual simulation movement by 40% while leaving enemy speed unchanged', () => {
    const regular = fundedWar(), supported = fundedWar();
    for (const w of [regular, supported]) {
      w.units = w.units.filter(unit => unit.id === 1);
      commandSquad(w, 0, { kind: 'move', x: 20, z: 20 });
    }
    const origin = { x: regular.units[0].x, z: regular.units[0].z };
    useSupport(supported, 'march', 0);
    stepWar(regular, .1); stepWar(supported, .1);
    const moved = (w: War) => Math.hypot(w.units[0].x - origin.x, w.units[0].z - origin.z);
    expect(moved(regular)).toBeGreaterThan(0);
    expect(moved(supported) / moved(regular)).toBeCloseTo(1.4);
  });

  it('reduces actual combat damage by 30% but does not reduce storm damage', () => {
    const regular = fundedWar(), supported = fundedWar();
    for (const w of [regular, supported]) {
      const player = w.units.find(unit => unit.owner === 0)!;
      const enemy = w.units.find(unit => unit.owner === 1)!;
      player.x = 0; player.z = 0;
      enemy.x = 2; enemy.z = 0;
      w.units = [player, enemy];
    }
    const hp = regular.units[0].hp;
    useSupport(supported, 'shield', 0);
    stepWar(regular, .1); stepWar(supported, .1);
    expect(hp - regular.units[0].hp).toBeGreaterThan(0);
    expect((hp - supported.units[0].hp) / (hp - regular.units[0].hp)).toBeCloseTo(.7);
    for (const w of [regular, supported]) {
      w.units = [w.units[0]];
      w.units[0].x = 250; w.units[0].z = 0; w.units[0].hp = hp;
      w.time = 300;
    }
    useSupport(supported, 'shield', 0);
    stepWar(regular, .1); stepWar(supported, .1);
    expect(regular.units[0].hp).toBeLessThan(hp);
    expect(supported.units[0].hp).toBeCloseTo(regular.units[0].hp);
  });
});

describe('saved expedition state', () => {
  it('creates independent state per campaign and accepts valid active or expired timers', () => {
    const first = createOperationsState(), second = createOperationsState();
    first.claimed.push('foundation');
    expect(second.claimed).toEqual([]);
    const w = fundedWar();
    expect(validOperationsState(getOperationsState(w), w)).toBe(true);
    w.time = 120;
    useSupport(w, 'shield', 0);
    useSupport(w, 'march', 0);
    const state: OperationsState = JSON.parse(JSON.stringify(getOperationsState(w)));
    expect(validOperationsState(state, w)).toBe(true);
    w.time = 200;
    expect(validOperationsState(state, w)).toBe(true);
  });

  it('rejects unknown or duplicate rewards, malformed cooldowns, invalid squads, and forged duration', () => {
    const w = fundedWar(); w.time = 10;
    useSupport(w, 'march', 0);
    const mutate = (change: (state: OperationsState) => void) => {
      const state = JSON.parse(JSON.stringify(getOperationsState(w))) as OperationsState;
      change(state); return validOperationsState(state, w);
    };
    expect(validOperationsState(null, w)).toBe(false);
    expect(validOperationsState([], w)).toBe(false);
    expect(validOperationsState({}, w)).toBe(false);
    expect(mutate(state => { state.claimed = ['foundation', 'foundation']; })).toBe(false);
    expect(mutate(state => { state.claimed = ['fake' as ContractId]; })).toBe(false);
    expect(mutate(state => { state.readyAt.medical = 100000; })).toBe(false);
    expect(mutate(state => { state.readyAt.shield = -1; })).toBe(false);
    expect(mutate(state => { state.readyAt.march = Number.NaN; })).toBe(false);
    expect(mutate(state => { state.supportUses = 1.2; })).toBe(false);
    expect(mutate(state => { state.effects[0].squad = 3 as never; })).toBe(false);
    expect(mutate(state => { state.effects[0].startedAt = 11; })).toBe(false);
    expect(mutate(state => { state.effects[0].expiresAt = 25; })).toBe(false);
    expect(mutate(state => { state.effects[0].kind = 'medical' as never; })).toBe(false);
    expect(mutate(state => { state.effects.push({ ...state.effects[0] }); })).toBe(false);
    expect(mutate(state => { state.readyAt.march += 1; })).toBe(false);
    expect(mutate(state => { state.supportUses = 0; })).toBe(false);
    expect(mutate(state => { state.readyAt.medical = 1; })).toBe(false);
  });

  it('preserves claimed rewards and active cooldowns through the full save loader', () => {
    const w = fundedWar(true);
    w.time = 21;
    expect(claimContract(w, 'foundation')).toBe(true);
    expect(useSupport(w, 'march', 0)).toBe(true);
    const restored = decodeWar(encodeWar(w));
    expect(restored).not.toBeNull();
    expect(getOperationsState(restored!)).toEqual(getOperationsState(w));
    const money = restored!.factions[0].gold;
    expect(claimContract(restored!, 'foundation')).toBe(false);
    expect(useSupport(restored!, 'march', 0)).toBe(false);
    expect(restored!.factions[0].gold).toBe(money);
    expect(operationsBonus(restored!, restored!.units[0], 'speed')).toBe(.4);
    const damaged = JSON.parse(encodeWar(w));
    damaged.war.operations.effects[0].expiresAt += 10;
    expect(decodeWar(JSON.stringify(damaged))).toBeNull();
  });

  it('initializes a previous-version save with no rewards claimed or support cooldown debt', () => {
    const w = fundedWar();
    const legacy = JSON.parse(encodeWar(w));
    legacy.version = 3;
    delete legacy.war.operations;
    const restored = decodeWar(JSON.stringify(legacy));
    expect(restored).not.toBeNull();
    expect(getOperationsState(restored!)).toEqual(createOperationsState());
    legacy.version = 4;
    expect(decodeWar(JSON.stringify(legacy))).toBeNull();
  });
});
