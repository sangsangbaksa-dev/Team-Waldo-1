import { Game } from './game.js';
import { PROTOCOL_VERSION, roomCode, validRoom, roomActions, readDirection } from './room-protocol.js';

const IDLE_MS = 20 * 60_000;
const WAITING_MS = 12 * 60_000;
const STOPPED = { x: 0, z: 0 };

/**
 * Authoritative duel rooms with no transport of its own. A peer is any object with `send(message)`.
 * The Node room server drives it from WebSockets and the browser host drives it from a broadcast relay.
 */
export class Rooms {
  constructor({ makeCode, maxRooms = 500, snapshotMs = 50, now = () => performance.now() } = {}) {
    this.makeCode = makeCode;
    this.maxRooms = maxRooms;
    this.snapshotMs = snapshotMs;
    this.now = now;
    this.rooms = new Map();
  }

  get size() { return this.rooms.size; }

  send(peer, message) { peer.send(message); }

  broadcast(room, message) {
    for (const peer of room.peers) this.send(peer, message);
  }

  close(room, message) {
    this.rooms.delete(room.code);
    for (const peer of room.peers) {
      peer.room = null;
      if (message) this.send(peer, { type: 'peer-left', message });
    }
  }

  leave(peer) {
    const room = peer.room;
    if (!room) return;
    room.peers = room.peers.filter(other => other !== peer);
    peer.room = null;
    this.close(room, 'Your opponent left the room.');
  }

  open(room) {
    room.game = new Game((event, player, detail) => {
      this.broadcast(room, { type: 'event', event, player, detail });
    });
    room.inputs = [STOPPED, STOPPED];
    room.inputAt = [0, 0];
    room.rematch.clear();
    room.lastSnapshot = 0;
    room.activeAt = this.now();
    this.broadcast(room, { type: 'start', state: room.game.snapshot(true) });
  }

  message(peer, msg) {
    const now = this.now();
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'create' || msg.type === 'join') {
      if (msg.version !== PROTOCOL_VERSION) return this.send(peer, { type: 'error', message: 'Update the game and room server to the same version.' });
      if (msg.type === 'create') {
        if (this.rooms.size >= this.maxRooms) return this.send(peer, { type: 'error', message: 'Server is at capacity. Try again shortly.' });
        this.leave(peer);
        const code = this.makeCode(this.rooms);
        const room = { code, peers: [peer], rematch: new Set(), activeAt: now, game: null };
        this.rooms.set(code, room);
        peer.room = room;
        this.send(peer, { type: 'created', code, player: 0 });
      } else {
        const code = roomCode(msg.code);
        const room = validRoom(code) ? this.rooms.get(code) : null;
        if (!room || room.peers.length !== 1 || room === peer.room) {
          return this.send(peer, { type: 'error', message: 'Room code was not found or the room is full.' });
        }
        this.leave(peer);
        room.peers.push(peer);
        peer.room = room;
        this.send(peer, { type: 'joined', code, player: 1 });
        this.open(room);
      }
      return;
    }
    if (msg.type === 'ping' && Number.isSafeInteger(msg.id)) {
      return this.send(peer, { type: 'pong', id: msg.id });
    }
    const room = peer.room;
    if (!room?.game || room.peers.length !== 2) return;
    const index = room.peers.indexOf(peer);
    if (msg.type === 'input') {
      room.inputs[index] = readDirection(msg.input);
      room.inputAt[index] = now;
      if (typeof msg.guard === 'boolean' && msg.guard !== room.game.players[index].guardHeld) {
        room.game.input(index, msg.guard ? 'block' : 'release');
      }
      if (room.inputs[index].x || room.inputs[index].z) room.activeAt = now;
    } else if (msg.type === 'action' && roomActions.has(msg.action)) {
      if (msg.action !== 'release') room.activeAt = now;
      room.game.input(index, msg.action, readDirection(msg.direction));
    } else if (msg.type === 'rematch' && room.game.phase === 'finished') {
      room.rematch.add(peer);
      room.activeAt = now;
      if (room.rematch.size === 2) this.open(room);
      else this.broadcast(room, { type: 'rematch', player: index });
    }
  }

  tick(dt) {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      if (now - room.activeAt > (room.game ? IDLE_MS : WAITING_MS)) {
        this.close(room, 'This room expired.');
        continue;
      }
      if (!room.game) continue;
      for (let i = 0; i < 2; i++) {
        if (now - room.inputAt[i] > 300) {
          room.inputs[i] = STOPPED;
          room.game.input(i, 'release');
        }
      }
      room.game.update(dt, room.inputs, false);
      if (now - room.lastSnapshot >= this.snapshotMs) {
        room.lastSnapshot = now;
        this.broadcast(room, { type: 'state', state: room.game.snapshot(true) });
      }
    }
  }
}
