/** Nose-back rate once the player is inside the edge warning band. 0 keeps the stick in charge. */
export function edgeRecoveryRate(edge: number): number {
  if (!(edge > 0.2)) return 0;
  return Math.min(1.35, 0.55 + edge);
}
