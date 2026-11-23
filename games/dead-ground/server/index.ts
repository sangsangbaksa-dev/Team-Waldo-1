import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { RoomHub, type RoomPeer } from '../src/application/rooms.js';
import { createWorld } from '../src/domain/world.js';

interface Peer extends RoomPeer {
  socket: WebSocket;
  lastMessage: number;
  live: boolean;
}

const port = Number(process.env.PORT || 8080);
const assets = resolve(process.env.CLIENT_DIST || 'dist');
const world = createWorld();
const clients = new Set<Peer>();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const hub = new RoomHub(world, {
  maxRooms: 96,
  makeCode(taken) {
    let code: string;
    do {
      code = Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    } while (taken.has(code));
    return code;
  },
});
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

sockets.on('connection', socket => {
  if (clients.size >= 384) { socket.close(1013, 'Server busy'); return; }
  const peer: Peer = {
    id: randomUUID().slice(0, 12), socket, seq: 0, lastInput: 0, lastMessage: Date.now(), live: true,
    send(payload) {
      if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 65536) socket.send(payload);
    },
  };
  let messages = 0;
  let windowStart = Date.now();
  clients.add(peer);
  socket.on('pong', () => { peer.live = true; });
  socket.on('error', () => socket.terminate());
  socket.on('close', () => { clients.delete(peer); hub.leave(peer); });
  socket.on('message', (data, binary) => {
    const now = Date.now();
    if (now - windowStart >= 1000) { windowStart = now; messages = 0; }
    if (++messages > 105 || binary) return;
    try {
      const message = JSON.parse(data.toString());
      peer.lastMessage = now;
      hub.message(peer, message, now);
    } catch {
      // Invalid frames cannot change room state.
    }
  });
});

let lastTick = performance.now();
const simulation = setInterval(() => {
  const now = performance.now();
  hub.advance((now - lastTick) / 1000);
  lastTick = now;
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
