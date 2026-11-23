import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShooterNavigation } from '../../src/shooter/navigation';
import type { Match, Player } from '../../src/shooter/sim';

afterEach(() => vi.unstubAllGlobals());

function context() {
  const drawImage = vi.fn();
  const arc = vi.fn();
  const fillRect = vi.fn();
  const fillText = vi.fn();
  const base: Record<PropertyKey, unknown> = {
    drawImage, arc, fillRect, fillText,
    createRadialGradient: () => ({ addColorStop: () => undefined }),
  };
  const ctx = new Proxy(base, {
    get(target, key) { return target[key] ?? (() => undefined); },
    set(target, key, value: unknown) { target[key] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, drawImage, arc, fillRect, fillText };
}

function canvas(ctx: CanvasRenderingContext2D | null): HTMLCanvasElement {
  return { width: 300, height: 300, getContext: () => ctx } as unknown as HTMLCanvasElement;
}

function fixture() {
  const match = {
    t: 30,
    map: {
      half: 100,
      terrain: { forests: [], rises: [], hills: [], cliffs: [], ponds: [], rivers: [], bridges: [] },
      compounds: [], buildings: [], props: [], trees: [],
    },
    zone: { cx: 0, cz: 0, r: 70, nextCx: 10, nextCz: 0, nextR: 40 },
    reds: [], vehicles: [], plane: null, drops: [], sounds: [], players: [],
  } as unknown as Match;
  const player = { id: 0, x: 0, z: 0, yaw: 0 } as Player;
  return { match, player };
}

describe('ZERO ZONE navigation renderer', () => {
  it('draws on two canvases and caches the static map until match reset', () => {
    const map = context(), compass = context(), base = context();
    const create = vi.fn(() => canvas(base.ctx));
    vi.stubGlobal('document', { createElement: create });
    const hud = new ShooterNavigation(canvas(map.ctx), canvas(compass.ctx));
    const { match, player } = fixture();
    hud.draw(match, player);
    hud.draw(match, player);
    expect(map.drawImage).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
    expect(compass.fillRect).toHaveBeenCalled();
    expect(compass.fillText).toHaveBeenCalled();
    hud.reset();
    hud.draw(match, player);
    expect(create).toHaveBeenCalledTimes(2);
    expect(map.drawImage).toHaveBeenCalledTimes(3);
  });

  it('renders expired or dead recon markers only when explicitly passed and valid', () => {
    const map = context(), compass = context(), base = context();
    vi.stubGlobal('document', { createElement: () => canvas(base.ctx) });
    const hud = new ShooterNavigation(canvas(map.ctx), canvas(compass.ctx));
    const { match, player } = fixture();
    // This list comes only from local solo mode; online rendering never receives it.
    match.players.push(player, { id: 1, alive: true } as Player, { id: 2, alive: false } as Player);
    hud.draw(match, player, [
      { id: 1, x: 40, z: 40, expires: match.t + 7 },
      { id: 2, x: 50, z: 50, expires: match.t + 7 },
      { id: 1, x: 60, z: 60, expires: match.t - 1 },
    ]);
    // Two circles for the zone, exactly one extra circle for the valid mark.
    expect(map.arc).toHaveBeenCalledTimes(3);
    hud.draw(match, player, []);
    // The second frame draws only the two zone circles; stale markers are gone.
    expect(map.drawImage).toHaveBeenCalledTimes(2);
    expect(map.arc).toHaveBeenCalledTimes(5);
  });

  it('fails fast when the browser does not offer a 2D context', () => {
    expect(() => new ShooterNavigation(canvas(null), canvas(context().ctx))).toThrow('navigation canvas');
  });
});
