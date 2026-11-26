export interface TouchControl {
  moveId: number;
  lookId: number;
  brakeId: number;
  mx: number;
  my: number;
  ox: number;
  oy: number;
  lx: number;
  ly: number;
  run: boolean;
  brake: boolean;
}

const STICK = 55;
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

export function createTouch(): TouchControl {
  return { moveId: -1, lookId: -1, brakeId: -1, mx: 0, my: 0, ox: 0, oy: 0, lx: 0, ly: 0, run: false, brake: false };
}

function busy(tc: TouchControl, id: number): boolean {
  return id === tc.moveId || id === tc.lookId || id === tc.brakeId;
}

/** Left side of the screen steers. The same finger cannot also look or brake. */
export function beginCanvasPointer(tc: TouchControl, id: number, x: number, y: number, width: number): 'move' | 'look' | null {
  if (busy(tc, id)) return null;
  if (x < width * 0.45 && tc.moveId < 0) {
    tc.moveId = id;
    tc.ox = x;
    tc.oy = y;
    tc.mx = tc.my = 0;
    return 'move';
  }
  if (tc.lookId < 0) {
    tc.lookId = id;
    tc.lx = x;
    tc.ly = y;
    return 'look';
  }
  return null;
}

export function stickOffset(tc: TouchControl, id: number, x: number, y: number): { x: number; y: number } | null {
  if (id !== tc.moveId) return null;
  tc.mx = clamp((x - tc.ox) / STICK, -1, 1);
  tc.my = clamp((y - tc.oy) / STICK, -1, 1);
  return { x: tc.mx * 38, y: tc.my * 38 };
}

export function lookDelta(tc: TouchControl, id: number, x: number, y: number): { x: number; y: number } | null {
  if (id !== tc.lookId) return null;
  const dx = x - tc.lx, dy = y - tc.ly;
  tc.lx = x;
  tc.ly = y;
  return { x: dx, y: dy };
}

export function beginBrake(tc: TouchControl, id: number): boolean {
  if (tc.brakeId >= 0 || busy(tc, id)) return false;
  tc.brakeId = id;
  tc.brake = true;
  return true;
}

export function endPointer(tc: TouchControl, id: number): 'move' | 'look' | 'brake' | null {
  if (id === tc.moveId) {
    tc.moveId = -1;
    tc.mx = tc.my = 0;
    return 'move';
  }
  if (id === tc.lookId) {
    tc.lookId = -1;
    return 'look';
  }
  if (id === tc.brakeId) {
    tc.brakeId = -1;
    tc.brake = false;
    return 'brake';
  }
  return null;
}

export function clearTouch(tc: TouchControl): void {
  tc.moveId = tc.lookId = tc.brakeId = -1;
  tc.mx = tc.my = 0;
  tc.run = false;
  tc.brake = false;
}
