import type { Colliders } from './layout';
import { WORLD_HALF } from './layout';

export interface ResumePosition { x: number; z: number; yaw: number; cameraYaw: number; cameraPitch: number; firstPerson: boolean }

/** 기존 v1 저장과 호환된다. 잘못된 위치나 건물 내부는 기본 시작점으로 돌아간다. */
export function readResumePosition(raw: unknown, colliders: Colliders): ResumePosition | null {
  if (!raw || typeof raw !== 'object' || !('position' in raw)) return null;
  const p = raw.position;
  if (!p || typeof p !== 'object') return null;
  const { x, z, firstPerson } = p as Partial<ResumePosition>;
  const pos = p as Partial<ResumePosition> & { facing?: number; pitch?: number };
  const yaw = pos.facing ?? pos.yaw, cameraYaw = pos.cameraYaw ?? (pos.facing !== undefined ? pos.yaw : undefined), cameraPitch = pos.cameraPitch ?? pos.pitch;
  if (typeof x !== 'number' || typeof z !== 'number' || typeof yaw !== 'number' || ![x, z, yaw].every(Number.isFinite) || Math.abs(x) > WORLD_HALF - 2 || Math.abs(z) > WORLD_HALF - 2) return null;
  const out = { x, z };
  if (colliders.resolve(x, z, 0.45, out)) return null;
  const normalize = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));
  const fp = firstPerson === true;
  return { x, z, yaw: normalize(yaw), cameraYaw: normalize(typeof cameraYaw === 'number' && Number.isFinite(cameraYaw) ? cameraYaw : yaw + Math.PI), cameraPitch: typeof cameraPitch === 'number' && Number.isFinite(cameraPitch) ? Math.max(fp ? -1.3 : -0.1, Math.min(fp ? 1.3 : 1.2, cameraPitch)) : fp ? 0 : 0.28, firstPerson: fp };
}
