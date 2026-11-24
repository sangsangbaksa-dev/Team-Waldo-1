import { describe, expect, it } from 'vitest';
import { createCore, SPOTS } from '../../src/tycoon/core';
import type { TycoonCore } from '../../src/tycoon/core';
import { CASINO_BET_SIZES, CASINO_WIN_CHANCE } from '../../src/tycoon/core/data';

function settle(core: TycoonCore): void {
  for (let i = 0; i < 200 && core.state.activity; i++) core.tick(0.1);
}

function playBet(seed: number, stake = 10) {
  const core = createCore({ seed });
  core.data.stage = 'parttime';
  core.data.cash = 100;
  core.data.lifetimeEarned = 50;
  core.data.minute = 18 * 60;
  const beforeEarned = core.data.lifetimeEarned;
  const events: Array<{ type: string; text?: string; tone?: string; amount?: number }> = [];
  core.onEvent(event => events.push(event));
  core.setPresence('casino');
  const started = core.perform('casino', `casino_flip_${stake}`);
  expect(started.ok, started.message).toBe(true);
  expect(core.state.activity).toBeNull();
  return { core, events, beforeEarned, started };
}

describe('HUSTLE new side activities', () => {
  it('appends early job and casino spots without moving existing spot ids', () => {
    const oldSpotIds = [
      'bench', 'alley', 'park', 'junkyard', 'snack', 'lot_s1', 'lot_s2', 'lot_s3',
      'job_mart', 'job_cafe', 'wholesale', 'bank', 'lot_m1', 'lot_m2', 'lot_m3', 'lot_m4',
      'job_dock', 'lot_h1', 'lot_h2', 'lot_h3', 'airport', 'job_delivery', 'office',
      'lot_d1', 'lot_d2', 'lot_d3', 'lot_d4', 'lot_u1', 'lot_u2', 'lot_u3',
    ];
    expect(SPOTS.slice(0, oldSpotIds.length).map(spot => spot.id)).toEqual(oldSpotIds);
    expect(SPOTS.slice(oldSpotIds.length).map(spot => spot.id)).toEqual(['casino', 'job_post', 'job_park']);
    for (const id of ['casino', 'job_post', 'job_park']) expect(createCore().spot(id)).toBeDefined();
  });

  it('shows fixed casino odds, preset game-cash stakes, hours and insufficient-funds reasons', () => {
    const core = createCore({ seed: 2 });
    core.data.stage = 'parttime'; core.data.cash = 9; core.data.minute = 12 * 60;
    const bets = core.actionsAt('casino').filter(action => action.id.startsWith('casino_flip_'));
    expect(bets.map(action => action.id)).toEqual(CASINO_BET_SIZES.map(stake => `casino_flip_${stake}`));
    expect(bets.every(action => !action.enabled && action.disabledReason?.includes('돈이 모자'))).toBe(true);
    expect(bets[0]).toMatchObject({ cost: 10, reward: 10 });
    expect(bets[0]?.desc).toContain(`${CASINO_WIN_CHANCE * 100}%`);
    expect(bets[0]?.desc).toContain('실제 결제·보상 없음');
    core.data.cash = 100; core.data.minute = 23 * 60;
    expect(core.actionsAt('casino').find(action => action.id === 'casino_flip_10')?.disabledReason).toContain('07:00~23:00');
    core.data.minute = 7 * 60;
    expect(core.actionsAt('casino').find(action => action.id === 'casino_flip_10')?.enabled).toBe(true);
  });

  it('settles wins/losses in fictional cash, reports net outcomes and leaves progression earnings alone', () => {
    const runs = Array.from({ length: 30 }, (_, index) => playBet(index + 1));
    const win = runs.find(run => run.core.data.cash === 110)!;
    const loss = runs.find(run => run.core.data.cash === 90)!;
    expect(win).toBeDefined(); expect(loss).toBeDefined();
    expect(win.core.data.lifetimeEarned).toBe(win.beforeEarned);
    expect(loss.core.data.lifetimeEarned).toBe(loss.beforeEarned);
    expect(win.events.some(event => event.type === 'cash' && event.amount === 10)).toBe(true);
    expect(loss.events.some(event => event.type === 'cash' && event.amount === -10)).toBe(true);
    expect(win.started.message).toContain('순이익 +10');
    expect(loss.started.message).toContain('10 손실');
    const restored = createCore({ save: win.core.serialize() });
    expect(restored.state.cash).toBe(win.core.state.cash);
    expect(restored.data.rng).toBe(win.core.data.rng);
  });

  it('adds two distinct cash jobs with hours, energy costs and ordinary progression credit', () => {
    const core = createCore({ seed: 8 });
    core.data.stage = 'parttime'; core.data.cash = 0; core.data.minute = 8 * 60;
    for (const [spotId, actionId, pay] of [['job_post', 'work', 54], ['job_park', 'work', 36]] as const) {
      const before = core.data.cash;
      core.setPresence(spotId);
      const action = core.actionsAt(spotId).find(value => value.id === actionId)!;
      expect(action.enabled).toBe(true);
      expect(core.perform(spotId, actionId).ok).toBe(true);
      settle(core);
      expect(core.data.cash).toBe(before + pay);
      expect(core.data.jobsDone).toBeGreaterThan(0);
    }
    core.data.minute = 22 * 60;
    expect(core.actionsAt('job_post').find(action => action.id === 'work')?.enabled).toBe(false);
  });
});
