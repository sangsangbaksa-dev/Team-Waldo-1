import { attacks, PARRY_WINDOW } from '../domain/combat.js';

const profiles = {
  squire: { reaction: 0.32, defense: 0.43, parry: 0.06, interval: 0.46, feint: 0 },
  gladiator: { reaction: 0.23, defense: 0.63, parry: 0.25, interval: 0.30, feint: 0.19 },
  champion: { reaction: 0.15, defense: 0.81, parry: 0.43, interval: 0.18, feint: 0.43 },
};

export class Opponent {
  constructor(level, random = Math.random) {
    this.profile = profiles[level] || profiles.gladiator;
    this.random = random;
    this.wait = 0.5;
    this.guard = 0;
    this.pending = null;
    this.seen = 0;
    this.bait = false;
    this.reactAfter = this.profile.reaction;
    this.posture = 0;
    this.side = random() < 0.5 ? -1 : 1;
  }

  update(dt, self, player, act) {
    const roll = this.random;
    const profile = this.profile;
    const dx = player.x - self.x, dz = player.z - self.z;
    const distance = Math.max(0.001, Math.hypot(dx, dz));
    const x = dx / distance, z = dz / distance;
    this.wait -= dt;
    this.guard -= dt;
    this.posture = Math.max(0, this.posture - dt * 0.06);
    if (self.state === 'stunned' && player.riposte > 0) this.posture = Math.min(0.4, this.posture + dt * 0.9);
    if (self.state === 'attack' && self.attack === 'heavy' && self.timer > 0.32 && player.state === 'block' && this.bait) {
      if (act('feint')) {
        this.wait = 0.37 + roll() * 0.12;
        this.bait = false;
      }
    }
    if (this.guard <= 0 && self.guardHeld) act('release');
    if (self.state === 'stunned') this.pending = null;

    if (player.state !== 'attack' || (this.seen && player.timer < this.seen)) {
      if (this.seen) this.reactAfter = profile.reaction + (roll() - 0.5) * 0.07;
      this.seen = 0;
      this.pending = null;
    }
    if (player.state === 'attack' && !this.seen && player.timer >= this.reactAfter) {
      this.seen = player.timer;
      const threat = attacks[player.attack];
      const until = threat.windup - player.timer;
      if (distance < threat.range + threat.lunge + 0.3 && until > 0.014 && roll() < profile.defense) {
        const chance = roll();
        this.pending = chance < profile.parry
          ? { action: 'block', delay: Math.max(0, until - 0.087) }
          : { action: until > PARRY_WINDOW + dt && chance < 0.78 ? 'block' : 'dodge', delay: 0 };
      }
    }

    const retreat = self.stamina < 32;
    const direction = { x: z * this.side, z: -x * this.side };
    if (this.pending) {
      this.pending.delay -= dt;
      if (this.pending.delay <= 0) {
        const action = this.pending.action;
        const fired = act(action, direction);
        if (action === 'block' && (fired || self.guardHeld)) this.guard = 0.54;
        this.pending = null;
        this.wait = Math.max(this.wait, 0.30);
      }
    }
    if ((self.state === 'idle' || self.state === 'block') && this.wait <= 0 && !this.pending) {
      this.wait = profile.interval + roll() * 0.36;
      if (self.riposte > 0 && distance < 3) act('light');
      else if (!retreat && distance < 3.02 && !self.guardHeld) {
        const heavy = player.guardHeld || player.state === 'stunned' || roll() < 0.26 + this.posture * 0.7;
        const fired = act(heavy ? 'heavy' : 'light');
        this.bait = fired === 'heavy' && roll() < profile.feint * (0.65 + this.posture * 4);
      }
      if (roll() < 0.23) this.side *= -1;
    }

    if (distance > 2.65 && !retreat) return { x, z };
    const advance = retreat ? -0.8 : distance > 2.27 ? 0.45 : distance < 1.72 ? -0.65 : 0;
    return { x: x * advance + direction.x * 0.58, z: z * advance + direction.z * 0.58 };
  }
}
