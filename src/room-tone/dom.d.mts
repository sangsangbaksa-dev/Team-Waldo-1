export function createIdLookup(root: {getElementById(id:string):HTMLElement|null}):
  (id:string)=>HTMLElement|null;
