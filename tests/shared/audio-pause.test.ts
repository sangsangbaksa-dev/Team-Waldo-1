// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AudioEngine, tone } from '../../src/audio-core';
import { ShooterAudio } from '../../src/shooter/audio';
import { installAudioMock, setHidden } from '../helpers/audio-mock';

describe('shared audio pause', () => {
  let mock: ReturnType<typeof installAudioMock>;
  beforeEach(() => { mock = installAudioMock(); });
  afterEach(() => { mock.restore(); setHidden(false); });

  it('suspends while paused, ignores gestures, then resumes', () => {
    const eng = new AudioEngine();
    eng.unlock();
    const ctx = mock.context()!;
    eng.setPaused(true);
    expect(ctx.state).toBe('suspended');
    eng.unlock();
    expect(ctx.state).toBe('suspended');
    const before = ctx.oscillators.length;
    tone(eng, 440, 0.1, 0.2);
    expect(ctx.oscillators.length).toBe(before);
    eng.setPaused(false);
    expect(ctx.state).toBe('running');
    tone(eng, 440, 0.1, 0.2);
    expect(ctx.oscillators.length).toBe(before + 1);
    eng.dispose();
  });

  it('stays suspended while the tab is hidden even after unpausing', () => {
    const eng = new AudioEngine();
    eng.unlock();
    eng.setPaused(true);
    setHidden(true);
    eng.setPaused(false);
    expect(mock.context()!.state).toBe('suspended');
    eng.dispose();
  });

  it('applies the per-game level to the master gain', () => {
    const eng = new AudioEngine(0.5);
    eng.unlock();
    expect(eng.master?.gain.value).toBeCloseTo(0.075);
    eng.dispose();
  });

  it('muting via the enabled setter ramps the master to zero after unlock', () => {
    const shooter = new ShooterAudio();
    shooter.unlock();
    const master = (shooter as unknown as { eng: AudioEngine }).eng.master!;
    expect(master.gain.value).toBeGreaterThan(0);
    shooter.enabled = false;
    expect(master.gain.value).toBe(0);
    shooter.dispose();
  });
});
