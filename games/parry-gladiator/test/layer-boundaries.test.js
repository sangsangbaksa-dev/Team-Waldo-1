import test from 'node:test';
import assert from 'node:assert/strict';
import { actionStaminaCost, act, fighter } from '../src/domain/combat.js';
import { relativeDirection } from '../src/application/direction.js';
import { defaultSettings, sanitizeSettings } from '../src/application/settings.js';
import { readSettings, saveSettings, STORAGE_KEY } from '../src/infrastructure/local-settings.js';

test('stamina hints and the combat engine agree on action cost', () => {
  for (const [action, riposte] of [['light', 0], ['light', 1], ['heavy', 0], ['dodge', 0]]) {
    const player = fighter(0, 0, 0);
    player.riposte = riposte;
    const cost = actionStaminaCost(player, action);
    player.stamina = cost - 1;
    assert.equal(act(player, action), false);
    player.stamina = cost;
    assert.ok(act(player, action));
    assert.equal(player.stamina, 0);
  }
});
test('arena relative movement remains independent of the DOM', () => {
  assert.deepEqual(relativeDirection({ x: 0, z: 1 }, { x: 0, z: 0 }, { x: 5, z: 0 }), { x: 1, z: 0 });
  assert.deepEqual(relativeDirection({ x: 1, z: 0 }, { x: 0, z: 0 }, { x: 5, z: 0 }), { x: 0, z: 1 });
});
test('settings validation is pure and preserves reduced motion defaults', () => {
  assert.deepEqual(sanitizeSettings(null, true), defaultSettings(true));
  const settings = sanitizeSettings({ volume: 3, quality: 'invalid', difficulty: 'champion' }, true);
  assert.equal(settings.volume, 1);
  assert.equal(settings.quality, 'auto');
  assert.equal(settings.difficulty, 'champion');
  assert.equal(settings.motion, 'reduced');
});
test('browser adapter preserves the settings key and handles denied storage', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const settings = defaultSettings(false);
  saveSettings(settings, storage);
  assert.ok(data.has(STORAGE_KEY));
  assert.deepEqual(readSettings(storage, false), settings);
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(readSettings(denied, true), defaultSettings(true));
  assert.doesNotThrow(() => saveSettings(settings, denied));
});
