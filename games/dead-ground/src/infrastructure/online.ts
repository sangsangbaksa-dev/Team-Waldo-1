import type { ClientMessage, ServerMessage } from '../application/protocol.js';
import type { RoomInfo, Session } from '../application/session.js';
import type { Input } from '../domain/combat.js';
import type { Snapshot } from '../domain/match.js';

export class OnlineSession implements Session {
  private socket: WebSocket;
  private sequence = 0;
  private outgoingTime = 0;
  private pingedAt = -Infinity;
  private stopping = false;
  room?: RoomInfo;
  snapshot: Snapshot | undefined;
  latency?: number;
  error?: string;

  constructor(request: Extract<ClientMessage, { type: 'create' | 'join' }>) {
    const configured = (import.meta as ImportMeta & { env?: { VITE_WS_URL?: string } }).env?.VITE_WS_URL;
    const endpoint = configured || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
    this.socket = new WebSocket(endpoint);
    const deadline = window.setTimeout(() => {
      if (this.room || this.stopping) return;
      this.error = 'Connection timed out. Check the room server and retry.';
      this.close();
    }, 6500);
    this.socket.addEventListener('open', () => this.send(request));
    this.socket.addEventListener('error', () => {
      if (!this.stopping) this.error = 'Room server unavailable. Try again or deploy solo.';
    });
    this.socket.addEventListener('close', () => {
      window.clearTimeout(deadline);
      if (!this.stopping) this.error ??= 'Disconnected from the room.';
    });
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(String(data)) as ServerMessage;
      switch (message.type) {
        case 'room':
          window.clearTimeout(deadline);
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
    });
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
    if (this.outgoingTime < 1 / 40 || this.snapshot?.phase !== 'active') return;
    this.outgoingTime %= 1 / 40;
    const player = this.snapshot.players.find(player => player.id === this.playerId);
    if (player) this.send({ type: 'input', seq: ++this.sequence, generation: player.generation, input });
  }

  restart(): void { this.send({ type: 'start' }); }

  close(): void {
    this.stopping = true;
    this.socket.close();
  }

  private send(message: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}
