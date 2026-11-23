import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { startRoomServer } from '../server/index.js';
import { PROTOCOL_VERSION, validRoom, validSnapshot } from '../src/application/room-protocol.js';

async function connect(url, t) {
  const socket = new WebSocket(url);
  t.after(() => socket.terminate());
  const received = [];
  const listeners = new Set();
  socket.on('message', raw => {
    const message = JSON.parse(raw.toString());
    received.push(message);
    for (const listener of listeners) listener(message);
  });
  await once(socket, 'open');
  return {
    socket,
    send(data) { socket.send(JSON.stringify(data)); },
    get received() { return received; },
    wait(type, predicate = () => true) {
      const matches = message => message.type === type && predicate(message);
      const previous = received.find(matches);
      if (previous) return Promise.resolve(previous);
      return new Promise((resolve, reject) => {
        const listener = message => {
          if (!matches(message)) return;
          clearTimeout(timeout);
          listeners.delete(listener);
          resolve(message);
        };
        const timeout = setTimeout(() => {
          listeners.delete(listener);
          reject(new Error('Timed out waiting for ' + type));
        }, 5500);
        listeners.add(listener);
      });
    },
  };
}

test('two room clients receive authoritative combat results and disconnect notice', { timeout: 9000 }, async t => {
  const server = startRoomServer({ port: 0 });
  t.after(() => server.close());
  await once(server.http, 'listening');
  const origin = `127.0.0.1:${server.http.address().port}`;
  const health = await fetch('http://' + origin + '/healthz');
  assert.deepEqual(await health.json(), { ok: true, protocol: PROTOCOL_VERSION });
  const [a, b, third] = await Promise.all([connect('ws://' + origin, t), connect('ws://' + origin, t), connect('ws://' + origin, t)]);
  a.send({ type: 'create', version: PROTOCOL_VERSION });
  const created = await a.wait('created');
  assert.ok(validRoom(created.code));
  b.send({ type: 'join', version: PROTOCOL_VERSION, code: created.code.toLowerCase() });
  const [aStart, bStart] = await Promise.all([a.wait('start'), b.wait('start')]);
  assert.deepEqual(aStart, bStart);
  assert.ok(validSnapshot(aStart.state));
  third.send({ type: 'join', version: PROTOCOL_VERSION, code: { toString: false } });
  assert.match((await third.wait('error')).message, /full/i);
  await a.wait('state', m => m.state.phase === 'fight');

  const movement = setInterval(() => a.send({ type: 'input', input: { x: 1, z: 0 } }), 45);
  t.after(() => clearInterval(movement));
  await a.wait('state', m => m.state.players[0].x > -0.2);
  clearInterval(movement);
  a.send({ type: 'input', input: { x: 0, z: 0 } });
  a.send({ type: 'state', state: { phase: 'finished' } });
  a.send({ type: 'action', action: 'light' });
  const [aHit, bHit] = await Promise.all([
    a.wait('state', m => m.state.players[1].hp === 83),
    b.wait('state', m => m.state.players[1].hp === 83),
  ]);
  assert.equal(aHit.state.phase, 'fight');
  assert.deepEqual(aHit, bHit);
  assert.ok(validSnapshot(aHit.state));
  assert.equal(aHit.state.stats[0].damage, 17);
  assert.ok(b.received.some(m => m.type === 'event' && m.event === 'hit' && m.player === 0));

  b.socket.close();
  assert.match((await a.wait('peer-left')).message, /left/i);
});
