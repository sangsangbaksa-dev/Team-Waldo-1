import { describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '../../src/audio-core';
import { SkyAudio } from '../../src/sky/audio';

describe('SKY WAR muted audio resource usage', () => {
  it('does not allocate looping engine sources while muted and starts them after sound is enabled', () => {
    const param = () => ({ value: 0, setTargetAtTime: vi.fn() });
    const node = () => ({
      connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), addEventListener: vi.fn(),
    });
    const ctx = {
      currentTime: 0,
      state: 'running',
      close: vi.fn().mockResolvedValue(undefined),
      createOscillator: vi.fn(() => ({ ...node(), type: 'sawtooth', frequency: param() })),
      createBiquadFilter: vi.fn(() => ({ ...node(), type: 'lowpass', frequency: param() })),
      createGain: vi.fn(() => ({ ...node(), gain: param() })),
      createBufferSource: vi.fn(() => ({ ...node(), buffer: null, loop: false })),
    };
    const audio = new SkyAudio();
    const eng = (audio as unknown as { eng: AudioEngine }).eng;
    eng.ctx = ctx as unknown as AudioContext;
    eng.bus = {} as GainNode;
    eng.noise = {} as AudioBuffer;
    audio.enabled = false;

    audio.engine(true, 0.8);
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    expect(ctx.createBufferSource).not.toHaveBeenCalled();

    audio.enabled = true;
    audio.engine(true, 0.8);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);

    // Subsequent frames modulate the existing sources rather than allocate more.
    audio.engine(true, 1);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);

    const firstOsc = ctx.createOscillator.mock.results[0]!.value;
    const firstNoise = ctx.createBufferSource.mock.results[0]!.value;
    audio.stopEngine();
    expect(firstOsc.stop).toHaveBeenCalledTimes(1);
    expect(firstNoise.stop).toHaveBeenCalledTimes(1);
    audio.engine(true, 0.8);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(2);

    // Muting actively frees the restarted loop rather than leaving it running
    // behind a zero-gain master, and repeated stops are idempotent.
    const secondOsc = ctx.createOscillator.mock.results[1]!.value;
    audio.setEnabled(false);
    expect(secondOsc.stop).toHaveBeenCalledTimes(1);
    audio.stopEngine();
    expect(secondOsc.stop).toHaveBeenCalledTimes(1);
    audio.dispose();
  });
});
