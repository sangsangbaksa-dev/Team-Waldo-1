export const DECOY_DURATION = 10;
export function createDecoy() {
  return { uses: 2, cell: -1, remaining: 0 };
}
export function deployDecoy(decoy, cell, eligible) {
  if (!eligible || !Number.isInteger(cell) || cell < 0 || decoy.uses <= 0 || decoy.remaining > 0) return false;
  decoy.uses--;
  decoy.cell = cell;
  decoy.remaining = DECOY_DURATION;
  return true;
}
export function tickDecoy(decoy, dt) {
  if (Number.isFinite(dt) && dt > 0) decoy.remaining = Math.max(0, decoy.remaining - dt);
  if (decoy.remaining === 0) decoy.cell = -1;
}
export function decoyTarget(decoy, tracking, inspecting) {
  return !tracking && !inspecting && decoy.remaining > 0 ? decoy.cell : null;
}
