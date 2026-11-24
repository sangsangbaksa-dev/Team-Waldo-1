// Small two-player room transport using the Waldo arcade's existing Supabase
// Realtime Broadcast relay. Messages are ephemeral; this module uses no tables.
const RELAY_URL = 'https://qgeblwepfowfswfxtemd.supabase.co';
const RELAY_KEY = 'sb_publishable_5J9A5uOS09eJ7gi5QJVhQg_42BOYw95';
// Vendored @supabase/realtime-js 2.119.2 (MIT); see vendor/SUPABASE-REALTIME-LICENSE.txt.
import { RealtimeClient } from '../vendor/realtime-js-2.119.2.mjs';
const TOPIC_PREFIX = 'waldo-arcade-pvp:';
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_LENGTH = 6;
const SUBSCRIBE_TIMEOUT_MS = 10000;
const JOIN_TIMEOUT_MS = 12000;
const HEARTBEAT_MS = 5000;
const SILENCE_TIMEOUT_MS = 20000;

function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_LENGTH));
  return [...bytes].map(n => ROOM_ALPHABET[n % ROOM_ALPHABET.length]).join('');
}

function makeClient(RealtimeClient) {
  return new RealtimeClient(`${RELAY_URL}/realtime/v1`, {
    params: { apikey: RELAY_KEY, eventsPerSecond: 40 },
  });
}

function onlineError() {
  return new Error('온라인 중계 서버에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
}

async function openChannel(RealtimeClient, code, onError) {
  const client = makeClient(RealtimeClient);
  const channel = client.channel(`${TOPIC_PREFIX}${code}`, {
    config: { broadcast: { self: false, ack: false } },
  });
  let timer;
  const ready = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(onlineError()), SUBSCRIBE_TIMEOUT_MS);
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timer);
        reject(onlineError());
      }
    }, SUBSCRIBE_TIMEOUT_MS);
  });
  try {
    await ready;
  } catch (error) {
    try { await client.removeChannel(channel); } catch {}
    try { client.disconnect(); } catch {}
    onError?.(error);
    throw error;
  }
  return { client, channel };
}

function makeRoom(transport, role, code, callbacks) {
  const { client, channel } = transport;
  const selfId = role === 'host' ? 'host' : crypto.randomUUID().replaceAll('-', '');
  let peerId = role === 'host' ? null : 'host';
  let ready = false;
  let closed = false;
  let disconnectNotified = false;
  let errorNotified = false;
  const pendingData = [];
  let lastSeen = Date.now();
  let joinAttempts = 0;
  let joinTimer;
  let heartbeatTimer;
  let silenceTimer;
  let channelClosed = false;
  const stopTimers = () => {
    clearInterval(joinTimer);
    clearInterval(heartbeatTimer);
    clearInterval(silenceTimer);
  };
  const callError = error => {
    if (closed || errorNotified) return;
    errorNotified = true;
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
  };
  const notifyDisconnect = () => {
    if (disconnectNotified || closed) return;
    disconnectNotified = true;
    callbacks.onDisconnect?.();
    void shutdown(false);
  };
  const shutdown = async (tellPeer = true) => {
    if (closed) return;
    if (tellPeer && ready && peerId) sendEnvelope('leave', null, peerId);
    closed = true;
    stopTimers();
    if (channelClosed) return;
    channelClosed = true;
    setTimeout(async () => {
      try { await client.removeChannel(channel); } catch {}
      try { client.disconnect(); } catch {}
    }, 150);
  };
  const sendEnvelope = (kind, body, to) => {
    if (closed) return;
    const payload = { v: 1, f: selfId, t: to, k: kind, b: body };
    void channel.send({ type: 'broadcast', event: 'm', payload }).then(status => {
      if (status && status !== 'ok') {
        callError(onlineError());
      }
    }).catch(() => callError(onlineError()));
  };
  const becomeReady = () => {
    if (ready || closed) return;
    ready = true;
    clearInterval(joinTimer);
    lastSeen = Date.now();
    callbacks.onReady?.();
    for (const data of pendingData.splice(0)) sendEnvelope('data', data, peerId);
    heartbeatTimer = setInterval(() => sendEnvelope('heartbeat', null, peerId), HEARTBEAT_MS);
    silenceTimer = setInterval(() => {
      if (!closed && Date.now() - lastSeen > SILENCE_TIMEOUT_MS) notifyDisconnect();
    }, HEARTBEAT_MS);
  };
  channel.on('broadcast', { event: 'm' }, ({ payload }) => {
    if (closed || !payload || payload.v !== 1 || payload.f === selfId) return;
    const from = payload.f;
    if (typeof from !== 'string' || !from) return;
    if (payload.k === 'hello') {
      if (role !== 'host') return;
      if (peerId && peerId !== from) {
        sendEnvelope('busy', null, from);
        return;
      }
      peerId = from;
      lastSeen = Date.now();
      sendEnvelope('welcome', null, from);
      becomeReady();
      return;
    }
    if (payload.t !== selfId || (peerId && from !== peerId)) return;
    if (payload.k === 'welcome' && role === 'join') {
      lastSeen = Date.now();
      becomeReady();
    } else if (payload.k === 'busy' && role === 'join') {
      callError(new Error('이 방은 이미 다른 플레이어가 사용 중입니다.'));
      void shutdown(false);
    } else if (payload.k === 'heartbeat') {
      lastSeen = Date.now();
    } else if (payload.k === 'leave') {
      notifyDisconnect();
    } else if (payload.k === 'data' && ready) {
      lastSeen = Date.now();
      callbacks.onMessage?.(payload.b);
    }
  });

  const handle = {
    code,
    send(data) {
      if (closed) return;
      if (ready && peerId) sendEnvelope('data', data, peerId);
      else if (pendingData.length < 32) pendingData.push(data);
      else callError(new Error('상대 연결을 기다리는 동안 보낼 메시지가 너무 많습니다.'));
    },
    close() { void shutdown(true); },
  };
  if (role === 'join') {
    const sendHello = () => {
      if (closed || ready) return;
      if (++joinAttempts > JOIN_TIMEOUT_MS / 1000) {
        callError(new Error('방을 찾을 수 없습니다. 방 코드가 맞는지, 방장이 대기 중인지 확인해 주세요.'));
        void shutdown(false);
        return;
      }
      sendEnvelope('hello', null, 'host');
    };
    sendHello();
    joinTimer = setInterval(sendHello, 1000);
  }
  return handle;
}

/** Create a room, returning its code once the online relay accepts the host. */
export async function hostRoom({ onReady, onMessage, onDisconnect, onError } = {}) {
  const code = makeCode();
  const transport = await openChannel(RealtimeClient, code, onError);
  return makeRoom(transport, 'host', code, { onReady, onMessage, onDisconnect, onError });
}

/** Join a six-character room code created by hostRoom. */
export async function joinRoom(code, { onReady, onMessage, onDisconnect, onError } = {}) {
  const cleanCode = String(code ?? '').trim().toUpperCase();
  if (!new RegExp(`^[${ROOM_ALPHABET}]{${ROOM_LENGTH}}$`).test(cleanCode)) {
    throw new Error('방 코드는 영문 대문자와 숫자 2–9로 된 6자리입니다.');
  }
  const transport = await openChannel(RealtimeClient, cleanCode, onError);
  return makeRoom(transport, 'join', cleanCode, { onReady, onMessage, onDisconnect, onError });
}
