import { describe, expect, it } from 'vitest';
import { initialChoices, dialOptions, validSolution } from '../../src/room-tone/domain/puzzle.mjs';
import { perceive } from '../../src/room-tone/domain/perception.mjs';
import { createCampaignStore, SAVE, LAST, PREFS } from '../../src/room-tone/application/campaign-store.mjs';
describe('ROOM TONE domain and application', () => {
  it('preserves all four puzzle solutions and rejects partial or extra choices', () => {
    [[0,1,2],[1,3,1],[1,2,0],[2,1,0]].forEach((choices, chapter) => {
      expect(validSolution(chapter, choices)).toBe(true);
      expect(validSolution(chapter, choices.slice(0,2))).toBe(false);
      expect(validSolution(chapter, [...choices, 0])).toBe(false);
    });
    expect(initialChoices(2)).toEqual([]);
    expect(dialOptions(1, 1)[3]).toBe('83.6');
  });
  it('preserves light, hearing and grace rules', () => {
    const p = { distance: 8, visible: true, hidden: false, lightOn: true, running: false, crouched: false, moved: 0, dt: 0.1, grace: 0 };
    expect(perceive(p).tracking).toBe(true);
    expect(perceive({ ...p, lightOn: false }).tracking).toBe(false);
    expect(perceive({ ...p, hidden: true }).tracking).toBe(false);
    expect(perceive({ ...p, grace: 1 }).tracking).toBe(false);
    expect(perceive({ ...p, visible: false, distance: 6, moved: 1, running: true }).tracking).toBe(true);
  });
  it('uses an injected campaign store with the existing save format', () => {
    const data = new Map<string, unknown>();
    const service = createCampaignStore({ read: k => data.get(k), write: (k,v) => { data.set(k,v); }, remove: k => { data.delete(k); } });
    service.save({ ch: 0, found: [true,false,false], solved: false, seen: new Set([1,2]), elapsed: 12 });
    expect(service.saved()).toMatchObject({ v: 1, ch: 0, elapsed: 12, seen: [1,2] });
    data.set(PREFS, { quality: 'low' }); service.writeMute(true);
    expect(data.get(PREFS)).toEqual({ quality: 'low', sound: false });
    service.complete(40); expect(data.has(SAVE)).toBe(false); expect(data.get(LAST)).toEqual({ elapsed: 40 });
  });
});
