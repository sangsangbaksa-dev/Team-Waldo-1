import { randomInt } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { WebSocket, WebSocketServer } from 'ws';
import { Game } from '../src/application/game.js';
import { PROTOCOL_VERSION, ROOM_ALPHABET, ROOM_LENGTH, roomCode, validRoom, roomActions, readDirection } from '../src/application/room-protocol.js';

const SNAPSHOT_MS = 50;
const IDLE_MS = 20 * 60_000;
const WAITING_MS = 12 * 60_000;
const MAX_ROOMS = 500;
const STOPPED = { x: 0, z: 0 };

export function startRoomServer({ port = 8080, origins = [] } = {}) {
  const rooms = new Map();
  const http = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION }));
      return;
    }
    res.writeHead(404).end();
  });
  const sockets = new WebSocketServer({
    server: http,
    maxPayload: 2048,
    perMessageDeflate: false,
    verifyClient: ({ origin }) => !origins.length || origins.includes(origin),
  });

  function send(peer, msg) {
    if (peer.readyState !== WebSocket.OPEN) return;
    if (peer.bufferedAmount > 128 * 1024) {
      peer.close(1008, 'Client too slow');
      return;
    }
    peer.send(JSON.stringify(msg));
  }
  function broadcast(room, msg) {
    for (const peer of room.peers) send(peer, msg);
  }
  function closeRoom(room, message) {
    rooms.delete(room.code);
    for (const peer of room.peers) {
      peer.room = null;
      if (message) send(peer, { type: 'peer-left', message });
    }
  }
  function leave(peer) {
    const room = peer.room;
    if (!room) return;
    room.peers = room.peers.filter(other => other !== peer);
    peer.room = null;
    closeRoom(room, 'Your opponent left the room.');
  }
  function openMatch(room) {
    room.game = new Game((event, player, detail) => {
      broadcast(room, { type: 'event', event, player, detail });
    });
    room.inputs = [STOPPED, STOPPED];
    room.inputAt = [0, 0];
    room.rematch.clear();
    room.lastSnapshot = 0;
    room.activeAt = performance.now();
    broadcast(room, { type: 'start', state: room.game.snapshot(true) });
  }
  function uniqueCode() {
    let code;
    do {
      code = Array.from({ length: ROOM_LENGTH }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join('');
    } while (rooms.has(code));
    return code;
  }

  sockets.on('connection', peer => {
    peer.alive = true;
    peer.windowAt = performance.now();
    peer.messages = 0;
    peer.on('pong', () => { peer.alive = true; });
    peer.on('close', () => leave(peer));
    peer.on('error', () => leave(peer));
    peer.on('message', (raw, binary) => {
      if (binary) return;
      const now = performance.now();
      if (now - peer.windowAt >= 1000) {
        peer.windowAt = now;
        peer.messages = 0;
      }
      if (++peer.messages > 95) return peer.close(1008, 'Message limit');
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'create' || msg.type === 'join') {
        if (msg.version !== PROTOCOL_VERSION) return send(peer, { type: 'error', message: 'Update the game and room server to the same version.' });
        if (msg.type === 'create') {
          if (rooms.size >= MAX_ROOMS) return send(peer, { type: 'error', message: 'Server is at capacity. Try again shortly.' });
          leave(peer);
          const code = uniqueCode();
          const room = { code, peers: [peer], rematch: new Set(), activeAt: now, game: null };
          rooms.set(code, room);
          peer.room = room;
          send(peer, { type: 'created', code, player: 0 });
        } else {
          const code = roomCode(msg.code);
          const room = validRoom(code) ? rooms.get(code) : null;
          if (!room || room.peers.length !== 1 || room === peer.room) {
            return send(peer, { type: 'error', message: 'Room code was not found or the room is full.' });
          }
          leave(peer);
          room.peers.push(peer);
          peer.room = room;
          send(peer, { type: 'joined', code, player: 1 });
          openMatch(room);
        }
        return;
      }
      if (msg.type === 'ping' && Number.isSafeInteger(msg.id)) {
        return send(peer, { type: 'pong', id: msg.id });
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
        if (room.rematch.size === 2) openMatch(room);
        else broadcast(room, { type: 'rematch', player: index });
      }
    });
  });

  let last = performance.now();
  const ticker = setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    for (const room of rooms.values()) {
      if (now - room.activeAt > (room.game ? IDLE_MS : WAITING_MS)) {
        closeRoom(room, 'This room expired.');
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
      if (now - room.lastSnapshot >= SNAPSHOT_MS) {
        room.lastSnapshot = now;
        broadcast(room, { type: 'state', state: room.game.snapshot(true) });
      }
    }
  }, 1000 / 60);
  const heartbeat = setInterval(() => {
    for (const peer of sockets.clients) {
      if (!peer.alive) peer.terminate();
      else {
        peer.alive = false;
        peer.ping();
      }
    }
  }, 25_000);

  http.listen(port);
  return {
    http,
    close() {
      clearInterval(ticker);
      clearInterval(heartbeat);
      for (const peer of sockets.clients) peer.terminate();
      sockets.close();
      http.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8080);
  const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const roomServer = startRoomServer({ port, origins });
  roomServer.http.on('listening', () => console.log(`Parry Gladiator room server listening on ${port}`));
}
