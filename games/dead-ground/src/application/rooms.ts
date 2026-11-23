import { callsign, roomCode, type ServerMessage } from './protocol.js';
import { TICK, type Input } from '../domain/combat.js';
import { Match } from '../domain/match.js';
import { clamp } from '../domain/math.js';
import type { World } from '../domain/world.js';

/** A connection to one player. `send` takes serialized JSON. Peers sharing a `group` get one `group.send` per broadcast. */
export interface RoomPeer {
  id: string;
  send(payload: string): void;
  group?: { send(payload: string): void };
  room?: Room;
  seq: number;
  lastInput: number;
}
export interface Room {
  code: string;
  host: string;
  match: Match;
  peers: Set<RoomPeer>;
}
export interface RoomHubOptions {
  maxRooms: number;
  makeCode(taken: ReadonlyMap<string, Room>): string;
}

export function parseInput(value: unknown): Input | undefined {
  if (typeof value !== 'object' || value === null) return;
  const raw = value as Record<string, unknown>;
  const numberValues = ['yaw', 'pitch', 'forward', 'strafe', 'fire', 'reload'] as const;
  if (numberValues.some(key => typeof raw[key] !== 'number' || !Number.isFinite(raw[key]))) return;
  const v = raw as Record<(typeof numberValues)[number], number> & Record<string, unknown>;
  return {
    yaw: Math.atan2(Math.sin(v.yaw), Math.cos(v.yaw)), pitch: clamp(v.pitch, -1.48, 1.48),
    forward: clamp(v.forward, -1, 1), strafe: clamp(v.strafe, -1, 1),
    crouch: v.crouch === true, sprint: v.sprint === true, aim: v.aim === true, breath: v.breath === true,
    fire: Math.floor(clamp(v.fire, 0, Number.MAX_SAFE_INTEGER)),
    reload: Math.floor(clamp(v.reload, 0, Number.MAX_SAFE_INTEGER)),
  };
}

/**
 * Authoritative room rules with no transport. The Node server feeds it WebSocket peers and the browser host
 * feeds it a local peer plus relay guests. Messages arrive already JSON-decoded.
 */
export class RoomHub {
  readonly rooms = new Map<string, Room>();
  private accumulator = 0;
  private ticks = 0;

  constructor(private readonly world: World, private readonly options: RoomHubOptions) {}

  message(peer: RoomPeer, message: unknown, now = Date.now()): void {
    if (typeof message !== 'object' || message === null) return;
    const m = message as Record<string, unknown>;
    if (m.type === 'ping' && typeof m.time === 'number' && Number.isFinite(m.time)) {
      this.send(peer, { type: 'pong', time: m.time });
    } else if (m.type === 'create' && !peer.room) {
      if (this.rooms.size >= this.options.maxRooms) { this.fail(peer, 'Room server is at capacity. Try again later.'); return; }
      const code = this.options.makeCode(this.rooms);
      const room: Room = { code, host: peer.id, match: new Match(this.world), peers: new Set() };
      this.rooms.set(code, room);
      this.enter(peer, room, callsign(typeof m.name === 'string' ? m.name : ''));
    } else if (m.type === 'join' && !peer.room) {
      const room = typeof m.code === 'string' ? this.rooms.get(roomCode(m.code)) : undefined;
      if (!room) { this.fail(peer, 'Room code not found.'); return; }
      this.enter(peer, room, callsign(typeof m.name === 'string' ? m.name : ''));
    } else if (m.type === 'start' && peer.room?.host === peer.id) {
      if (peer.room.match.start()) this.broadcast(peer.room);
    } else if (m.type === 'input' && peer.room?.match.phase === 'active'
      && typeof m.seq === 'number' && Number.isSafeInteger(m.seq) && m.seq > peer.seq) {
      const player = peer.room.match.players.get(peer.id);
      const input = parseInput(m.input);
      if (!player || m.generation !== player.generation || !input) return;
      peer.seq = m.seq;
      peer.lastInput = now;
      peer.room.match.setInput(peer.id, input);
    }
  }

  leave(peer: RoomPeer): void {
    const room = peer.room;
    if (!room) return;
    peer.room = undefined;
    room.peers.delete(peer);
    room.match.removePlayer(peer.id);
    const successor = room.peers.values().next().value;
    if (!successor) { this.rooms.delete(room.code); return; }
    if (room.host === peer.id) room.host = successor.id;
    if (room.peers.size < 2 && room.match.phase !== 'lobby') room.match.resetLobby();
    this.announce(room);
  }

  /** Runs fixed simulation ticks for `dt` seconds and broadcasts snapshots at a third of the tick rate. */
  advance(dt: number, now = Date.now()): void {
    this.accumulator += Math.min(dt, 0.15);
    while (this.accumulator >= TICK) {
      this.accumulator -= TICK;
      this.ticks++;
      for (const room of this.rooms.values()) {
        if (room.match.phase !== 'active') continue;
        for (const peer of room.peers) {
          if (now - peer.lastInput < 500) continue;
          room.match.stopInput(peer.id);
        }
        const finished = room.match.step();
        if (this.ticks % 3 === 0 || finished) this.broadcast(room);
      }
    }
  }

  private send(peer: RoomPeer, message: ServerMessage): void { peer.send(JSON.stringify(message)); }

  private fail(peer: RoomPeer, message: string): void { this.send(peer, { type: 'error', message }); }

  private announce(room: Room): void {
    for (const peer of room.peers) this.send(peer, { type: 'room', room: { code: room.code, self: peer.id, host: room.host } });
    this.broadcast(room);
  }

  private broadcast(room: Room): void {
    const payload = JSON.stringify({ type: 'state', state: room.match.snapshot() } satisfies ServerMessage);
    const groups = new Set<{ send(payload: string): void }>();
    for (const peer of room.peers) {
      if (!peer.group) peer.send(payload);
      else if (!groups.has(peer.group)) { groups.add(peer.group); peer.group.send(payload); }
    }
  }

  private enter(peer: RoomPeer, room: Room, name: string): void {
    if (peer.room) return;
    if (room.match.phase !== 'lobby') { this.fail(peer, 'That room is already in a round. Ask the host for a new room.'); return; }
    if (!room.match.addPlayer(peer.id, name)) { this.fail(peer, 'That room is full.'); return; }
    peer.room = room;
    room.peers.add(peer);
    this.announce(room);
  }
}
