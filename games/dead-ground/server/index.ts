import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { callsign, roomCode, type ServerMessage } from '../src/application/protocol.js';
import { TICK, type Input } from '../src/domain/combat.js';
import { Match } from '../src/domain/match.js';
import { clamp } from '../src/domain/math.js';
import { createWorld } from '../src/domain/world.js';

interface Peer {
  id: string;
  socket: WebSocket;
  room?: Room;
  seq: number;
  lastInput: number;
  lastMessage: number;
  live: boolean;
}
interface Room {
  code: string;
  host: string;
  match: Match;
  peers: Set<Peer>;
}

const port = Number(process.env.PORT || 8080);
const assets = resolve(process.env.CLIENT_DIST || 'dist');
const world = createWorld();
const rooms = new Map<string, Room>();
const clients = new Set<Peer>();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png',
};

const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    if (path === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      return;
    }
    const file = resolve(assets, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(assets + sep) || !(await stat(file)).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

const sockets = new WebSocketServer({ server, path: '/ws', maxPayload: 2048, perMessageDeflate: false });

function send(peer: Peer, message: ServerMessage | string): void {
  if (peer.socket.readyState === WebSocket.OPEN && peer.socket.bufferedAmount < 65536) {
    peer.socket.send(typeof message === 'string' ? message : JSON.stringify(message));
  }
}

function fail(peer: Peer, message: string): void { send(peer, { type: 'error', message }); }

function announce(room: Room): void {
  for (const peer of room.peers) send(peer, { type: 'room', room: { code: room.code, self: peer.id, host: room.host } });
  broadcast(room);
}

function broadcast(room: Room): void {
  const message: ServerMessage = { type: 'state', state: room.match.snapshot() };
  const payload = JSON.stringify(message);
  for (const peer of room.peers) send(peer, payload);
}

function enter(peer: Peer, room: Room, name: string): void {
  if (peer.room) return;
  if (room.match.phase !== 'lobby') { fail(peer, 'That room is already in a round. Ask the host for a new room.'); return; }
  if (!room.match.addPlayer(peer.id, name)) { fail(peer, 'That room is full.'); return; }
  peer.room = room;
  room.peers.add(peer);
  announce(room);
}

function leave(peer: Peer): void {
  clients.delete(peer);
  const room = peer.room;
  if (!room) return;
  room.peers.delete(peer);
  room.match.removePlayer(peer.id);
  const successor = room.peers.values().next().value;
  if (!successor) { rooms.delete(room.code); return; }
  if (room.host === peer.id) room.host = successor.id;
  if (room.peers.size < 2 && room.match.phase !== 'lobby') room.match.resetLobby();
  announce(room);
}

function parseInput(value: unknown): Input | undefined {
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

sockets.on('connection', socket => {
  if (clients.size >= 384) { socket.close(1013, 'Server busy'); return; }
  const peer: Peer = { id: randomUUID().slice(0, 12), socket, seq: 0, lastInput: 0, lastMessage: Date.now(), live: true };
  let messages = 0;
  let windowStart = Date.now();
  clients.add(peer);
  socket.on('pong', () => { peer.live = true; });
  socket.on('error', () => socket.terminate());
  socket.on('close', () => leave(peer));
  socket.on('message', (data, binary) => {
    const now = Date.now();
    if (now - windowStart >= 1000) { windowStart = now; messages = 0; }
    if (++messages > 105 || binary) return;
    try {
      const message = JSON.parse(data.toString());
      if (!message || typeof message !== 'object') return;
      peer.lastMessage = now;
      if (message.type === 'ping' && Number.isFinite(message.time)) {
        send(peer, { type: 'pong', time: message.time });
      } else if (message.type === 'create' && !peer.room) {
        if (rooms.size >= 96) { fail(peer, 'Room server is at capacity. Try again later.'); return; }
        let code: string;
        do {
          code = Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
        } while (rooms.has(code));
        const room = { code, host: peer.id, match: new Match(world), peers: new Set<Peer>() };
        rooms.set(code, room);
        enter(peer, room, callsign(typeof message.name === 'string' ? message.name : ''));
      } else if (message.type === 'join' && !peer.room) {
        const room = typeof message.code === 'string' ? rooms.get(roomCode(message.code)) : undefined;
        if (!room) { fail(peer, 'Room code not found.'); return; }
        enter(peer, room, callsign(typeof message.name === 'string' ? message.name : ''));
      } else if (message.type === 'start' && peer.room?.host === peer.id) {
        if (peer.room.match.start()) broadcast(peer.room);
      } else if (message.type === 'input' && peer.room?.match.phase === 'active'
        && Number.isSafeInteger(message.seq) && message.seq > peer.seq) {
        const player = peer.room.match.players.get(peer.id);
        const input = parseInput(message.input);
        if (!player || message.generation !== player.generation || !input) return;
        peer.seq = message.seq;
        peer.lastInput = now;
        peer.room.match.setInput(peer.id, input);
      }
    } catch {
      // Invalid frames cannot change room state.
    }
  });
});

let lastTick = performance.now();
let accumulator = 0;
let tick = 0;
const simulation = setInterval(() => {
  const now = performance.now();
  accumulator += Math.min((now - lastTick) / 1000, 0.15);
  lastTick = now;
  while (accumulator >= TICK) {
    accumulator -= TICK;
    tick++;
    for (const room of rooms.values()) {
      if (room.match.phase !== 'active') continue;
      for (const peer of room.peers) {
        if (Date.now() - peer.lastInput < 500) continue;
        room.match.stopInput(peer.id);
      }
      const finished = room.match.step();
      if (tick % 3 === 0 || finished) broadcast(room);
    }
  }
}, 10);

const heartbeat = setInterval(() => {
  const now = Date.now();
  for (const peer of clients) {
    if (!peer.live || (!peer.room && now - peer.lastMessage > 30_000)) { peer.socket.terminate(); continue; }
    peer.live = false;
    peer.socket.ping();
  }
}, 15_000);

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
function shutdown(): void {
  clearInterval(simulation);
  clearInterval(heartbeat);
  for (const peer of clients) peer.socket.terminate();
  sockets.close();
  server.close();
}

server.listen(port, '0.0.0.0', () => console.log(`Dead Ground listening on port ${port}`));
