import { afterEach, describe, expect, it, vi } from 'vitest';
import { BattleAudio, createWarAudio } from '../../src/battle/audio';

function stubAudioContext() {
  const context = {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    createOscillator: vi.fn(() => ({
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    })),
    createGain: vi.fn(() => ({
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
  };
  const constructor = vi.fn(function AudioContextMock() { return context; });
  vi.stubGlobal('AudioContext', constructor);
  return { context, constructor };
}

afterEach(() => vi.unstubAllGlobals());

describe('optional procedural game audio', () => {
  it('can be muted and disposed without AudioContext support', () => {
    vi.stubGlobal('AudioContext', undefined);
    const sound = createWarAudio();
    expect(sound.getMuted()).toBe(false);
    expect(sound.toggle()).toBe(true);
    sound.play('command');
    sound.play('capture');
    expect(sound.toggle()).toBe(false);
    sound.dispose();
  });

  it('plays the first warning immediately, then throttles repeated warnings for three seconds', () => {
    const { context } = stubAudioContext();
    const sound = new BattleAudio();
    sound.unlock();

    // A newly created AudioContext has currentTime = 0.
    sound.play('warning');
    expect(context.createOscillator).toHaveBeenCalledTimes(2);
    sound.play('warning');
    expect(context.createOscillator).toHaveBeenCalledTimes(2);

    context.currentTime = 2.99;
    sound.play('warning');
    expect(context.createOscillator).toHaveBeenCalledTimes(2);
    context.currentTime = 3;
    sound.play('warning');
    expect(context.createOscillator).toHaveBeenCalledTimes(4);
    sound.dispose();
  });

  it('does not create or resume an audio device while effects are muted', () => {
    const { context, constructor } = stubAudioContext();
    const sound = createWarAudio();
    expect(sound.toggle()).toBe(true);
    sound.play('command');
    sound.play('capture');
    expect(constructor).not.toHaveBeenCalled();
    expect(context.resume).not.toHaveBeenCalled();

    expect(sound.toggle()).toBe(false);
    sound.play('command');
    expect(constructor).toHaveBeenCalledTimes(1);
    expect(context.createOscillator).toHaveBeenCalledTimes(1);
    sound.dispose();
  });
});
