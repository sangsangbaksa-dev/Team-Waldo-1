export interface Chapter {
  title:string; location:string; item:string; station:string; goal:string; story:string;
  names:string[]; labels:string[]; kind:string; size:number;
}
export const chapters: Chapter[];
export interface Level { map:string[]; w:number; start:number; station:number; items:number[]; exit:number; nest:number; reachable:number[] }
export interface PathTree { prev:Int32Array; dist:Int32Array; q:number[] }
export interface CampaignSave { v:1; ch:number; found:boolean[]; solved:boolean; seen:number[]; elapsed:number }
export interface Position { x:number; z:number }
export function makeLevel(ch:number):Level;
export function walkable(map:string[],id:number):boolean;
export function neighbors(map:string[],id:number):number[];
export function paths(map:string[],start:number):PathTree;
export function routeFrom(tree:PathTree,a:number,b:number):number[];
export function route(map:string[],a:number,b:number):number[];
export function lineOpen(map:string[],a:Position,b:Position,tile:number):boolean;
export function normalizeSave(s:unknown):CampaignSave|null;
export function puzzleOptions(ch:number,index:number):string[];
export function puzzleAnswer(ch:number):number[];
export function puzzleCorrect(ch:number,choices:number[]):boolean;
