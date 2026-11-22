export interface Level {
  map: string[]; w: number; start: number; station: number;
  items: number[]; exit: number; nest: number; reachable: number[];
}
export interface PathTree { prev: Int32Array; dist: Int32Array; q: number[] }
export function walkable(map: string[], id: number): boolean;
export function neighbors(map: string[], id: number): number[];
export function paths(map: string[], start: number): PathTree;
export function routeFrom(tree: PathTree, start: number, goal: number): number[];
export function route(map: string[], start: number, goal: number): number[];
export function makeLevel(chapter: number): Level;
export const chapters: {
  title: string; location: string; item: string; station: string;
  goal: string; story: string; names: string[]; labels: string[];
  kind: string; size: number;
}[];
