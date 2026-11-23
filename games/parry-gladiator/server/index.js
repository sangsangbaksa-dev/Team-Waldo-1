import { randomInt } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { WebSocket, WebSocketServer } from 'ws';
import { Rooms } from '../src/application/rooms.js';
import { PROTOCOL_VERSION, ROOM_ALPHABET, ROOM_LENGTH } from '../src/application/room-protocol.js';

const MAX_ROOMS = 500;

export function startRoomServer({ port = 8080, origins = [] } = {}) {
  const rooms = new Rooms({
    maxRooms: MAX_ROOMS,
    makeCode(taken) {
      let code;
      do {
        code = Array.from({ length: ROOM_LENGTH }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join('');
      } while (taken.has(code));
      return code;
    },
  });
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

  sockets.on('connection', socket => {
    const peer = {
      room: null,
      send(msg) {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (socket.bufferedAmount > 128 * 1024) {
          socket.close(1008, 'Client too slow');
          return;
        }
        socket.send(JSON.stringify(msg));
      },
    };
    socket.alive = true;
    let windowAt = performance.now();
    let messages = 0;
    socket.on('pong', () => { socket.alive = true; });
    socket.on('close', () => rooms.leave(peer));
    socket.on('error', () => rooms.leave(peer));
    socket.on('message', (raw, binary) => {
      if (binary) return;
      const now = performance.now();
      if (now - windowAt >= 1000) {
        windowAt = now;
        messages = 0;
      }
      if (++messages > 95) return socket.close(1008, 'Message limit');
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      rooms.message(peer, msg);
    });
  });

  let last = performance.now();
  const ticker = setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    rooms.tick(dt);
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
