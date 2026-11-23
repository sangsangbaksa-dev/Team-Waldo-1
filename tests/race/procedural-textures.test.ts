// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { MAPS } from '../../src/race/maps';
import { cachedRoadTexture } from '../../src/race/procedural-textures';

const noOp = () => undefined;

describe('SPEED RUSH CPU-side road artwork cache', () => {
  it('reuses a painted canvas but returns a fresh GPU texture every restart', () => {
    const theme = MAPS[0].theme;
    const first = cachedRoadTexture(theme, 'asphalt', 512, 1024, noOp);
    const second = cachedRoadTexture(theme, 'asphalt', 512, 1024, noOp);
    expect(first).not.toBe(second);
    expect(first.uuid).not.toBe(second.uuid);
    expect(first.image).toBe(second.image);
    first.dispose();
    expect(second.image).toBe(first.image);
    second.dispose();
  });

  it('keeps ground and asphalt canvases separate for the same theme', () => {
    const theme = MAPS[1].theme;
    const ground = cachedRoadTexture(theme, 'ground', 128, 128, noOp);
    const road = cachedRoadTexture(theme, 'asphalt', 512, 1024, noOp);
    expect(ground.image).not.toBe(road.image);
    expect(ground.image.width).toBe(128);
    expect(road.image.height).toBe(1024);
    ground.dispose(); road.dispose();
  });

  it('evicts the oldest theme to cap CPU canvas memory at two maps', () => {
    const firstTheme = MAPS[2].theme;
    const old = cachedRoadTexture(firstTheme, 'ground', 512, 512, noOp);
    cachedRoadTexture(MAPS[3].theme, 'ground', 512, 512, noOp).dispose();
    cachedRoadTexture(MAPS[4].theme, 'ground', 512, 512, noOp).dispose();
    const again = cachedRoadTexture(firstTheme, 'ground', 512, 512, noOp);
    expect(again.image).not.toBe(old.image);
    again.dispose(); old.dispose();
  });

  it('rebuilds a canvas when a requested surface resolution changes', () => {
    const theme = MAPS[5].theme;
    const standard = cachedRoadTexture(theme, 'ground', 128, 128, noOp);
    const larger = cachedRoadTexture(theme, 'ground', 512, 512, noOp);
    expect(standard.image).not.toBe(larger.image);
    expect(larger.image.width).toBe(512);
    standard.dispose(); larger.dispose();
  });
});
