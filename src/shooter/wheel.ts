/** Trackpad-friendly weapon switching: one toggle per deliberate wheel gesture.
 * High frequency deltas from a two-finger scroll must not rapid-fire weapon swaps. */
export interface WheelSwapState {
  lastEventAt: number;
  direction: number;
  distance: number;
  consumed: boolean;
}

export function newWheelSwapState(): WheelSwapState {
  return { lastEventAt: -Infinity, direction: 0, distance: 0, consumed: false };
}

export function acceptWheelSwap(
  state: WheelSwapState, deltaY: number, deltaMode: number, now: number,
): boolean {
  if (!Number.isFinite(deltaY) || !Number.isFinite(now) || deltaY === 0) return false;
  // DOM_DELTA_PIXEL=0, LINE=1, PAGE=2; normalize mouse wheels and trackpads.
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 640 : 1;
  const direction = Math.sign(deltaY);
  if (now - state.lastEventAt > 220 || direction !== state.direction) {
    state.distance = 0;
    state.consumed = false;
  }
  state.lastEventAt = now;
  state.direction = direction;
  state.distance = Math.min(2000, state.distance + Math.abs(deltaY) * unit);
  if (!state.consumed && state.distance >= 70) {
    state.consumed = true;
    return true;
  }
  return false;
}
