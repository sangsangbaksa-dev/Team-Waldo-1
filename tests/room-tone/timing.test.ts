import { afterEach, expect, it, vi } from "vitest";
import { frameDelta } from "../../src/room-tone/clock.mjs";
import { createPauseLatch } from "../../src/room-tone/pause.mjs";
import { Sound } from "../../src/room-tone/sound.js";

afterEach(() => { vi.restoreAllMocks(); });

it("clamps a stalled horror frame without rewinding time", () => {
  expect(frameDelta(2000, 1000)).toBe(0.075);
  expect(frameDelta(1030, 1000)).toBeCloseTo(0.03);
  expect(frameDelta(900, 1000)).toBe(0);
  expect(frameDelta(Number.NaN, 0)).toBe(0);
});

it("ignores the escape that arrives with the pointer-lock pause", () => {
  const latch = createPauseLatch(320);
  latch.arm(500);
  expect(latch.blocks(819)).toBe(true);
  expect(latch.blocks(820)).toBe(false);
});

it("restarts the room clock only after the audio context is running again", async () => {
  let release = (): void => {};
  const gain = { cancelScheduledValues() {}, setTargetAtTime() {} };
  const ctx = {
    state: "suspended",
    currentTime: 10,
    resume: () => new Promise<void>((resolve) => { release = () => { ctx.state = "running"; resolve(); }; }),
    suspend: () => Promise.resolve(),
  };
  const started = vi.spyOn(globalThis, "setInterval").mockImplementation(() => 1 as unknown as ReturnType<typeof setInterval>);
  const sound = new Sound();
  sound.ctx = ctx;
  sound.level = { gain };
  sound.pause(false);
  expect(started).not.toHaveBeenCalled();
  release();
  await Promise.resolve();
  expect(started).toHaveBeenCalledTimes(1);
  expect(sound.nextBeat).toBeCloseTo(10.35);
});
