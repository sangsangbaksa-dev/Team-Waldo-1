export function threatLabel(threat) {
  if (threat > 0.68) return "바로 근처";
  if (threat > 0.28) return "접근 중";
  return "안정";
}

export function threatLevel(threat) {
  if (threat > 0.68) return "near";
  if (threat > 0.28) return "close";
  return "calm";
}

export function breathLabel(hidden, winded, running) {
  if (hidden) return "숨죽임";
  if (winded) return "숨 고름";
  if (running) return "질주";
  return "걸음";
}

export function meterScale(value) {
  const n = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return n.toFixed(3);
}
