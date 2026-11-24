/** Evening study clock. The wall and the laptop tray share one face, starting at 10:24. */
export function studyClock(elapsedSec: number): string {
  const extra = Math.floor(Math.max(0, Number.isFinite(elapsedSec) ? elapsedSec : 0) / 60);
  const total = 10 * 60 + 24 + extra;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
