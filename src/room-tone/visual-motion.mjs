export function damp(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt)));
}

export function dampAngle(current, target, rate, dt) {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return damp(current, current + difference, rate, dt);
}

export function walkingMotion(phase, amplitude, distance, dt, running, crouched, reducedMotion) {
  const travel = Math.max(0, distance);
  const velocity = dt > 0 ? travel / dt : 0;
  const target = reducedMotion ? 0 : Math.min(1, velocity / (running ? 3.22 : crouched ? 1.05 : 1.88));
  const weight = damp(amplitude, target, 12, dt);
  const nextPhase = (phase + travel * (running ? 6.2 : 7.2)) % (Math.PI * 2);
  return {
    phase: nextPhase,
    amplitude: weight,
    height: reducedMotion ? 0 : Math.sin(nextPhase) * weight * (running ? 0.022 : crouched ? 0.009 : 0.014),
  };
}

export function lampDip(elapsed, duration, reducedMotion) {
  if (reducedMotion || duration <= 0 || elapsed < 0 || elapsed >= duration) return 1;
  return 1 - 0.52 * Math.sin(Math.PI * elapsed / duration) ** 2;
}

export function portraitDistance(width, height, aspect, fov, coverage) {
  const tangent = Math.tan(fov * Math.PI / 360);
  const safeAspect = Math.max(0.1, aspect);
  return Math.max(height, width / safeAspect) / (2 * tangent * Math.max(0.1, coverage));
}
