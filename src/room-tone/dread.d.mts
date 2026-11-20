import type { Level } from "./levels.mjs";
export interface Recording { title:string; text:string }
export interface Incident { kind:string; caption:string; duration:number }
export const recordings:Recording[][];
export function cleanArchive(value:unknown):number[];
export function archiveCells(level:Level):number[];
export const incidents:Incident[];
export function createDread(random?:()=>number,chapter?:number):{tick(dt:number,eligible:boolean):(Incident&{age:number;started:boolean})|null};
