export interface RoomPoint { x: number; z: number; }
export function lineClear(map: string[], tileSize: number, a: RoomPoint, b: RoomPoint): boolean;
export function soundTravelDistance(visible: boolean, directDistance: number, corridorSteps: number, tileSize: number): number;
