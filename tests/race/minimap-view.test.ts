import { afterEach, describe, expect, it, vi } from 'vitest';
import { RaceMinimap } from '../../src/race/minimap-view';
import { createRace } from '../../src/race/race';
import { buildTrack } from '../../src/race/track';

function fakeContext() {
  return {
    clearRect: vi.fn(), stroke: vi.fn(), fillRect: vi.fn(),
    beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    drawImage: vi.fn(), lineJoin: '', strokeStyle: '', lineWidth: 0, fillStyle: '',
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('SPEED RUSH minimap renderer', () => {
  it('rasterizes the track once, then reuses the background for vehicle updates', () => {
    const backgroundCtx = fakeContext(), foregroundCtx = fakeContext();
    const background = { width: 0, height: 0, getContext: vi.fn(() => backgroundCtx) };
    const foreground = { width: 220, height: 220, getContext: vi.fn(() => foregroundCtx) };
    const path = { moveTo: vi.fn(), lineTo: vi.fn() };
    vi.stubGlobal('document', { createElement: vi.fn(() => background) });
    vi.stubGlobal('Path2D', class { moveTo = path.moveTo; lineTo = path.lineTo; });

    const track = buildTrack();
    const minimap = new RaceMinimap(foreground as unknown as HTMLCanvasElement, track);
    const race = createRace(track);
    expect(background.width).toBe(220);
    expect(background.height).toBe(220);
    expect(backgroundCtx.stroke).toHaveBeenCalledTimes(2);
    expect(path.lineTo).toHaveBeenCalledTimes(track.n);

    minimap.render(race);
    minimap.render(race);
    expect(backgroundCtx.stroke).toHaveBeenCalledTimes(2);
    expect(foregroundCtx.drawImage).toHaveBeenCalledTimes(2);
    expect(foregroundCtx.arc).toHaveBeenCalledTimes(2 * race.racers.length);
    expect(foregroundCtx.stroke).toHaveBeenCalledTimes(2); // player marker

    minimap.setTrack(track);
    expect(backgroundCtx.stroke).toHaveBeenCalledTimes(4);
  });

  it('shows an active ghost along with the player marker', () => {
    const backgroundCtx = fakeContext(), foregroundCtx = fakeContext();
    vi.stubGlobal('document', {
      createElement: () => ({ width: 220, height: 220, getContext: () => backgroundCtx }),
    });
    vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} });
    const track = buildTrack();
    const minimap = new RaceMinimap(
      { width: 220, height: 220, getContext: () => foregroundCtx } as unknown as HTMLCanvasElement,
      track,
    );
    const race = createRace(track, 1, Infinity, { trial: true });
    race.phase = 'racing';
    race.clock = 0.01;
    race.ghost = { time: 2, laps: 1, data: [track.x[0], track.z[0], 0, 0, track.x[1], track.z[1], 0, 1] };
    minimap.render(race);
    expect(foregroundCtx.arc).toHaveBeenCalledTimes(2);
    expect(foregroundCtx.stroke).toHaveBeenCalledTimes(2);
  });
});
