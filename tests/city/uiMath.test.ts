import { describe, expect, it } from 'vitest';
import { SIZE } from '../../src/city/defs';
import { mapPointerToWorld } from '../../src/city/uiMath';

describe('LAST CITY minimap hit testing', () => {
  it('maps x and y independently on rectangular displayed maps', () => {
    expect(mapPointerToWorld(110, 220, 10, 20, 200, 400)).toEqual({ x: SIZE / 2, y: SIZE / 2 });
    expect(mapPointerToWorld(210, 420, 10, 20, 200, 400)).toEqual({ x: SIZE, y: SIZE });
  });
  it('clamps clicks to world bounds and ignores invalid layouts', () => {
    expect(mapPointerToWorld(-100, 9999, 10, 20, 200, 400)).toEqual({ x: 0, y: SIZE });
    expect(mapPointerToWorld(10, 20, 10, 20, 0, 400)).toBeNull();
    expect(mapPointerToWorld(NaN, 20, 10, 20, 200, 400)).toBeNull();
  });
});

import {
  LOOK_PITCH_MAX, LOOK_PITCH_MIN, applyLook, areaChipRect, clampLabelScreenPos, clampLookPitch,
  declutterFromAreaChip, doorFacingYaw, isLookSpike, labelSpriteCenter,
} from '../../src/city/uiMath';

describe('look pitch and spikes', () => {
  it('clamps pitch so the camera cannot dive through the ground', () => {
    expect(clampLookPitch(-1.2)).toBe(LOOK_PITCH_MIN);
    expect(clampLookPitch(2)).toBe(LOOK_PITCH_MAX);
    expect(clampLookPitch(-0.05)).toBeCloseTo(-0.05);
    expect(clampLookPitch(Number.NaN)).toBe(0);
  });
  it('ignores pointer-lock spikes and still clamps a legal look', () => {
    expect(isLookSpike(0, 400)).toBe(true);
    expect(isLookSpike(3, -4)).toBe(false);
    const next = applyLook(0, -0.05, 0, 800);
    expect(next.pitch).toBe(LOOK_PITCH_MIN);
  });
});

describe('door exit yaw', () => {
  it('faces out of the door, not a fixed east heading', () => {
    expect(doorFacingYaw(1, 0)).toBeCloseTo(0);
    expect(doorFacingYaw(0, 1)).toBeCloseTo(Math.PI / 2);
    expect(doorFacingYaw(-1, 0)).toBeCloseTo(Math.PI);
    expect(doorFacingYaw(0, 0)).toBeCloseTo(Math.PI / 2);
  });
});

describe('business labels stay on screen', () => {
  it('clamps a label that would clip on the right edge', () => {
    const p = clampLabelScreenPos(1420, 200, 1440, 900, 160, 48, 8);
    expect(p.x).toBeLessThanOrEqual(1440 - 8 - 80);
    expect(p.x).toBeGreaterThanOrEqual(8 + 80);
    expect(p.y).toBe(200);
  });
  it('hangs the sprite inward by shifting its centre', () => {
    const c = labelSpriteCenter(1420, 200, 1352, 200, 160, 48);
    expect(c.x).toBeGreaterThan(0.5);
    expect(c.x).toBeLessThanOrEqual(1);
    expect(c.y).toBeCloseTo(0.5);
  });
});

describe('tactical region-name declutter', () => {
  it('pushes a roof sign up when it sits in the area chip', () => {
    const r = areaChipRect(1440, 900);
    const hit = declutterFromAreaChip(r.x + 40, r.y + 20, 1440, 900);
    expect(hit.y).toBeLessThan(r.y);
    const miss = declutterFromAreaChip(200, 200, 1440, 900);
    expect(miss).toEqual({ x: 200, y: 200 });
  });
});
