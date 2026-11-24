import { SoloSession, type SessionFactory } from '../application/session.js';
import { OnlineSession } from './online.js';

export const browserSessionFactory: SessionFactory = {
  solo: (world, name) => new SoloSession(world, name),
  online: (request, world) => new OnlineSession(request, world),
};
