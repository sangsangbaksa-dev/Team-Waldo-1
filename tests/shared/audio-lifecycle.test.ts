// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { AudioEngine, tone, burst } from '../../src/audio-core';
import { installAudioMock } from '../helpers/audio-mock';
it('cannot resurrect a disposed audio engine', () => {
  const mock = installAudioMock(), engine = new AudioEngine();
  try {
    engine.unlock(); const ctx = mock.context();
    engine.dispose(); engine.dispose();
    expect(engine.unlock()).toBeNull();
    expect(mock.context()).toBe(ctx); expect(ctx?.state).toBe('closed');
  } finally { engine.dispose(); mock.restore(); }
});
it('invalid sound inputs do not reserve voices or create sources', () => {
  const mock = installAudioMock(), engine = new AudioEngine();
  try {
    engine.unlock();
    tone(engine, NaN, 1, 0.5); tone(engine, 440, -1, 0.5);
    burst(engine, 1, NaN, 80);
    expect(engine.voices).toBe(0);
    expect(mock.context()?.oscillators).toHaveLength(0);
    expect(mock.context()?.sources).toHaveLength(0);
  } finally { engine.dispose(); mock.restore(); }
});
