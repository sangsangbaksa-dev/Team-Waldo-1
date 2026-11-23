import { roomCode, type ClientMessage, type ServerMessage } from '../application/protocol.js';
import { RoomHub, type RoomPeer } from '../application/rooms.js';
import type { World } from '../domain/world.js';
import { openBus, type RelayKind } from './relay.js';

export interface LinkEvents {
  opened(): void;
  message(message: ServerMessage): void;
  failed(reason: string): void;
  closed(): void;
}
/** A line to whoever runs the room rules: a WebSocket room server, or the hosting player's browser. */
export interface Link {
  send(message: ClientMessage): void;
  close(): void;
}

export type Transport = 'socket' | RelayKind;

const HOST = 'host';
const SILENCE_MS = 9000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const randomId = (): string => Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => byte.toString(16).padStart(2, '0')).join('');
const randomCode = (): string => Array.from(crypto.getRandomValues(new Uint8Array(5)), byte => ALPHABET[byte % ALPHABET.length]).join('');

/** Chosen at build time with VITE_ROOM_TRANSPORT=relay|socket, or per visit with ?transport=relay|local|socket. */
export function transportChoice(): Transport {
  const query = new URLSearchParams(location.search).get('transport');
  const configured = (import.meta as ImportMeta & { env?: { VITE_ROOM_TRANSPORT?: string } }).env?.VITE_ROOM_TRANSPORT;
  const value = query || configured;
  return value === 'relay' ? 'supabase' : value === 'local' ? 'local' : 'socket';
}

export function socketLink(endpoint: string, events: LinkEvents, stopping: () => boolean): Link {
  const socket = new WebSocket(endpoint);
  socket.addEventListener('open', () => events.opened());
  socket.addEventListener('error', () => { if (!stopping()) events.failed('Room server unavailable. Try again or deploy solo.'); });
  socket.addEventListener('close', () => { if (!stopping()) events.closed(); });
  socket.addEventListener('message', ({ data }) => events.message(JSON.parse(String(data)) as ServerMessage));
  return {
    send(message) { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); },
    close() { socket.close(); },
  };
}

/** Creates a room hosted by this browser. The rival reaches it through a Realtime Broadcast channel. */
export function hostLink(world: World, events: LinkEvents, kind: RelayKind): Link {
  const code = randomCode();
  const bus = openBus(code, HOST, kind);
  const hub = new RoomHub(world, { maxRooms: 1, makeCode: () => code });
  let live = true;
  const local: RoomPeer = {
    id: `h${randomId()}`, seq: 0, lastInput: 0,
    send: payload => queueMicrotask(() => { if (live) events.message(JSON.parse(payload) as ServerMessage); }),
  };
  const everyone = { send: (payload: string) => bus.send('*', payload) };
  const guests = new Map<string, RoomPeer & { seen: number }>();
  bus.onMessage((from, message) => {
    if (!live || typeof message !== 'object' || message === null) return;
    let guest = guests.get(from);
    if (!guest) {
      if (guests.size >= 8) return;
      guest = { id: from, seq: 0, lastInput: 0, seen: 0, group: everyone, send: payload => bus.send(from, payload) };
      guests.set(from, guest);
    }
    guest.seen = performance.now();
    const type = (message as { type?: unknown }).type;
    if (type === 'leave') { hub.leave(guest); guests.delete(from); return; }
    if (type === 'create') return;
    if (type === 'join' && guest.room) return;
    hub.message(guest, message);
  });
  let last = performance.now();
  const timers = [
    setInterval(() => {
      const now = performance.now();
      hub.advance((now - last) / 1000);
      last = now;
    }, 10),
    setInterval(() => {
      const now = performance.now();
      for (const guest of guests.values()) {
        if (now - guest.seen <= SILENCE_MS) continue;
        hub.leave(guest);
        guests.delete(guest.id);
      }
    }, 2000),
  ];
  void bus.ready.then(() => { if (live) events.opened(); }, () => { if (live) events.failed('Could not reach the online relay. Check your connection and try again.'); });
  return {
    send(message) { if (live) hub.message(local, message); },
    close() {
      live = false;
      timers.forEach(clearInterval);
      if (guests.size) bus.send('*', JSON.stringify({ type: 'error', message: 'The host closed the room.' } satisfies ServerMessage));
      hub.leave(local);
      for (const guest of guests.values()) hub.leave(guest);
      setTimeout(() => bus.close(), 150);
    },
  };
}

/** Joins a room hosted in another browser. Retries the join until the host answers. */
export function guestLink(events: LinkEvents, kind: RelayKind): Link {
  const id = randomId();
  // The room code is only known when the join request is sent, so the bus opens lazily in `send`.
  let bus: ReturnType<typeof openBus> | undefined;
  let live = true;
  let pending: ClientMessage | undefined;
  let answered = false;
  let seen = performance.now();
  let attempts = 0;
  const timer = setInterval(() => {
    if (!live || !pending) return;
    if (answered) {
      if (performance.now() - seen > SILENCE_MS) { live = false; events.closed(); }
    } else if (++attempts >= 6) { live = false; events.failed('Room code not found. Ask the host to keep the room open.'); }
    else bus?.send(HOST, pending);
  }, 1000);
  queueMicrotask(() => { if (live) events.opened(); });
  return {
    send(message) {
      if (!live) return;
      if (message.type === 'join') {
        pending = message;
        bus = openBus(roomCode(message.code), id, kind);
        bus.onMessage((from, payload) => {
          if (!live || from !== HOST || typeof payload !== 'string') return;
          seen = performance.now();
          try {
            const parsed = JSON.parse(payload) as ServerMessage;
            if (parsed.type === 'room' || parsed.type === 'error') answered = true;
            events.message(parsed);
          } catch { /* ignore malformed frames */ }
        });
        void bus.ready.then(() => bus?.send(HOST, message), () => { if (live) events.failed('Could not reach the online relay. Check your connection and try again.'); });
      } else bus?.send(HOST, message);
    },
    close() {
      if (!live) return;
      live = false;
      clearInterval(timer);
      bus?.send(HOST, { type: 'leave' });
      const current = bus;
      setTimeout(() => current?.close(), 150);
    },
  };
}
