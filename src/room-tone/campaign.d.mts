export interface Campaign { v:1; ch:number; found:boolean[]; solved:boolean; elapsed:number; seen:number[] }
export function normalizeCampaign(value:unknown):Campaign|null;
