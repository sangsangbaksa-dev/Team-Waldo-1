// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RaceAudio, gearFor } from '../../src/race/audio';
import { MASTER_GAIN } from '../../src/audio-core';
import { installAudioMock, loopGain, setHidden } from '../helpers/audio-mock';

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

  it('holds a boost loop across nitro frames and fades it when boost ends', () => {
    audio.unlock();
    const ctx = mock.context()!;
    const loopsAtUnlock = ctx.sources.length;
    expect(loopsAtUnlock).toBe(3); // wind, skid, boost
    const boost = ctx.sources[2];
    ctx.currentTime = 0; audio.drive(50, 1, 0, true, false, false); // 처음 기어가 바뀔 때 한 번 나는 변속음은 제외
    const afterShift = ctx.sources.length;
    for (let i = 0; i < 60; i++) {
      ctx.currentTime = i * 0.016;
      audio.drive(50, 1, 0, true, false, false);
    }
    expect(loopGain(boost)).toBeGreaterThan(0);
    expect(ctx.sources.length).toBe(afterShift); // no per-frame retrigger
    for (let i = 0; i < 30; i++) {
      ctx.currentTime = 1 + i * 0.016;
      audio.drive(50, 1, 0, false, false, false);
    }
    expect(loopGain(boost)).toBe(0);
    expect(ctx.sources.length).toBe(afterShift);
  });

  it('uses the same skid gain for left and right slip of equal size', () => {
    audio.unlock();
    const ctx = mock.context()!;
    const skid = ctx.sources[1];
    audio.drive(40, 1, 0.4, false, true, false);
    const left = loopGain(skid);
    audio.drive(40, 1, -0.4, false, true, false);
    const right = loopGain(skid);
    expect(left).toBeGreaterThan(0);
    expect(right).toBe(left);
    audio.drive(40, 1, 0, false, false, false);
    expect(loopGain(skid)).toBe(0);
  });

  it('does not stack crash one-shots when hit and bump retrigger every frame', () => {
    audio.unlock();
    const ctx = mock.context()!;
    const before = ctx.oscillators.length + ctx.sources.length;
    for (let i = 0; i < 40; i++) {
      audio.sfx('hit', 8);
      audio.sfx('bump');
    }
    const after = ctx.oscillators.length + ctx.sources.length;
    // one hit (burst+tone) and one bump (burst+tone) = 4 new voices, not 160
    expect(after - before).toBe(4);
  });

  it('silences motor, boost and skid on finish and keeps them quiet afterwards', () => {
    audio.unlock();
    const ctx = mock.context()!;
    audio.drive(60, 1, 0.3, true, true, false);
    expect(loopGain(ctx.sources[2])).toBeGreaterThan(0);
    audio.sfx('finish');
    expect(loopGain(ctx.sources[1])).toBe(0);
    expect(loopGain(ctx.sources[2])).toBe(0);
    audio.drive(60, 1, 0.3, true, true, true);
    expect(loopGain(ctx.sources[0])).toBe(0); // wind
    expect(loopGain(ctx.sources[1])).toBe(0);
    expect(loopGain(ctx.sources[2])).toBe(0);
  });
});
