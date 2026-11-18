import { WEAPONS, type WeaponId, type WeaponDef } from './config';

export type PartSlot = 'optic' | 'muzzle' | 'grip' | 'magazine';
export type PartId = 'redDot' | 'scope4' | 'compensator' | 'suppressor' | 'verticalGrip' | 'angledGrip' | 'extendedMag' | 'quickMag';
export type Loadout = Partial<Record<PartSlot, PartId>>;
export interface PartDef { slot: PartSlot; name: string; code: string; detail: string; fits: readonly WeaponId[]; recoil?: number; spread?: number; reload?: number; capacity?: number; zoom?: number; noise?: number }
const all: WeaponId[] = ['pistol', 'smg', 'rifle', 'shotgun', 'sniper'];
const long: WeaponId[] = ['smg', 'rifle', 'shotgun', 'sniper'];
export const SLOT_NAMES: Record<PartSlot, string> = { optic: '조준경', muzzle: '총구', grip: '손잡이', magazine: '탄창' };
export const PARTS: Record<PartId, PartDef> = {
  redDot: { slot: 'optic', name: '레드 도트', code: 'RD–01', detail: '1.4배 조준 · 조준 사격 탄퍼짐 −12%', fits: all, spread: 0.88, zoom: 1.4 },
  scope4: { slot: 'optic', name: '4배율 스코프', code: 'SC–04', detail: '4배 조준 · 조준 사격 탄퍼짐 −30%', fits: ['rifle', 'sniper'], spread: 0.7, zoom: 4 },
  compensator: { slot: 'muzzle', name: '컴펜세이터', code: 'MB–02', detail: '반동 −24%', fits: all, recoil: 0.76 },
  suppressor: { slot: 'muzzle', name: '소음기', code: 'SD–09', detail: '총성 감지 거리 −60% · 반동 −8%', fits: ['pistol', 'smg', 'rifle', 'sniper'], recoil: 0.92, noise: 0.4 },
  verticalGrip: { slot: 'grip', name: '수직 손잡이', code: 'VG–03', detail: '반동 −18%', fits: long, recoil: 0.82 },
  angledGrip: { slot: 'grip', name: '앵글 손잡이', code: 'AG–05', detail: '탄퍼짐 −16% · 반동 −8%', fits: ['smg', 'rifle'], recoil: 0.92, spread: 0.84 },
  extendedMag: { slot: 'magazine', name: '확장 탄창', code: 'EX–40', detail: '장탄수 +40% · 장전 시간 +10%', fits: all, capacity: 1.4, reload: 1.1 },
  quickMag: { slot: 'magazine', name: '퀵드로 탄창', code: 'QD–20', detail: '장전 시간 −22%', fits: all, reload: 0.78 },
};
export const PART_IDS = Object.keys(PARTS) as PartId[];
export const SLOTS = Object.keys(SLOT_NAMES) as PartSlot[];
export interface ModularGun { id: WeaponId; mag: number; reserve: number; parts?: Loadout }
export function compatible(id: WeaponId, part: PartId): boolean { return PARTS[part]?.fits.includes(id) ?? false; }
export function cleanLoadout(id: WeaponId, value: unknown): Loadout {
  const out: Loadout = {};
  if (!value || typeof value !== 'object') return out;
  for (const slot of SLOTS) { const part = (value as Record<string, unknown>)[slot]; if (typeof part === 'string' && Object.hasOwn(PARTS, part) && PARTS[part as PartId].slot === slot && compatible(id, part as PartId)) out[slot] = part as PartId; }
  return out;
}
export function gunStats(gun: Pick<ModularGun, 'id' | 'parts'>): WeaponDef & { zoom: number; noise: number; adsSpread: number } {
  const base = WEAPONS[gun.id], out = { ...base, zoom: gun.id === 'sniper' ? 3.4 : gun.id === 'rifle' ? 1.5 : 1.3, noise: 1, adsSpread: 1 };
  for (const part of Object.values(cleanLoadout(gun.id, gun.parts))) {
    const d = PARTS[part]; out.recoil *= d.recoil ?? 1;
    if (d.slot === 'optic') out.adsSpread *= d.spread ?? 1; else out.spread *= d.spread ?? 1;
    out.reload *= d.reload ?? 1; out.mag = Math.ceil(out.mag * (d.capacity ?? 1)); if (d.zoom) out.zoom = d.zoom; out.noise *= d.noise ?? 1;
  }
  return out;
}
/** 장착은 기존 파츠를 가방에 반환하고, 초과 탄약은 예비탄으로 돌려줍니다. */
export function fitPart(gun: ModularGun, bag: PartId[], slot: PartSlot, part: PartId | null): boolean {
  if (!part && bag.length >= 16) return false;
  if (!SLOTS.includes(slot) || (part && (!Object.hasOwn(PARTS, part) || !compatible(gun.id, part) || PARTS[part].slot !== slot || !bag.includes(part)))) return false;
  gun.parts = cleanLoadout(gun.id, gun.parts);
  const old = gun.parts[slot]; if (part === old || (!part && !old)) return false;
  if (part) bag.splice(bag.indexOf(part), 1);
  if (old) bag.push(old);
  if (part) gun.parts[slot] = part; else delete gun.parts[slot];
  const overflow = Math.max(0, gun.mag - gunStats(gun).mag); gun.mag -= overflow; gun.reserve += overflow;
  return true;
}
