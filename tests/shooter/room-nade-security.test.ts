import { describe, expect, it } from 'vitest';
import { canAcceptRoomNade, type NetNade, type RoomNadeActor } from '../../src/shooter/net';

const human: RoomNadeActor = {
  id: 2, bot: false, remote: true, alive: true, air: 0, veh: -1,
  x: 10, z: 20, crouch: 0,
};
const normal: NetNade = { x: 10.6, y: 3.65, z: 20, vx: 15, vy: 8, vz: 0 };

describe('ZERO ZONE multiplayer grenade validation', () => {
  it('allows a remote human to throw a plausible grenade from their position', () => {
    expect(canAcceptRoomNade(normal, human, { id: 2 }, false, 2)).toBe(true);
  });
  it('allows host authority to forward grenades from remote AI bots', () => {
    const bot = { ...human, id: 7, bot: true };
    expect(canAcceptRoomNade(normal, bot, { id: 0 }, true, 2)).toBe(true);
  });
  it('rejects spoofed grenade owners and unauthorised bot relays', () => {
    expect(canAcceptRoomNade(normal, human, { id: 3 }, false, 2)).toBe(false);
    expect(canAcceptRoomNade(normal, { ...human, bot: true }, { id: 3 }, false, 2)).toBe(false);
    expect(canAcceptRoomNade(normal, { ...human, remote: false }, { id: 2 }, false, 2)).toBe(false);
    expect(canAcceptRoomNade(normal, human, null, false, 2)).toBe(false);
  });
  it('rejects dead, parachuting or driving players', () => {
    for (const update of [{ alive: false }, { air: 3 }, { veh: 0 }]) {
      expect(canAcceptRoomNade(normal, { ...human, ...update }, { id: 2 }, false, 2)).toBe(false);
    }
  });
  it('rejects grenade teleporting, extreme height, excessive speed and NaN packets', () => {
    for (const update of [
      { x: 50 }, { y: 40 }, { vx: 75 }, { vy: -80 }, { x: Number.NaN },
    ]) {
      expect(canAcceptRoomNade({ ...normal, ...update }, human, { id: 2 }, false, 2)).toBe(false);
    }
  });
});
