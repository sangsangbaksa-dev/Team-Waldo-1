import { describe, expect, it } from 'vitest';
import { canAcceptRoomLoot, parseLoot } from '../../src/shooter/sync';
import type { NetMsg } from '../../src/net/types';
import type { Loot } from '../../src/shooter/world';

const weaponMsg = (changes: Record<string, unknown> = {}): NetMsg => ({
  t: 'la', i: 2_001_200, k: 'weapon', w: 'rifle', p: null, l: 0, x: 10, z: 20, a: null,
  ...changes,
});
const loot = (changes: Partial<Loot> = {}): Loot => ({
  id: 2_001_200, kind: 'weapon', weapon: 'rifle', x: 10, z: 20, taken: false, ...changes,
});

describe('ZERO ZONE remote loot validation', () => {
  it('rejects malformed items before HUD or inventory code can dereference them', () => {
    expect(parseLoot(weaponMsg({ w: null }))).toBeNull();
    expect(parseLoot(weaponMsg({ k: 'attach', w: null, p: null }))).toBeNull();
    expect(parseLoot(weaponMsg({ k: 'armor', w: 'rifle' }))).toBeNull();
    expect(parseLoot(weaponMsg({ k: 'weapon', p: 'scope4' }))).toBeNull();
    expect(parseLoot(weaponMsg({ w: 'invalid' }))).toBeNull();
    expect(parseLoot(weaponMsg({ x: Number.NaN }))).toBeNull();
  });

  it('accepts well-formed dropped weapons, attachments, and healing supplies', () => {
    expect(parseLoot(weaponMsg())).toMatchObject({ kind: 'weapon', weapon: 'rifle', x: 10, z: 20 });
    expect(parseLoot(weaponMsg({ k: 'attach', w: null, p: 'scope4' }))).toMatchObject({ kind: 'attach', part: 'scope4' });
    expect(parseLoot(weaponMsg({ k: 'medkit', w: null, p: null }))).toMatchObject({ kind: 'medkit', weapon: null });
  });

  it('rejects loot outside a sender own unique ID range or outside the game map', () => {
    const sender = { x: 12, z: 20 };
    expect(canAcceptRoomLoot(loot(), 1, 290, false, sender)).toBe(true);
    expect(canAcceptRoomLoot(loot(), 0, 290, false, sender)).toBe(false);
    expect(canAcceptRoomLoot(loot({ id: 2_000_001 }), 1, 290, false, sender)).toBe(false);
    expect(canAcceptRoomLoot(loot({ id: 3_000_000 }), 1, 290, false, sender)).toBe(false);
    expect(canAcceptRoomLoot(loot({ x: 291 }), 1, 290, true)).toBe(false);
    expect(canAcceptRoomLoot(loot(), -1, 290, true)).toBe(false);
  });

  it('permits authority generated bot loot remotely, but not remote player teleporting items', () => {
    const dropped = loot({ x: 130, z: 30 });
    expect(canAcceptRoomLoot(dropped, 1, 290, true)).toBe(true);
    expect(canAcceptRoomLoot(dropped, 1, 290, false, { x: 0, z: 0 })).toBe(false);
    expect(canAcceptRoomLoot(dropped, 1, 290, false)).toBe(false);
    expect(canAcceptRoomLoot(dropped, 1, 290, false, { x: 118, z: 25 })).toBe(true);
  });
});
