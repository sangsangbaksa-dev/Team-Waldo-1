// Minimal Web Audio stand-in for unit tests (happy-dom has no AudioContext).

class FakeParam {
  value = 0;
  setValueAtTime(v: number, _t?: number): void { this.value = v; }
  exponentialRampToValueAtTime(v: number, _t?: number): void { this.value = v; }
  linearRampToValueAtTime(v: number, _t?: number): void { this.value = v; }
  setTargetAtTime(v: number, _t?: number, _c?: number): void { this.value = v; }
  cancelScheduledValues(_t?: number): void { /* no-op */ }
}

class FakeNode {
  connections: FakeNode[] = [];
  connect(node: FakeNode): FakeNode { this.connections.push(node); return node; }
  disconnect(): void { this.connections = []; }
}

class FakeSource extends FakeNode {
  started = false;
  stopped = false;
  onended: (() => void) | null = null;
  private ended: Array<() => void> = [];
  addEventListener(type: string, fn: () => void): void { if (type === 'ended') this.ended.push(fn); }
  removeEventListener(): void { /* unused */ }
  start(_when?: number, _offset?: number): void { this.started = true; }
  stop(_when?: number): void {
    if (this.stopped) throw new Error('InvalidStateError');
    this.stopped = true;
    this.onended?.();
    for (const fn of this.ended) fn();
  }
}

class FakeOscillator extends FakeSource {
  type: OscillatorType = 'sine';
  frequency = new FakeParam();
}

class FakeBufferSource extends FakeSource {
  buffer: AudioBuffer | null = null;
  loop = false;
}

class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeFilter extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  frequency = new FakeParam();
  Q = new FakeParam();
}
class FakeCompressor extends FakeNode {
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
}
class FakeShaper extends FakeNode { curve: Float32Array | null = null; }
class FakeBuffer {
  constructor(public channels: number, public length: number, public sampleRate: number) {}
  getChannelData(_ch: number): Float32Array { return new Float32Array(this.length); }
}

export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state: AudioContextState = 'running';
  destination = new FakeNode();
  oscillators: FakeOscillator[] = [];
  sources: FakeBufferSource[] = [];
  createGain(): FakeGain { return new FakeGain(); }
  createOscillator(): FakeOscillator { const o = new FakeOscillator(); this.oscillators.push(o); return o; }
  createBiquadFilter(): FakeFilter { return new FakeFilter(); }
  createDynamicsCompressor(): FakeCompressor { return new FakeCompressor(); }
  createWaveShaper(): FakeShaper { return new FakeShaper(); }
  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer { return new FakeBuffer(channels, length, sampleRate); }
  createBufferSource(): FakeBufferSource { const s = new FakeBufferSource(); this.sources.push(s); return s; }
  async resume(): Promise<void> { if (this.state !== 'closed') this.state = 'running'; }
  async suspend(): Promise<void> { if (this.state !== 'closed') this.state = 'suspended'; }
  async close(): Promise<void> { this.state = 'closed'; }
}

export function installAudioMock(): { context: () => FakeAudioContext | undefined; restore: () => void } {
  const host = globalThis as unknown as { AudioContext?: unknown; window?: { AudioContext?: unknown } };
  const Original = host.AudioContext;
  const created: FakeAudioContext[] = [];
  const Mock = class extends FakeAudioContext {
    constructor() {
      super();
      created.push(this);
    }
  };
  host.AudioContext = Mock;
  host.window ??= host as unknown as { AudioContext?: unknown };
  host.window.AudioContext = Mock;
  return {
    context: () => created.at(-1),
    restore: () => {
      host.AudioContext = Original;
    },
  };
}

export function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}
