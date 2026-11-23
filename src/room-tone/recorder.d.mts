export const RECORDER_LIMIT:number;
export interface Recorder { cell:number; age:number; pulses:number; }
export function recorderUses(value:unknown):number;
export function placementCell(map:string[], origin:number, yaw:number):number|null;
export function advanceRecorder(recorder:Recorder|null, dt:number):{recorder:Recorder|null; pulse:boolean};
export function recorderAudible(recorder:Recorder|null, corridorSteps:number|undefined):boolean;
