import { fighter, act, stepFighter, resolve, face, constrain, inStrikeRange, resolveClash, attacks } from '../domain/combat.js';
import { Opponent } from './opponent.js';

export const STEP = 1 / 60;
export const ROUND_SECONDS = 65;
const freeze = { hit: 0.05, riposte: 0.085, parry: 0.10, break: 0.067, block: 0.026, clash: 0.067 };

export class Game {
  constructor(onEvent = () => {}, { random = Math.random } = {}) {
    this.onEvent = onEvent;
    this.random = random;
    this.resetMatch();
  }

  resetMatch(difficulty = 'gladiator') {
    this.round = 1;
    this.difficulty = difficulty;
    this.players = [];
    this.stats = [0, 1].map(() => ({ damage: 0, parries: 0, ripostes: 0 }));
    this.startRound();
  }

  startRound() {
    const wins = this.players.map(p => p.wins);
    this.players = [fighter(0, -2.35, 0), fighter(1, 2.35, 0)];
    this.players.forEach((f, i) => { f.wins = wins[i] || 0; });
    this.phase = 'ready';
    this.count = 2.05;
    this.time = ROUND_SECONDS;
    this.winner = -1;
    this.reason = '';
    this.stop = 0;
    this.accumulator = 0;
    this.ai = new Opponent(this.difficulty, this.random);
  }

  input(i, action, direction) {
    if (!this.players[i]) return false;
    if (this.phase !== 'fight') {
      if (action === 'release' || (this.phase === 'ready' && action === 'block')) {
        const p = this.players[i];
        act(p, action);
        p.guardStart = p.parryLock = 0;
      }
      return false;
    }
    return this.handleAction(i, action, direction);
  }

  handleAction(i, action, direction, buffer = true) {
    const fired = act(this.players[i], action, direction, buffer);
    this.announceAction(i, fired);
    return fired;
  }

  announceAction(i, action) {
    if (!action || action === 'block') return;
    this.onEvent(action === 'dodge' || action === 'feint' ? action : 'swing', i, { attack: action });
  }

  update(dt, inputs, solo = true) {
    this.accumulator += Math.min(dt, 0.25);
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP;
      this.tick(inputs, solo);
    }
  }

  tick(inputs, solo) {
    if (this.phase === 'ready') {
      this.count -= STEP;
      if (this.count <= 0) {
        this.phase = 'fight';
        this.onEvent('fight');
      }
      return;
    }
    if (this.phase === 'over') {
      this.count -= STEP;
      if (this.count <= 0) {
        if (this.players.some(p => p.wins >= 2)) this.phase = 'finished';
        else {
          if (this.winner >= 0) this.round++;
          this.startRound();
        }
      }
      return;
    }
    if (this.phase !== 'fight') return;
    if (this.stop > 0) {
      this.stop -= STEP;
      return;
    }

    const [a, b] = this.players;
    const aiInput = solo ? this.ai.update(STEP, b, a, (action, direction) => this.handleAction(1, action, direction, false)) : inputs[1];
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      if (p.state === 'idle' || p.state === 'block' || (p.state === 'attack' && p.timer < 0.10)) face(p, this.players[1 - i]);
    }
    for (let i = 0; i < 2; i++) {
      const fired = stepFighter(this.players[i], STEP, i ? aiInput : inputs[0]);
      this.announceAction(i, fired);
    }
    constrain(a, b);

    const both = inStrikeRange(a, b) && inStrikeRange(b, a);
    const swingLead = both ? (a.timer - attacks[a.attack].windup) - (b.timer - attacks[b.attack].windup) : 0;
    if (both && Math.abs(swingLead) < STEP / 2) {
      resolveClash(a, b);
      this.stop = freeze.clash;
      this.onEvent('clash', 0);
    } else {
      for (const i of swingLead < 0 ? [1, 0] : [0, 1]) {
        const result = resolve(this.players[i], this.players[1 - i]);
        if (result) {
          this.stop = Math.max(this.stop, freeze[result.type] || 0);
          if (result.damage) this.stats[i].damage += result.damage;
          if (result.type === 'parry') this.stats[1 - i].parries++;
          if (result.type === 'riposte') this.stats[i].ripostes++;
          this.onEvent(result.type, i, result);
        }
      }
    }
    this.time = Math.max(0, this.time - STEP);
    if (a.hp <= 0 || b.hp <= 0) this.endRound(a.hp > b.hp ? 0 : 1, 'knockout');
    else if (this.time <= 0 && a.hp !== b.hp) this.endRound(a.hp > b.hp ? 0 : 1, 'time');
    else if (this.time <= 0 && !this.reason) {
      this.reason = 'overtime';
      this.onEvent('overtime');
    }
  }

  endRound(winner, reason) {
    this.winner = winner;
    this.reason = reason;
    this.players[winner].wins++;
    this.phase = 'over';
    this.count = 2.65;
    this.onEvent('round', winner, { reason });
  }

  snapshot(compact = false) {
    const { players, round, phase, count, winner, reason, time, stats } = this;
    return { players: compact ? players.map(fighterView) : players, round, phase, count, winner, reason, time, stats };
  }
}

function fighterView({ x, z, angle, hp, stamina, wins, state, timer, attack, guardStart, stun, dodgeX, moveX, moveZ, riposte }) {
  return { x, z, angle, hp, stamina, wins, state, timer, attack, guardStart, stun, dodgeX, moveX, moveZ, riposte };
}
