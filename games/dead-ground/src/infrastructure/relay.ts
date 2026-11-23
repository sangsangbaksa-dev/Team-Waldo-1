import { RealtimeClient, type RealtimeChannel } from '@supabase/realtime-js';

// Public (publishable) Supabase credentials of the Waldo hub. Only Realtime Broadcast is used, no tables.
const RELAY_URL = 'https://qgeblwepfowfswfxtemd.supabase.co';
const RELAY_KEY = 'sb_publishable_5J9A5uOS09eJ7gi5QJVhQg_42BOYw95';

export type RelayKind = 'supabase' | 'local';

/** Addressed message bus for one room: `send(to, payload)` reaches the peer with that id, or everyone with '*'. */
export interface Bus {
  readonly ready: Promise<void>;
  onMessage(callback: (from: string, payload: unknown) => void): void;
  send(to: string, payload: unknown): void;
  close(): void;
}

interface Envelope { f: string; t: string; m: unknown }

let client: RealtimeClient | undefined;
let open = 0;

function realtime(): RealtimeClient {
  client ??= new RealtimeClient(`${RELAY_URL}/realtime/v1`, { params: { apikey: RELAY_KEY, eventsPerSecond: 30 } });
  return client;
}

export function openBus(room: string, selfId: string, kind: RelayKind = 'supabase'): Bus {
  const topic = `dead-ground:${room}`;
  let listener: (from: string, payload: unknown) => void = () => {};
  const accept = (envelope: Envelope | undefined): void => {
    if (!envelope || typeof envelope !== 'object' || (envelope.t !== selfId && envelope.t !== '*') || envelope.f === selfId) return;
    listener(envelope.f, envelope.m);
  };

  if (kind === 'local') {
    const bus = new BroadcastChannel(topic);
    bus.onmessage = event => accept(event.data as Envelope);
    return {
      ready: Promise.resolve(),
      onMessage(callback) { listener = callback; },
      send(to, payload) { bus.postMessage({ f: selfId, t: to, m: payload } satisfies Envelope); },
      close() { bus.close(); },
    };
  }

  const channel: RealtimeChannel = realtime().channel(topic, { config: { broadcast: { self: false, ack: false } } });
  open++;
  channel.on('broadcast', { event: 'm' }, ({ payload }) => accept(payload as Envelope));
  const ready = new Promise<void>((resolve, reject) => {
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') resolve();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
    }, 8000);
  });
  ready.catch(() => {});
  let closed = false;
  return {
    ready,
    onMessage(callback) { listener = callback; },
    send(to, payload) {
      if (closed) return;
      void channel.send({ type: 'broadcast', event: 'm', payload: { f: selfId, t: to, m: payload } satisfies Envelope }).catch(() => {});
    },
    close() {
      if (closed) return;
      closed = true;
      void realtime().removeChannel(channel);
      if (--open === 0) { void client?.disconnect(); client = undefined; }
    },
  };
}
