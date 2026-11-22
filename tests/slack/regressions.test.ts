// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { createBattle, resizeBattleCanvas } from '../../src/slack/lapgame';
import { createSim } from '../../src/slack/sim';
import { readSlackRecord, recordSlackRun } from '../../src/slack/records';

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it('honors a deferred cover release and reports only the third strike at the deadline', () => {
  const sim = createSim('class', 12, 2);
  sim.start(); sim.doActivity('game'); sim.setCover(false);
  sim.state.sus = 100; sim.update(0.1);
  expect(sim.state.cover).toBe(true);
  sim.setCover(false); sim.update(1);
  expect(sim.state.cover).toBe(true);
  sim.update(0.6);
  expect(sim.state.cover).toBe(false);
  sim.state.sus = 100; sim.update(0.1);
  sim.setCover(false); sim.setCover(true); sim.update(1.6);
  expect(sim.state.cover).toBe(true);
  sim.setCover(false);
  sim.state.time = sim.state.limit - 0.05;
  sim.state.sus = 100; sim.update(0.1); sim.update(5);
  const events = sim.drain();
  expect(events.filter(event => event.t === 'strike').map(event => event.n)).toEqual([1, 2, 3]);
  expect(events.filter(event => event.t === 'caught')).toHaveLength(1);
  expect(events.some(event => event.t === 'done')).toBe(false);
  expect(sim.state.phase).toBe('caught');
});

it('keeps the best score in memory when storage is blocked', () => {
  const storage = localStorage;
  const blocked = () => { throw new Error('blocked storage'); };
  vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
  expect(recordSlackRun('dorm', 0, 'D')).toBe(true); // 0점 D 도 첫 기록으로 남는다
  expect(recordSlackRun('dorm', 0, 'D')).toBe(false);
  expect(recordSlackRun('dorm', 42, 'C')).toBe(true);
  expect(recordSlackRun('dorm', 40, 'B')).toBe(false);
  expect(readSlackRecord().best.dorm).toEqual({ score: 42, grade: 'C' });
  vi.stubGlobal('localStorage', storage);
  expect(recordSlackRun('class', 50, 'B')).toBe(true);
  expect(JSON.parse(storage.getItem('waldo.slack.v1')!).best.dorm.score).toBe(42);
});

it('caps canvas pixel ratio and ignores transient zero sizes', () => {
  const canvas = document.createElement('canvas');
  resizeBattleCanvas(canvas, 200.5, 100, 3);
  expect([canvas.width, canvas.height]).toEqual([401, 200]);
  resizeBattleCanvas(canvas, 0, 0, 2);
  expect([canvas.width, canvas.height]).toEqual([401, 200]);
  resizeBattleCanvas(canvas, 320, 180, 1.25);
  expect([canvas.width, canvas.height]).toEqual([400, 225]);
});

it('resets the battle HUD immediately for a fresh round', () => {
  const battle = createBattle(true);
  expect(battle.ore).toBe(100);
  expect(battle.train('t')).toBe(true);
  battle.update(0.1);
  expect(battle.prod).toBeGreaterThan(0);
  battle.reset();
  expect(battle).toMatchObject({ ore: 100, score: 0, time: 0, prod: 0, over: null, cap: '' });
});

it('ignores NaN/infinite dimensions and invalid scale factors during canvas resizing', () => {
  const canvas = document.createElement('canvas');
  resizeBattleCanvas(canvas, 160, 90, 1);
  expect([canvas.width, canvas.height]).toEqual([160, 90]);
  for (const n of [NaN, Infinity, -Infinity]) {
    resizeBattleCanvas(canvas, n, 90, 1);
    resizeBattleCanvas(canvas, 160, n, 1);
    expect([canvas.width, canvas.height]).toEqual([160, 90]);
  }
  resizeBattleCanvas(canvas, 160, 90, -2);
  expect([canvas.width, canvas.height]).toEqual([160, 90]);
  resizeBattleCanvas(canvas, 160, 90, Infinity);
  expect([canvas.width, canvas.height]).toEqual([160, 90]);
});

it('ignores invalid or negative minigame frame deltas without corrupting simulation state', () => {
  const battle = createBattle(true);
  const initial = { time: battle.time, ore: battle.ore, prod: battle.prod, score: battle.score };
  for (const dt of [NaN, Infinity, -Infinity, -1, 0]) battle.update(dt);
  expect({ time: battle.time, ore: battle.ore, prod: battle.prod, score: battle.score }).toEqual(initial);
  battle.update(0.1);
  expect(battle.time).toBeCloseTo(0.1);
  expect(Number.isFinite(battle.ore)).toBe(true);
});

it('rejects invalid mini RTS move coordinates before they corrupt unit orders', () => {
  const commands: string[] = [];
  const battle = createBattle(true, event => commands.push(event));
  expect(battle.command(NaN, 90)).toBeNull();
  expect(battle.command(120, Infinity)).toBeNull();
  expect(battle.command(-Infinity, 0)).toBeNull();
  expect(commands).toHaveLength(0);
  expect(battle.command(-100, 90)).toBe('move');
  expect(commands).toEqual(['order']);
  for (let i = 0; i < 50; i++) battle.update(0.1);
  expect(Number.isFinite(battle.time)).toBe(true);
});
