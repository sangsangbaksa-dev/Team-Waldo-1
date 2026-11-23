import { Game, STEP, ROUND_SECONDS } from './game.js';
import { attacks } from '../domain/combat.js';

const lessons = [
  { title: 'Raise your guard', prompt: 'Hold Guard as the instructor swings. Keep it held through the hit.', event: 'block', player: 1, total: 1 },
  { title: 'Parry the strike', prompt: 'Release guard. Raise it again as the lock-on diamond flashes, just before the blade lands.', event: 'parry', player: 1, total: 2 },
  { title: 'Take the opening', prompt: 'Parry, then use Light while the instructor is staggered.', event: 'riposte', player: 0, total: 1 },
  { title: 'Dodge through the swing', prompt: 'When the diamond flashes, dodge sideways. Slip past the blade or move out of its reach.', event: 'evade', player: 1, total: 1 },
  { title: 'Free practice', prompt: 'Keep practicing, or return to the main menu to challenge a rival.' },
];

export class Practice extends Game {
  constructor(onEvent) {
    super();
    this.lesson = 0;
    this.progress = 0;
    this.wait = 1.2;
    this.dodgeAttempt = false;
    this.onEvent = (event, player, detail) => {
      if (player === 1 && (event === 'hit' || event === 'evade')) this.dodgeAttempt = false;
      const current = lessons[this.lesson];
      if (current.event === event && current.player === player) {
        this.progress++;
        if (this.progress === current.total) {
          this.lesson++;
          this.progress = 0;
          onEvent('lesson', 0, { title: lessons[this.lesson].title });
        }
      }
      onEvent(event, player, detail);
      for (const f of this.players) {
        if (f.hp < 12) f.hp = 100;
      }
    };
  }

  get prompt() {
    const lesson = lessons[this.lesson];
    return { title: lesson.title, text: lesson.prompt, count: lesson.total ? this.progress + ' / ' + lesson.total : 'DRILLS COMPLETE' };
  }

  input(index, action, direction) {
    const fired = super.input(index, action, direction);
    if (index === 0 && fired === 'dodge' && this.lesson === 3) {
      const [player, teacher] = this.players;
      const swing = attacks[teacher.attack];
      const distance = Math.hypot(player.x - teacher.x, player.z - teacher.z);
      this.dodgeAttempt = swing && !teacher.hit && distance <= swing.range + swing.lunge
        && teacher.timer >= swing.windup - 0.24 && teacher.timer < swing.windup + swing.active;
    }
    return fired;
  }

  snapshot() {
    return { ...super.snapshot(), time: null };
  }

  tick(inputs) {
    if (this.phase !== 'fight' || this.stop > 0) {
      super.tick(inputs, false);
      return;
    }
    this.time = ROUND_SECONDS;
    const [player, teacher] = this.players;
    const dx = player.x - teacher.x, dz = player.z - teacher.z;
    const distance = Math.hypot(dx, dz);
    const direction = distance > 2.19 ? { x: dx / distance * 0.55, z: dz / distance * 0.55 } : { x: 0, z: 0 };
    this.wait -= STEP;
    if (this.wait <= 0 && distance < 2.65 && teacher.state === 'idle') {
      this.handleAction(1, 'heavy', undefined, false);
      this.wait = 2.85;
    }
    super.tick([inputs[0], direction], false);
    if (this.dodgeAttempt) {
      const swing = attacks[teacher.attack];
      if (!swing) this.dodgeAttempt = false;
      else if (teacher.timer >= swing.windup + swing.active && !teacher.hit) this.onEvent('evade', 1);
    }
  }
}
