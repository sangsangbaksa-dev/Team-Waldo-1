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
