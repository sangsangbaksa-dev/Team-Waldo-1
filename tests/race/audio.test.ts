// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RaceAudio, gearFor } from '../../src/race/audio';
import { MASTER_GAIN } from '../../src/audio-core';
import { installAudioMock, setHidden } from '../helpers/audio-mock';

const RACE_SFX = ['count', 'go', 'lap', 'best', 'hit', 'bump', 'pad', 'drift', 'finish', 'click'] as const;

describe('SPEED RUSH audio', () => {
  let mock: ReturnType<typeof installAudioMock>;
  let audio: RaceAudio;

  beforeEach(() => {
    mock = installAudioMock();
    audio = new RaceAudio();
  });
  afterEach(() => {
    audio.dispose();
    mock.restore();
    setHidden(false);
  });

  it('computes gear from speed the same way the HUD does', () => {
    expect(gearFor(0)).toBe(1);
    expect(gearFor(20)).toBe(1);
    expect(gearFor(20.01)).toBe(2);
    expect(gearFor(70)).toBe(5);
    expect(gearFor(79)).toBe(5);
    expect(gearFor(80)).toBe(6);
    expect(gearFor(-70)).toBe(gearFor(70));
  });

  it('ties engine pitch to speed and keeps master at 0.15', () => {
    audio.unlock();
    expect(audio.master?.gain.value).toBe(MASTER_GAIN);
    audio.drive(10, 1, 0, false, false, false);
    const mid = mock.context()!.oscillators[0].frequency.value;
    audio.drive(70, 1, 0, true, false, false);
    const high = mock.context()!.oscillators[0].frequency.value;
    expect(high).toBeGreaterThan(mid);
    expect(audio.gear).toBeGreaterThan(1);
  });

  it('plays countdown, boost, collision, lap and finish, then quiets the engine', () => {
    audio.unlock();
    for (const name of RACE_SFX) audio.sfx(name, 8);
    audio.drive(40, 1, 0.2, true, true, true);
    // finish marks the bed/engine as done, so a later drive call should fade loops
    const motorGain = mock.context()!.oscillators[0];
    expect(motorGain.started).toBe(true);
    audio.setEnabled(false);
    expect(audio.master?.gain.value).toBe(0);
    audio.setEnabled(true);
    expect(audio.master?.gain.value).toBe(MASTER_GAIN);
  });

  it('suspends when hidden and stops sources on dispose', () => {
    audio.unlock();
    audio.drive(30, 1, 0, false, false, false);
    setHidden(true);
    expect(mock.context()?.state).toBe('suspended');
    const sources = mock.context()!.sources;
    audio.dispose();
    expect(mock.context()?.state).toBe('closed');
    expect(sources.every(s => s.stopped)).toBe(true);
  });
});
