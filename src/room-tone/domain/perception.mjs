export function perceive({ distance, visible, hidden, lightOn, running, crouched, moved, dt, grace }) {
  const inSight = !hidden && visible && distance <= (lightOn ? 10.7 : 6.1);
  const hearRange = running ? 14 : crouched ? 1.6 : 4.7;
  const hear = !hidden && moved > dt * 0.15 && distance < hearRange * (visible ? 1 : 0.55);
  return { inSight, tracking: !grace && (inSight || hear) };
}
