import { Bot } from '../domain/bot.js';
import { neutralInput, TICK, type Input } from '../domain/combat.js';
import { Match, type Snapshot } from '../domain/match.js';
import type { World } from '../domain/world.js';
import type { ClientMessage } from './protocol.js';

export interface RoomInfo {
  code: string;
  host: string;
  self: string;
}

export interface Session {
  readonly playerId: string;
  readonly room?: RoomInfo;
  readonly latency?: number;
  readonly error?: string;
  readonly snapshot: Snapshot | undefined;
  update(input: Input, dt: number): void;
  restart(): void;
  close(): void;
}

export interface SessionFactory {
  solo(world: World, name: string): Session;
  online(request: Extract<ClientMessage, { type: 'create' | 'join' }>, world: World): Session;
}

const BOT_NAMES = ['ROOK', 'SABLE', 'KITE', 'REED', 'MOTH'];

export class SoloSession implements Session {
  readonly playerId = 'player';
  private readonly match: Match;
  private readonly bots: Bot[];
  private accumulator = 0;

  constructor(world: World, name: string) {
    this.match = new Match(world);
    this.match.addPlayer(this.playerId, name);
    this.bots = BOT_NAMES.map((callsign, index) => {
      const id = `bot-${index}`;
      this.match.addPlayer(id, callsign, true);
      return new Bot(id, index);
    });
    this.match.start();
  }

  get snapshot(): Snapshot { return this.match.snapshot(); }

  update(input: Input, dt: number): void {
    this.match.setInput(this.playerId, input);
    this.accumulator += dt;
    while (this.accumulator >= TICK) {
      for (const bot of this.bots) this.match.setInput(bot.id, bot.decide(this.match, TICK));
      this.match.step();
      this.accumulator -= TICK;
    }
  }

  restart(): void {
    this.accumulator = 0;
    this.match.start();
  }

  close(): void { this.match.setInput(this.playerId, neutralInput()); }
}
