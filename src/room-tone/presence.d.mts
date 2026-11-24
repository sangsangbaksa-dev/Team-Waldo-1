export function threatLabel(threat: number): string;
export function threatLevel(threat: number): "near" | "close" | "calm";
export function breathLabel(hidden: boolean, winded: boolean, running: boolean): string;
export function meterScale(value: number): string;
