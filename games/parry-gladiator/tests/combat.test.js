import test from 'node:test';
import assert from 'node:assert/strict';
import { attacks } from '../src/domain/combat.js';
import { Game, STEP } from '../src/application/game.js';
import { Practice } from '../src/application/practice.js';

function setup(game) {
  const events = [];
  game ||= new Game((event, fighter, details) => events.push({ event, fighter, details }));
  const ticks = (n = 1, inputs = [{}, {}]) => {
    for (let i = 0; i < n; i++) game.update(STEP, inputs, false);
  };
  const close = () => {
    game.players[0].x = -1;
    game.players[1].x = 1;
    game.players[0].z = game.players[1].z = 0;
  };
  ticks(130);
  close();
  return { game, ticks, events, close };
}

test('a late guard creates exactly one riposte opening', () => {
  const { game, ticks, events } = setup();
  game.input(0, 'light');
  ticks(14);
  game.input(1, 'block');
  ticks(14);
  assert.equal(game.players[0].state, 'stunned');
  assert.equal(game.players[1].hp, 100);
  assert.equal(game.input(1, 'light'), 'riposte');
  ticks(30);
  assert.deepEqual(events.filter(e => ['parry', 'riposte'].includes(e.event)).map(e => [e.event, e.fighter]), [['parry', 0], ['riposte', 1]]);
  assert.equal(game.players[0].hp, 100 - attacks.riposte.damage);
  assert.equal(game.players[1].riposte, 0);
  ticks(45);
  assert.equal(game.players[1].state, 'block');
  assert.equal(game.players[1].guardStart, 0);
});

test('holding guard early on low stamina breaks guard and delays recovery', () => {
  const { game, ticks, events } = setup();
  const defender = game.players[1];
  defender.stamina = 20;
  game.input(1, 'block');
  game.input(0, 'heavy');
  ticks(43);
  assert.ok(events.some(e => e.event === 'break'));
  assert.equal(defender.hp, 92);
  assert.equal(defender.stamina, 0);
  assert.equal(defender.state, 'stunned');
  game.input(1, 'release');
  ticks(85);
  assert.equal(defender.state, 'idle');
  assert.ok(defender.stamina > 4);
});

test('directional dodges spend stamina and avoid active frames', () => {
  const { game, ticks, events } = setup();
  const defender = game.players[1];
  game.input(0, 'light');
  ticks(17);
  game.input(1, 'dodge', { x: 0, z: 1 });
  ticks(20);
  assert.ok(events.some(e => e.event === 'evade'));
  assert.equal(defender.hp, 100);
  assert.equal(defender.stamina, 77);
  assert.ok(defender.z > 1.3);
});

test('simultaneous strikes clash without a player-one advantage', () => {
  const { game, ticks, events } = setup();
  game.input(0, 'light');
  game.input(1, 'light');
  ticks(23);
  assert.ok(events.some(e => e.event === 'clash'));
  for (const p of game.players) {
    assert.equal(p.hp, 100);
    assert.equal(p.state, 'stunned');
    assert.equal(p.stamina, 75);
  }
});

test('late input buffers into recovery and early input expires', () => {
  const { game, ticks, close } = setup();
  game.input(0, 'light');
  ticks(2);
  game.input(0, 'heavy');
  ticks(58);
  assert.equal(game.players[0].state, 'idle');
  close();
  game.input(0, 'light');
  ticks(43);
  game.input(0, 'heavy');
  ticks(14);
  assert.equal(game.players[0].attack, 'heavy');
});

test('round timeout compares health and a tied timeout enters sudden death', () => {
  const { game, ticks, events } = setup();
  game.time = STEP / 2;
  ticks();
  assert.equal(game.reason, 'overtime');
  assert.ok(events.some(e => e.event === 'overtime'));
  game.input(1, 'light');
  ticks(25);
  assert.equal(game.phase, 'over');
  assert.equal(game.winner, 1);
  ticks(175);
  assert.equal(game.round, 2);
  assert.equal(game.players[1].wins, 1);
  ticks(130);
  game.time = STEP / 2;
  game.players[0].hp = 83;
  ticks();
  assert.equal(game.reason, 'time');
  ticks(175);
  assert.equal(game.phase, 'finished');
  assert.equal(game.players[1].wins, 2);
});

test('practice tracks blocking and advances to timed parries', () => {
  const practice = new Practice(() => {});
  const { game, ticks } = setup(practice);
  game.input(0, 'block');
  ticks(160);
  assert.equal(game.prompt.title, 'Parry the strike');
  assert.equal(game.snapshot().time, null);
});

test('heavy feints recover with partial cost and cannot cancel active frames', () => {
  const { game, ticks, events } = setup();
  const fighter = game.players[0];
  game.input(0, 'heavy');
  ticks(29);
  assert.equal(game.input(0, 'feint'), 'feint');
  assert.equal(fighter.stamina, 85);
  assert.equal(fighter.state, 'feint');
  ticks(18);
  assert.equal(fighter.state, 'idle');
  assert.equal(game.players[1].hp, 100);
  assert.equal(events.filter(e => e.event === 'feint').length, 1);
  game.input(0, 'heavy');
  ticks(40);
  assert.equal(game.input(0, 'feint'), false);
  assert.equal(game.players[1].hp, 70);
});

test('fighters cannot use the arena edge to squeeze through one another', () => {
  const { game, ticks } = setup();
  const [a, b] = game.players;
  a.x = 8.65;
  b.x = 9;
  for (let i = 0; i < 45; i++) ticks(1, [{ x: 1 }, { x: 1 }]);
  assert.ok(b.x <= 9);
  assert.ok(b.x - a.x >= 1.269);
});
