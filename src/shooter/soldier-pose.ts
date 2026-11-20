import type { CharacterRig } from '../shared/character';

export interface SoldierPoseHistory { air: number; alive: boolean; dead: number }
export interface SoldierPoseFrame { air: number; alive: boolean; distance: number; dt: number }

/** Preserve the last applied pose on skipped frames, force the transition frame,
 * and stop recomputing settled corpses. The outer rig still tracks world position. */
export function updateSoldierPose(ch: CharacterRig, history: SoldierPoseHistory, frame: SoldierPoseFrame): void {
  const { air, alive, distance, dt } = frame;
  const dead = ch.state.dead;
  const changed = history.air !== air || history.alive !== alive;
  const finished = !alive && dead >= 1;
  const wasFinished = !history.alive && history.dead >= 1;
  if (finished && wasFinished && !changed) return;

  // The fall must reach its exact terminal pose even if the camera is far away.
  ch.setDetail(!alive || changed ? 0 : distance > 90 ? 2 : distance > 45 ? 1 : 0);
  if (alive && air === 2) {
    ch.state.aim = 0;
    ch.state.wave = 0;
    ch.update(dt);
    ch.root.rotation.z = -1.25;
  } else {
    // Do not touch the rig's rotation here: on LOD-skipped frames update()
    // intentionally retains all the previous joint transforms.
    ch.update(dt);
  }
  history.air = air;
  history.alive = alive;
  history.dead = dead;
}
