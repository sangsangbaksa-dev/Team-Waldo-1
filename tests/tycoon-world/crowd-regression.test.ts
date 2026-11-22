import { describe, expect, it } from 'vitest';
import { Scene, Vector3 } from 'three';
import { CharacterKit } from '../../src/shared/character';
import { CIVILIANS } from '../../src/shared/character';
import { Crowd } from '../../src/tycoon/scene/people';

describe('HUSTLE pedestrian origin and pose heights', () => {
  it('retains sidewalk elevation after shared character animation', () => {
    const empty = { fixed: null, team: null, skin: null, glow: null };
    const parts = Object.fromEntries(CIVILIANS.map(kind => [kind, {body:empty,leg:empty}]));
    const crowd = new Crowd(new Scene(), new CharacterKit(parts), 'high');
    crowd.setStage(6);
    crowd.update(.016, new Vector3(0, 0, 0), 0, 0, () => true);
    const visible = crowd.group.children.filter(root => root.visible);
    expect(visible.length).toBeGreaterThan(0);
    for (const root of visible) expect(root.position.y).toBeGreaterThanOrEqual(.18);
    crowd.dispose();
  });
});
