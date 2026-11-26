import type { ClientMessage, ServerMessage } from '../application/protocol.js';
import type { RoomInfo, Session } from '../application/session.js';
import { neutralInput, type Input } from '../domain/combat.js';
import type { Snapshot } from '../domain/match.js';
import type { World } from '../domain/world.js';
import { guestLink, hostLink, socketLink, transportChoice, type Link, type LinkEvents } from './link.js';

export class OnlineSession implements Session {
  private readonly link: Link;
  private deadline = 0;
  private sequence = 0;
  private outgoingTime = 0;
  private pingedAt = -Infinity;
  private stopping = false;
  room?: RoomInfo;
  snapshot: Snapshot | undefined;
  latency?: number;
  error?: string;

  constructor(request: Extract<ClientMessage, { type: 'create' | 'join' }>, world: World) {
    const transport = transportChoice();
    const events: LinkEvents = {
      opened: () => this.send(request),
      message: message => this.receive(message),
      failed: reason => { if (!this.stopping) this.error = reason; },
      closed: () => { if (!this.stopping) this.error ??= 'Disconnected from the room.'; },
    };
    if (transport === 'socket') {
      const configured = (import.meta as ImportMeta & { env?: { VITE_WS_URL?: string } }).env?.VITE_WS_URL;
      const endpoint = configured || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
      this.link = socketLink(endpoint, events, () => this.stopping);
    } else this.link = request.type === 'create' ? hostLink(world, events, transport) : guestLink(events, transport);
    this.deadline = window.setTimeout(() => {
      if (this.room || this.stopping) return;
      this.error = 'Connection timed out. Check the room server and retry.';
      this.close();
    }, 10000);
  }

  private receive(message: ServerMessage): void {
    switch (message.type) {
      case 'room':
        window.clearTimeout(this.deadline);
        this.room = message.room;
        break;
      case 'state':
        this.snapshot = message.state;
        break;
      case 'error':
        this.error = message.message;
        break;
      case 'pong':
        this.latency = Math.round(performance.now() - message.time);
        break;
    }
  }

  get playerId(): string { return this.room?.self ?? ''; }

  update(input: Input, dt: number): void {
    if (!this.room) return;
    const now = performance.now();
    if (now - this.pingedAt >= 2500) {
      this.pingedAt = now;
      this.send({ type: 'ping', time: now });
    }
    this.outgoingTime += dt;
    const interval = transportChoice() === 'socket' ? 1 / 40 : 1 / 20;
    if (this.outgoingTime < interval || this.snapshot?.phase !== 'active') return;
    this.outgoingTime %= interval;
    const player = this.snapshot.players.find(player => player.id === this.playerId);
    if (player) this.send({ type: 'input', seq: ++this.sequence, generation: player.generation, input });
  }

  hold(input: Input): void {
    this.update({ ...neutralInput(input.yaw, input.pitch), fire: input.fire, reload: input.reload }, 1);
  }

  restart(): void { this.send({ type: 'start' }); }

  close(): void {
    this.stopping = true;
    window.clearTimeout(this.deadline);
    this.link.close();
  }

  private send(message: ClientMessage): void { this.link.send(message); }
}
