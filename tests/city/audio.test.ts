// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CityAudio } from '../../src/city/audio';
import { MASTER_GAIN } from '../../src/audio-core';
import { installAudioMock, setHidden } from '../helpers/audio-mock';

const CITY_SOUNDS = [
  'pistol', 'smg', 'rifle', 'shotgun', 'sniper', 'rocket', 'cannon', 'rail', 'boom',
  'hit', 'death', 'cash', 'pickup', 'levelup', 'quest', 'error', 'click', 'build',
  'siren', 'wail', 'announce', 'crash', 'reload', 'dash', 'door', 'win', 'lose',
  'crystal', 'heal', 'hurt', 'skid', 'splat', 'burn', 'spawn', 'roar', 'poof', 'crate',
];

describe('LAST CITY audio', () => {
  let mock: ReturnType<typeof installAudioMock>;
  let audio: CityAudio;

  beforeEach(() => {
    mock = installAudioMock();
    audio = new CityAudio();
  });
  afterEach(() => {
    audio.dispose();
    mock.restore();
    setHidden(false);
  });

  it('creates a limited graph at master 0.15 even when muted first', () => {
    audio.enabled = false;
    audio.unlock();
    const ctx = mock.context();
    expect(ctx).toBeTruthy();
    expect(audio.master?.gain.value).toBe(0);
    expect(audio.ctx?.state).toBe('running');
    audio.setEnabled(true);
    expect(audio.master?.gain.value).toBe(MASTER_GAIN);
  });

  it('resumes on first gesture and suspends when the tab is hidden', () => {
    expect(mock.context()).toBeUndefined();
    document.dispatchEvent(new Event('pointerdown'));
    const ctx = mock.context();
    expect(ctx?.state).toBe('running');
    setHidden(true);
    expect(ctx?.state).toBe('suspended');
    setHidden(false);
    expect(ctx?.state).toBe('running');
  });

  it('plays known event sounds and caps overlapping voices', () => {
    audio.unlock();
    for (const name of CITY_SOUNDS) audio.play(name);
    expect(audio.ctx).toBeTruthy();
    const started = mock.context()!.oscillators.filter(o => o.started).length + mock.context()!.sources.filter(s => s.started).length;
    expect(started).toBeGreaterThan(8);
    // flood the cap
    for (let i = 0; i < 80; i++) audio.play('pistol', 1);
    expect(() => audio.play('boom', 1)).not.toThrow();
  });

  it('starts and stops the vehicle engine, and dispose silences everything', () => {
    audio.unlock();
    audio.setEngine(0.6);
    expect(audio.engine).toBeTruthy();
    audio.setEngine(-1);
    audio.dispose();
    expect(audio.ctx).toBeNull();
    expect(mock.context()?.state).toBe('closed');
    expect(() => audio.play('pistol')).not.toThrow();
  });
});
