import test from 'node:test';
import assert from 'node:assert/strict';
import { Rooms } from '../src/application/rooms.js';
import { RelayNetwork } from '../src/infrastructure/relay-network.js';
import { validRoom, validSnapshot } from '../src/application/room-protocol.js';

function client(t) {
  const received = [];
  const statuses = [];
  const waiters = new Set();
  const network = new RelayNetwork(message => {
    received.push(message);
    for (const waiter of waiters) waiter();
  }, status => statuses.push(status), { kind: 'local', createRooms: options => new Rooms(options) });
  t.after(() => network.close());
  return {
    network, received, statuses,
    wait(type, predicate = () => true) {
      const find = () => received.find(message => message.type === type && predicate(message));
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { waiters.delete(check); reject(new Error('Timed out waiting for ' + type)); }, 5000);
        const check = () => {
          const message = find();
          if (!message) return;
          clearTimeout(timeout);
          waiters.delete(check);
          resolve(message);
        };
        waiters.add(check);
        check();
      });
    },
  };
}

test('relay host runs the duel and the guest gets the same authoritative snapshots', { timeout: 12000 }, async t => {
  const host = client(t);
  const guest = client(t);
  host.network.connect('', 'create');
  const created = await host.wait('created');
  assert.ok(validRoom(created.code));
  guest.network.connect('', 'join', created.code);
  const [hostStart, guestStart] = await Promise.all([host.wait('start'), guest.wait('start')]);
  assert.deepEqual(hostStart, guestStart);
  assert.ok(validSnapshot(guestStart.state));
  assert.equal((await guest.wait('joined')).player, 1);
  await host.wait('state', m => m.state.phase === 'fight');
  const movement = setInterval(() => host.network.send({ type: 'input', input: { x: 1, z: 0 } }), 45);
  t.after(() => clearInterval(movement));
  await guest.wait('state', m => m.state.players[0].x > -0.2);
  clearInterval(movement);
  host.network.send({ type: 'input', input: { x: 0, z: 0 } });
  host.network.send({ type: 'action', action: 'light' });
  const [hostHit, guestHit] = await Promise.all([
    host.wait('state', m => m.state.players[1].hp < 100),
    guest.wait('state', m => m.state.players[1].hp < 100),
  ]);
  assert.ok(validSnapshot(hostHit.state));
  assert.ok(validSnapshot(guestHit.state));
  assert.ok(guest.received.some(m => m.type === 'event' && m.event === 'hit'));
  guest.network.close();
  assert.match((await host.wait('peer-left')).message, /left/i);
});

test('relay rejects a third player, bad codes, and reports a missing room', { timeout: 12000 }, async t => {
  const host = client(t);
  const guest = client(t);
  const third = client(t);
  host.network.connect('', 'create');
  const { code } = await host.wait('created');
  guest.network.connect('', 'join', code);
  await guest.wait('start');
  third.network.connect('', 'join', code);
  assert.match((await third.wait('error')).message, /full/i);
  const lost = client(t);
  lost.network.connect('', 'join', '22222');
  await new Promise(resolve => {
    const poll = setInterval(() => { if (lost.statuses.includes('missing')) { clearInterval(poll); resolve(); } }, 100);
  });
});
