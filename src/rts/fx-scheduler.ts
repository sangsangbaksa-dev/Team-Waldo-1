// FRONTLINE: advance delayed combat effects without allocating an array every frame.
export interface DeferredFx {
  left: number;
  run: () => void;
}

/** Compact the pending queue before executing callbacks.
 * Callbacks can schedule new effects without changing the list being iterated.
 * ready is a reusable scratch array owned by the caller.
 */
export function advanceDeferredFx(pending: DeferredFx[], ready: DeferredFx[], dt: number): void {
  ready.length = 0;
  let write = 0;
  const count = pending.length;
  for (let i = 0; i < count; i++) {
    const fx = pending[i];
    fx.left -= dt;
    if (fx.left > 0) pending[write++] = fx;
    else ready.push(fx);
  }
  pending.length = write;
  for (const fx of ready) fx.run();
  ready.length = 0;
}
