export interface RoomPoint { x: number; z: number; }
export function facingDot(yaw: number, source: RoomPoint, target: RoomPoint): number;
export function canSeeTarget(distance: number, unobstructed: boolean, lightOn: boolean, facing: number): boolean;
export function stereoPan(listener: RoomPoint, yaw: number, source: RoomPoint): number;
