import { PROTOCOL_VERSION } from '../domain/protocol.js';

export function parseServerUrl(value) {
  let url;
  try { url = new URL(value.trim()); }
  catch { throw new Error('Enter a valid room server address beginning with ws:// or wss://.'); }
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('Enter a WebSocket URL beginning with ws:// or wss://.');
  }
  if (location.protocol === 'https:' && url.protocol !== 'wss:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('An HTTPS page needs a secure wss:// room server.');
  }
  return url.href;
}

export class Network {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
  }

  connect(url, mode, code) {
    this.close();
    const socket = this.socket = new WebSocket(url);
    this.onStatus('connecting');
    const timeout = () => {
      if (socket !== this.socket) return;
      this.close();
      this.onStatus('timeout');
    };
    this.timeout = setTimeout(timeout, 7000);
    socket.onopen = () => {
      if (socket !== this.socket) return;
      clearTimeout(this.timeout);
      this.timeout = setTimeout(timeout, 7000);
      this.onStatus('connected');
      this.send({ type: mode, code, version: PROTOCOL_VERSION });
    };
    socket.onmessage = event => {
      if (socket !== this.socket) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (['created', 'joined', 'error'].includes(message?.type)) clearTimeout(this.timeout);
      this.onMessage(message);
    };
    socket.onclose = () => {
      if (socket !== this.socket) return;
      clearTimeout(this.timeout);
      this.socket = null;
      this.onStatus('closed');
    };
    socket.onerror = () => {
      if (socket === this.socket) this.onStatus('error');
    };
  }

  send(data) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(data));
  }

  close() {
    clearTimeout(this.timeout);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}
