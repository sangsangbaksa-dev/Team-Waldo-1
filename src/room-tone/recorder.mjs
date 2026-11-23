export const RECORDER_LIMIT = 2;
export function recorderUses(value) {
  return Number.isInteger(value) ? Math.max(0, Math.min(RECORDER_LIMIT, value)) : 0;
}
export function placementCell(map, origin, yaw) {
  const width = map[0]?.length ?? 0;
  if (!width || !Number.isInteger(origin) || !Number.isFinite(yaw) ||
      map[Math.floor(origin / width)]?.[origin % width] !== ".") return null;
  const sx = Math.sin(yaw), sz = Math.cos(yaw);
  const dx = Math.abs(sx) >= Math.abs(sz) ? (sx > 0 ? -1 : 1) : 0;
  const dz = dx === 0 ? (sz > 0 ? -1 : 1) : 0;
  let x = origin % width, z = Math.floor(origin / width), target = null;
  for (let i = 0; i < 3; i++) {
    x += dx;
    z += dz;
    if (map[z]?.[x] !== ".") break;
    target = z * width + x;
  }
  return target ?? origin;
}
export function advanceRecorder(recorder, dt) {
  if (!recorder || !Number.isFinite(dt) || dt <= 0) return { recorder, pulse: false };
  const age = recorder.age + dt;
  if (age >= 6.2) return { recorder: null, pulse: false };
  const pulses = age < 0.55 ? 0 : Math.min(3, Math.floor((age - 0.55) / 1.65) + 1);
  return { recorder: { ...recorder, age, pulses }, pulse: pulses > recorder.pulses };
}
export function recorderAudible(recorder, corridorSteps) {
  return Boolean(recorder && recorder.age >= 0.55 && recorder.age < 5.8 &&
    Number.isInteger(corridorSteps) && corridorSteps >= 0 && corridorSteps <= 10);
}
