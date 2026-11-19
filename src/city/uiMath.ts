// Convert a click from a displayed minimap into bounded world coordinates.
// Use each rendered axis independently: mobile layout may change the aspect ratio.
import { SIZE } from './defs';

export function mapPointerToWorld(
  clientX: number, clientY: number, left: number, top: number, width: number, height: number,
): { x: number; y: number } | null {
  if (![clientX, clientY, left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const clamp = (v: number): number => Math.max(0, Math.min(SIZE, v));
  return { x: clamp((clientX - left) / width * SIZE), y: clamp((clientY - top) / height * SIZE) };
}

/** Look pitch limits. Past the min, the camera dives through the ground. */
export const LOOK_PITCH_MIN = -0.72;
export const LOOK_PITCH_MAX = 0.95;
/** Pointer-lock acquisition or a placement click can inject huge movement deltas. */
export const LOOK_SPIKE_PX = 64;

export function clampLookPitch(pitch: number): number {
  if (!Number.isFinite(pitch)) return 0;
  return Math.max(LOOK_PITCH_MIN, Math.min(LOOK_PITCH_MAX, pitch));
}

export function isLookSpike(dx: number, dy: number, limit = LOOK_SPIKE_PX): boolean {
  return !Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > limit || Math.abs(dy) > limit;
}

export function applyLook(yaw: number, pitch: number, dx: number, dy: number, sensitivity = 0.0024): { yaw: number; pitch: number } {
  return { yaw: yaw + dx * sensitivity, pitch: clampLookPitch(pitch - dy * sensitivity) };
}

/** Face the outward door vector (unit, building → street). */
export function doorFacingYaw(outX: number, outY: number): number {
  if (!Number.isFinite(outX) || !Number.isFinite(outY) || (outX === 0 && outY === 0)) return Math.PI / 2;
  return Math.atan2(outY, outX);
}

/** Keep a label's centre inside the viewport with a margin. */
export function clampLabelScreenPos(
  x: number, y: number, screenW: number, screenH: number, labelW: number, labelH: number, margin = 8,
): { x: number; y: number } {
  const hw = Math.max(0, labelW / 2), hh = Math.max(0, labelH / 2);
  const minX = margin + hw, maxX = Math.max(minX, screenW - margin - hw);
  const minY = margin + hh, maxY = Math.max(minY, screenH - margin - hh);
  return { x: Math.min(maxX, Math.max(minX, x)), y: Math.min(maxY, Math.max(minY, y)) };
}

/**
 * THREE.Sprite centre so a world-anchored label hangs inward instead of clipping.
 * Sprite centre (0,0) is bottom-left, (1,1) is top-right. Screen y grows downward.
 */
export function labelSpriteCenter(
  sx: number, sy: number, clampedX: number, clampedY: number, labelW: number, labelH: number,
): { x: number; y: number } {
  const w = Math.max(1, labelW), h = Math.max(1, labelH);
  return {
    x: Math.min(1, Math.max(0, 0.5 + (sx - clampedX) / w)),
    y: Math.min(1, Math.max(0, 0.5 + (clampedY - sy) / h)),
  };
}

/** Screen rect reserved for the region-name chip (tactical view). */
export function areaChipRect(screenW: number, screenH: number): { x: number; y: number; w: number; h: number } {
  const w = Math.min(280, Math.max(80, screenW * 0.46)), h = 40, right = 16, bottom = 88;
  return { x: screenW - right - w, y: screenH - bottom - h, w, h };
}

export function pointInRect(
  x: number, y: number, r: { x: number; y: number; w: number; h: number }, pad = 6,
): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

/** Nudge a screen point above the region-name chip when they would overlap. */
export function declutterFromAreaChip(x: number, y: number, screenW: number, screenH: number): { x: number; y: number } {
  const r = areaChipRect(screenW, screenH);
  if (!pointInRect(x, y, r, 10)) return { x, y };
  return { x, y: r.y - 12 };
}

/** 건설 고스트까지의 거리: 시선 각도에 비례해 근접(40)~최대(max)를 고르게 오갑니다. 지평선 근처가 최대, 아래로 약 45° 숙이면 가장 가깝습니다.
 *  (지면 교점 방식은 먼 거리에서 각도 1°에 수십 칸이 움직여 중간 거리에 둘 수 없었습니다.) */
export const BUILD_REACH_MIN = 40;
export function buildReach(pitch: number, max = 700): number {
  if (!Number.isFinite(pitch)) return max * 0.8;
  const t = Math.max(0, Math.min(1, (-pitch - 0.04) / 0.75));
  return BUILD_REACH_MIN + (max - BUILD_REACH_MIN) * (1 - t);
}
