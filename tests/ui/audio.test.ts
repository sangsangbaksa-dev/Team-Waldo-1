import { afterEach, describe, expect, it, vi } from 'vitest';
import { BattleAudio } from '../../src/battle/audio';

afterEach(() => vi.unstubAllGlobals());

describe('optional battle audio', () => {
  it('does not interrupt victory or exit when a running audio device fails', () => {
    class FailedAudioDevice {
      state = 'running';
      currentTime = 10;
      resume() { return Promise.resolve(); }
      createOscillator() { throw new DOMException('Audio device disconnected', 'InvalidStateError'); }
      close() { throw new DOMException('Audio device unavailable', 'InvalidStateError'); }
    }
    vi.stubGlobal('AudioContext', FailedAudioDevice);
    const audio = new BattleAudio(); audio.unlock();
    // These two calls run on the real victory and exit paths, after the game is marked done.
    expect(() => audio.play('victory')).not.toThrow();
    expect(() => audio.dispose()).not.toThrow();
  });
});

describe('battle warning throttling', () => {
  it('plays the initial warning at audio time zero and throttles only repeats', () => {
    let device: TestAudioContext;
    class TestAudioContext {
      state = 'running';
      currentTime = 0;
      destination = {};
      oscillators = 0;
      constructor() { device = this; }
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
      createOscillator() {
        this.oscillators++;
        return {
          type: 'sine',
          frequency: { setValueAtTime() {} },
          connect() {}, disconnect() {}, start() {}, stop() {},
          onended: null as (() => void) | null,
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() {}, disconnect() {},
        };
      }
    }
    vi.stubGlobal('AudioContext', TestAudioContext);
    const audio = new BattleAudio();
    audio.unlock();
    audio.play('warning');
    expect(device!.oscillators).toBe(2);
    audio.play('warning');
    expect(device!.oscillators).toBe(2);
    device!.currentTime = 2.9;
    audio.play('warning');
    expect(device!.oscillators).toBe(2);
    device!.currentTime = 3.1;
    audio.play('warning');
    expect(device!.oscillators).toBe(4);
    audio.dispose();
  });
});
