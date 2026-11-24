export function frameDelta(now, last, max = 0.075) {
  if (!Number.isFinite(now) || !Number.isFinite(last)) return 0;
  const dt = (now - last) / 1000;
  if (!(dt > 0)) return 0;
  return Math.min(max, dt);
}
