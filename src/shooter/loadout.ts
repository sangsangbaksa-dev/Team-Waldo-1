// ZERO ZONE — 조립 화면에서 만든 총기 구성(무기별 파츠)을 브라우저에 저장합니다. 게임 본체를 불러오지 않고도 읽을 수 있게 가볍게 둡니다.
import { cleanLoadout, WEAPON_IDS, type Loadout, type WeaponId } from './config';

export const LOADOUT_KEY = 'waldo.shooter.loadout.v1';
export interface SavedLoadout { /** 경기에서 내 구성을 쓰는지 */ on: boolean; guns: Loadout; /** 마지막으로 보던 무기 */ last: WeaponId }
export const emptyLoadout = (): SavedLoadout => ({ on: true, guns: {}, last: 'rifle' });

export function readLoadout(): SavedLoadout {
  try {
    const r = JSON.parse(localStorage.getItem(LOADOUT_KEY) ?? '{}') as Record<string, unknown>;
    return { on: r.on !== false, guns: cleanLoadout(r.guns), last: (WEAPON_IDS as string[]).includes(r.last as string) ? (r.last as WeaponId) : 'rifle' };
  } catch { return emptyLoadout(); }
}
export function writeLoadout(l: SavedLoadout): void { try { localStorage.setItem(LOADOUT_KEY, JSON.stringify({ on: l.on, guns: cleanLoadout(l.guns), last: l.last })); } catch { /* 저장하지 못해도 계속할 수 있습니다. */ } }
/** 구성한 총이 몇 자루인지(빈 구성은 세지 않음) */
export const loadoutCount = (l: Loadout): number => WEAPON_IDS.filter(id => Object.keys(l[id] ?? {}).length > 0).length;
