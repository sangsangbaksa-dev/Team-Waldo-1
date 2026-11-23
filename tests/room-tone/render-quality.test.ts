import { describe, expect, it } from "vitest";
import { renderingScale } from "../../src/room-tone/render-quality.mjs";

describe("ROOM TONE fill-rate budget", () => {
  it("preserves device resolution on small displays", () => {
    expect(renderingScale(390, 844, 1, true)).toBe(1);
    expect(renderingScale(1280, 720, 1)).toBe(1);
    expect(renderingScale(390, 844, 3, true)).toBeCloseTo(1.35);
  });
  it("reduces extreme desktop pixel counts instead of exhausting GPU memory", () => {
    const ratio = renderingScale(3840, 2160, 2.5);
    expect(ratio).toBeLessThan(0.8);
    expect(ratio).toBeGreaterThan(0.3);
    expect(3840 * 2160 * ratio ** 2).toBeLessThanOrEqual(3_000_001);
  });
  it("uses a lower mobile fill-rate budget", () => {
    const touch = renderingScale(1600, 900, 3, true);
    const desktop = renderingScale(1600, 900, 3, false);
    expect(touch).toBeLessThan(desktop);
    expect(touch).toBeLessThanOrEqual(1.35);
  });
  it("honors shared low, standard and high quality presets", () => {
    const low = renderingScale(1920, 1080, 3, false, "low");
    const standard = renderingScale(1920, 1080, 3, false, "standard");
    const high = renderingScale(1920, 1080, 3, false, "high");
    expect(low).toBeLessThan(standard);
    expect(standard).toBeLessThan(high);
    const touchLow = renderingScale(1600, 900, 3, true, "low");
    const touchHigh = renderingScale(1600, 900, 3, true, "high");
    expect(touchLow).toBeLessThan(touchHigh);
  });
  it("does not return NaN or zero on invalid viewport dimensions", () => {
    expect(renderingScale(0, 0, 0)).toBe(1);
    expect(Number.isFinite(renderingScale(Infinity, NaN, NaN))).toBe(true);
  });
});
