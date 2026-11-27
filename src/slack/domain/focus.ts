export const FOCUS_DURATION = 7;
export const FOCUS_USES = 3;
export interface FocusState { uses: number; remaining: number }
export function createFocus(): FocusState { return { uses: FOCUS_USES, remaining: 0 }; }
export function activateFocus(focus: FocusState, eligible: boolean): boolean {
  if (!eligible || focus.uses <= 0 || focus.remaining > 0) return false;
  focus.uses--;
  focus.remaining = FOCUS_DURATION;
  return true;
}
export function tickFocus(focus: FocusState, dt: number, covered: boolean): void {
  if (covered) focus.remaining = 0;
  else if (Number.isFinite(dt) && dt > 0) focus.remaining = Math.max(0, focus.remaining - dt);
}
