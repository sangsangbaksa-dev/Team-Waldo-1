export interface PerceptionInput { distance: number; visible: boolean; hidden: boolean; lightOn: boolean; running: boolean; crouched: boolean; moved: number; dt: number; grace: number }
export function perceive(input: PerceptionInput): { inSight: boolean; tracking: boolean };
