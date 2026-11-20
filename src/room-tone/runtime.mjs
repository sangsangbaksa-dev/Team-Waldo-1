export function canLock(touchMode,kind,explicit){return explicit&&!touchMode&&kind==="mouse";}

export function wrapAngle(angle){return Number.isFinite(angle)?Math.atan2(Math.sin(angle),Math.cos(angle)):0;}

export function capturePointer(el,id){try{el.setPointerCapture(id);return true;}catch{return false;}}

export function canSaveState(state){return ["play","exit","pause","help","archive","settings","station","puzzle","map","brief","lost"].includes(state);}

export function motionState(enabled,osReduce){return enabled&&!osReduce?"normal":"reduced";}

export function stepRemainder(distance,span){return distance>=span?distance%span:distance;}
