import { describe, expect, it, vi } from 'vitest';
import { RetriableAssetCache } from '../../src/race/car-models';

describe('SPEED RUSH car-model asset caching', () => {
  it('coalesces concurrent loads and reuses the parsed object across new sessions', async () => {
    const cache = new RetriableAssetCache<{ name: string }>();
    let finish: (value: { name: string }) => void = () => undefined;
    const load = vi.fn(() => new Promise<{ name: string }>(resolve => { finish = resolve; }));
    const first = cache.load(load), second = cache.load(load);
    expect(first).toBe(second);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    const model = { name: 'shared-race-glb' };
    finish(model);
    expect(await first).toBe(model);
    expect(await second).toBe(model);
    expect(await cache.load(load)).toBe(model);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not permanently cache failures and retries a later re-entry', async () => {
    const cache = new RetriableAssetCache<string>();
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('loaded');
    expect(await cache.load(load)).toBeNull();
    expect(await cache.load(load)).toBe('loaded');
    expect(await cache.load(load)).toBe('loaded');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('also recovers from a synchronous loader exception', async () => {
    const cache = new RetriableAssetCache<number>();
    const loader = vi.fn().mockImplementationOnce(() => { throw new Error('broken parser'); }).mockResolvedValue(42);
    expect(await cache.load(loader)).toBeNull();
    expect(await cache.load(loader)).toBe(42);
  });
});
