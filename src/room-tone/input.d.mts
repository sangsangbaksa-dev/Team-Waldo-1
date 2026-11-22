export interface PointerOwner { claim(id:number):boolean; owns(id:number):boolean; release(id:number):boolean; clear():void }
export function createPointerOwner():PointerOwner;
export function tryCapture(element:{setPointerCapture(id:number):void},id:number):boolean;
