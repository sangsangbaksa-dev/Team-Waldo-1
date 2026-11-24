import test from 'node:test';
import assert from 'node:assert/strict';
import { Practice } from '../src/application/practice.js';

test('feint drill requires two successful heavy cancellations', () => {
  const game = new Practice();
  game.lesson = 4;
  game.phase = 'fight';
  assert.equal(game.input(0, 'feint'), false);
  assert.equal(game.progress, 0);
  for (let i = 0; i < 2; i++) {
    const p = game.players[0];
    p.state = 'idle';
    p.stamina = 100;
    assert.equal(game.input(0, 'heavy'), 'heavy');
    assert.equal(game.input(0, 'feint'), 'feint');
  }
  assert.equal(game.lesson, 5);
});
test('mixed parry drill resets on a blocked or missed attack', () => {
  const game = new Practice();
  game.lesson = 5;
  game.onEvent('parry', 1);
  game.onEvent('block', 1);
  assert.equal(game.progress, 0);
  game.onEvent('parry', 1);
  game.onEvent('hit', 1);
  assert.equal(game.progress, 0);
  for (let i = 0; i < 3; i++) game.onEvent('parry', 1);
  assert.equal(game.lesson, 6);
});
