import { RealtimeClient } from '@supabase/realtime-js';

// Public (publishable) Supabase credentials of the Waldo hub. Only Realtime Broadcast is used, no tables.
const RELAY_URL = 'https://qgeblwepfowfswfxtemd.supabase.co';
const RELAY_KEY = 'sb_publishable_5J9A5uOS09eJ7gi5QJVhQg_42BOYw95';

let client = null;
let open = 0;

function realtime() {
  client ??= new RealtimeClient(`${RELAY_URL}/realtime/v1`, { params: { apikey: RELAY_KEY, eventsPerSecond: 40 } });
  return client;
}

/**
 * A tiny addressed message bus for one room. `send(to, message)` reaches the peer whose id is `to`
 * (or everyone with '*'). Kinds: 'supabase' (internet) and 'local' (same-browser tabs, for development and tests).
 */
export function openChannel(room, selfId, kind = 'supabase') {
  const topic = `parry-gladiator:${room}`;
  let listener = () => {};
  const accept = payload => {
    if (!payload || typeof payload !== 'object' || (payload.t !== selfId && payload.t !== '*') || payload.f === selfId) return;
    listener(payload.f, payload.m);
  };

  if (kind === 'local') {
    const bus = new BroadcastChannel(topic);
    bus.onmessage = event => accept(event.data);
    return {
      ready: Promise.resolve(),
      onMessage(callback) { listener = callback; },
      send(to, message) { bus.postMessage({ f: selfId, t: to, m: message }); },
      close() { bus.close(); },
    };
  }

  const channel = realtime().channel(topic, { config: { broadcast: { self: false, ack: false } } });
  open++;
  channel.on('broadcast', { event: 'm' }, ({ payload }) => accept(payload));
  const ready = new Promise((resolve, reject) => {
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
    send(to, message) {
      if (closed) return;
      channel.send({ type: 'broadcast', event: 'm', payload: { f: selfId, t: to, m: message } }).catch(() => {});
    },
    close() {
      if (closed) return;
      closed = true;
      realtime().removeChannel(channel);
      if (--open === 0) { client?.disconnect(); client = null; }
    },
  };
}
