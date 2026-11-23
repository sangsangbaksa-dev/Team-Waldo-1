import { PROTOCOL_VERSION, ROOM_ALPHABET, ROOM_LENGTH, validRoom } from '../application/room-protocol.js';
import { Rooms } from '../application/rooms.js';
import { openChannel } from './relay.js';

const HOST = 'host';
const SILENCE_MS = 9000;

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => byte.toString(16).padStart(2, '0')).join('');
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(ROOM_LENGTH)), byte => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('');

/**
 * Online duel without a room server. The browser that creates the room runs the authoritative simulation
 * (`Rooms`) and the rival talks to it through a Realtime Broadcast channel. Same interface as `Network`.
 */
export class RelayNetwork {
  constructor(onMessage, onStatus, { kind = 'supabase' } = {}) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.kind = kind;
    this.channel = null;
    this.timers = [];
    this.id = randomId();
  }

  connect(_url, mode, code) {
    this.close();
    const session = this.session = {};
    const live = () => session === this.session;
    this.onStatus('connecting');
    if (mode === 'create') code = randomCode();
    else if (!validRoom(code)) { this.onStatus('error'); return; }
    this.code = code;
    const channel = this.channel = openChannel(code, mode === 'create' ? HOST : this.id, this.kind);
    channel.ready.then(() => {
      if (!live()) return;
      this.onStatus('connected');
      if (mode === 'create') this.host(code, channel, live);
      else this.guest(code, channel, live);
    }, () => { if (live()) this.onStatus('error'); });
  }

  every(ms, callback) { this.timers.push(setInterval(callback, ms)); }

  host(code, channel, live) {
    const rooms = this.rooms = new Rooms({ makeCode: () => code, maxRooms: 1 });
    const local = this.local = { send: message => queueMicrotask(() => { if (live()) this.onMessage(message); }) };
    const guests = new Map();
    const guestPeer = id => {
      let guest = guests.get(id);
      if (!guest && guests.size < 8) {
        guest = { id, seen: performance.now(), send: message => channel.send(id, message) };
        guests.set(id, guest);
      }
      return guest;
    };
    channel.onMessage((from, message) => {
      if (!live() || typeof from !== 'string' || !message || typeof message !== 'object') return;
      const guest = guestPeer(from);
      if (!guest) return;
      guest.seen = performance.now();
      if (message.type === 'leave') { rooms.leave(guest); guests.delete(from); return; }
      if (message.type === 'create') return;
      if (message.type === 'join' && guest.room) { guest.send({ type: 'joined', code, player: 1 }); return; }
      rooms.message(guest, message);
    });
    rooms.message(local, { type: 'create', version: PROTOCOL_VERSION });
    let last = performance.now();
    this.every(1000 / 60, () => {
      const now = performance.now();
      rooms.tick(Math.min(0.1, (now - last) / 1000));
      last = now;
    });
    this.every(2000, () => {
      const now = performance.now();
      for (const guest of guests.values()) {
        if (guest.room && now - guest.seen > SILENCE_MS) { rooms.leave(guest); guests.delete(guest.id); }
        else if (!guest.room && now - guest.seen > SILENCE_MS) guests.delete(guest.id);
      }
    });
  }

  guest(code, channel, live) {
    let seen = performance.now();
    let joined = false;
    channel.onMessage((from, message) => {
      if (!live() || from !== HOST || !message || typeof message !== 'object') return;
      seen = performance.now();
      if (message.type === 'joined' || message.type === 'error') joined = true;
      this.onMessage(message);
    });
    const join = () => channel.send(HOST, { type: 'join', code, version: PROTOCOL_VERSION });
    let attempts = 0;
    join();
    this.every(1000, () => {
      if (joined) {
        if (performance.now() - seen > SILENCE_MS) this.onStatus('closed');
      } else if (++attempts >= 6) { this.close(); this.onStatus('missing'); } else join();
    });
  }

  send(message) {
    if (!this.channel) return;
    if (this.rooms) this.rooms.message(this.local, message);
    else this.channel.send(HOST, message);
  }

  close() {
    this.session = null;
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    const channel = this.channel;
    this.channel = null;
    if (channel) {
      if (!this.rooms) channel.send(HOST, { type: 'leave' });
      else this.rooms.leave(this.local);
      this.rooms = null;
      setTimeout(() => channel.close(), 150);
    }
  }
}
