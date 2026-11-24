import { describe, expect, it } from 'vitest';
import { canSaveOnInterruption, isFreshGameKey, resolveHubUrl } from '../../src/room-tone/session.mjs';

describe('Room Tone session recovery', () => {
  const key = { repeat: false, isComposing: false, ctrlKey: false, metaKey: false, altKey: false };

  it('rejects repeated Escape and IME composition', () => {
    expect(isFreshGameKey(key)).toBe(true);
    expect(isFreshGameKey({ ...key, repeat: true })).toBe(false);
    expect(isFreshGameKey({ ...key, isComposing: true })).toBe(false);
  });

  it('does not consume browser shortcuts', () => {
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(isFreshGameKey({ ...key, [modifier]: true })).toBe(false);
    }
  });

  it('never overwrites a campaign on interruption from home, completion or loading', () => {
    for (const state of ['home', 'won', 'load', 'error']) {
      expect(canSaveOnInterruption(true, state)).toBe(false);
    }
    for (const state of ['play', 'pause', 'brief', 'map', 'capture', 'puzzle']) {
      expect(canSaveOnInterruption(true, state)).toBe(true);
      expect(canSaveOnInterruption(false, state)).toBe(false);
    }
  });

  it('keeps the correct hub path on root and project-subpath deployments', () => {
    expect(resolveHubUrl('https://example.test/room-tone/')).toBe('https://example.test/');
    expect(resolveHubUrl('https://example.test/project/room-tone/')).toBe('https://example.test/project/');
    expect(resolveHubUrl('https://example.test/project/room-tone/index.html')).toBe('https://example.test/project/');
  });
});
