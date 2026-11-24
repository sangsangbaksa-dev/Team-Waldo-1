export interface CampaignStorage { read(key: string): unknown; write(key: string, value: unknown): void; remove(key: string): void }
export interface CampaignSnapshot { ch: number; found: boolean[]; solved: boolean; seen: Iterable<number>; elapsed: number }
export const SAVE: string;
export const LAST: string;
export const PREFS: string;
export function createCampaignStore(storage: CampaignStorage): {
  read(key: string): unknown;
  saved(): (Omit<CampaignSnapshot, 'seen'> & { v: number; seen: number[] }) | null;
  save(snapshot: CampaignSnapshot): void;
  complete(elapsed: number): void;
  writeMute(muted: boolean): void;
  write(key: string, value: unknown): void;
};
