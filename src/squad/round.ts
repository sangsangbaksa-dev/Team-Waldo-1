/** Present best-of-three rounds consistently, including draws that extend play. */
export function roundLabel(round: number): string {
  return round > 3 ? `연장전 ${round - 3}` : `라운드 ${round}`;
}
