import { describe, it, expect } from 'vitest';
import { captureHeroPost, createWar } from '../../src/battle/war';

describe('on-foot objective capture', () => {
  it('captures a nearby neutral post and awards one capture', () => {
    const war = createWar();
    const post = war.outposts[5];
    expect(captureHeroPost(war, post.x + 20, post.z, 10)).toBeNull();
    expect(post.owner).toBeNull();
    captureHeroPost(war, post.x, post.z, 5);
    expect(post.owner).toBeNull();
    expect(post.progress).toBeGreaterThan(50);
    captureHeroPost(war, post.x, post.z, 5);
    expect(post.owner).toBe(0);
    expect(war.stats[0].captures).toBe(1);
    expect(captureHeroPost(war, post.x, post.z, 20)).toBeNull();
    expect(war.stats[0].captures).toBe(1);
  });
  it('does not capture an occupied objective while a rival is in range', () => {
    const war = createWar();
    const post = war.outposts[5];
    war.units[4].x = post.x;
    war.units[4].z = post.z;
    expect(captureHeroPost(war, post.x, post.z, 20)).toBeNull();
    expect(post.owner).toBeNull();
  });
});
