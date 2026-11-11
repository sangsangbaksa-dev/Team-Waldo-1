import type { Command, World } from '../types';
import { applyChoice } from './progression';

export function applyCommands(world: World, commands: readonly Command[]): void {
  const p = world.player;
  for (const c of commands) {
    switch (c.t) {
      case 'move': {
        const len = Math.hypot(c.x, c.y);
        if (len > 1e-6) {
          p.moveX = c.x / Math.max(1, len);
          p.moveY = c.y / Math.max(1, len);
          p.faceX = c.x / len;
          p.faceY = c.y / len;
        } else {
          p.moveX = 0;
          p.moveY = 0;
        }
        break;
      }
      case 'choose':
        applyChoice(world, c.index);
        break;
      case 'pause':
        world.paused = true;
        break;
      case 'resume':
        world.paused = false;
        break;
    }
  }
}
