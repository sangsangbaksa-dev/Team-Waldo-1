import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { createAdventure } from '../../src/battle/adventure';
import { createWar, stepWar } from '../../src/battle/war';
import { decodeWar, encodeWar } from '../../src/battle/save';

describe('direct-control combat persistence', () => {
  it('can restore a battle saved immediately after a lethal arrow and counts the loss once', () => {
    const war = createWar({ grandBattle: true });
    const camera = new PerspectiveCamera();
    const adventure = createAdventure(new Scene(), camera, war, false);
    try {
      adventure.toField(); adventure.update(0, new Set());
      const target = war.units.find(unit => unit.owner === 1)!;
      target.x = camera.position.x; target.z = camera.position.z - 15; target.hp = 20;
      camera.lookAt(target.x, 1.8, target.z);
      expect(adventure.shoot()).toBe(true);
      const restored = decodeWar(encodeWar(war));
      expect(restored).not.toBeNull();
      expect(restored?.units.some(unit => unit.id === target.id)).toBe(false);
      expect(war.stats[0].kills).toBe(1);
      expect(war.stats[1].lost).toBe(1);
      stepWar(war, .025);
      expect(war.stats[0].kills).toBe(1);
      expect(war.stats[1].lost).toBe(1);
    } finally { adventure.dispose(); }
  });
});
