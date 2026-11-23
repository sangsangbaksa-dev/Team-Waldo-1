import type { Input } from '../domain/combat.js';
import type { Snapshot } from '../domain/match.js';
import type { RoomInfo } from './session.js';

export type ClientMessage =
  | { type: 'create'; name: string }
  | { type: 'join'; name: string; code: string }
  | { type: 'start' }
  | { type: 'input'; seq: number; generation: number; input: Input }
  | { type: 'ping'; time: number };

export type ServerMessage =
  | { type: 'room'; room: RoomInfo }
  | { type: 'state'; state: Snapshot }
  | { type: 'error'; message: string }
  | { type: 'pong'; time: number };

export function callsign(value: string): string {
  return value.trim().replace(/[^a-z0-9 _-]/gi, '').slice(0, 16).toUpperCase() || 'NOMAD';
}

export const roomCode = (value: string) => value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 5);
