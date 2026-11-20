export function canLock(touchMode:boolean,kind:string,explicit:boolean):boolean;
export function wrapAngle(angle:number):number;
export function capturePointer(el:{setPointerCapture(id:number):void},id:number):boolean;
export function canSaveState(state:string):boolean;
export function motionState(enabled:boolean,osReduce:boolean):"normal"|"reduced";
export function stepRemainder(distance:number,span:number):number;
