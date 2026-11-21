// ZERO ZONE 아이콘: 파츠·장비를 단색 도형이 아니라 윤곽·명암이 있는 SVG 그림으로 그립니다(파일 없음). 배틀로열 인벤토리 느낌의 슬롯 아이콘용.
import type { PartId, PartSlot } from './config';

const defs = `<defs><linearGradient id="zi-m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9edf2"/><stop offset=".55" stop-color="#a3adb9"/><stop offset="1" stop-color="#626d79"/></linearGradient><linearGradient id="zi-d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#58606b"/><stop offset="1" stop-color="#2a3038"/></linearGradient><linearGradient id="zi-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd98a"/><stop offset="1" stop-color="#d28a1f"/></linearGradient></defs>`;
const S = 'stroke="#0c0f13" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';
const M = `fill="url(#zi-m)" ${S}`, D = `fill="url(#zi-d)" ${S}`, A = `fill="url(#zi-a)" ${S}`;
const wrap = (body: string, vb = '0 0 64 40'): string => `<svg class="zi" viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
/** 화면에 한 번만 넣는 그라데이션 정의(아이콘들이 id 로 참조합니다). */
export const ICON_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${defs}</svg>`;

const SIGHT: Record<string, string> = {
  reddot: `<rect x="10" y="30" width="44" height="6" rx="2" ${D}/><path d="M14 30V14a4 4 0 0 1 4-4h28a4 4 0 0 1 4 4v16z" fill="#1a2028" ${S}/><path d="M18 14h28v16H18z" fill="#7fb0d044"/><circle cx="32" cy="22" r="3" fill="#ff4d4d"/><circle cx="32" cy="22" r="6" fill="#ff4d4d33"/>`,
  holo: `<rect x="8" y="31" width="48" height="5" rx="2" ${D}/><rect x="10" y="8" width="44" height="23" rx="5" fill="#1a2028" ${S}/><rect x="14" y="12" width="36" height="15" rx="3" fill="#8fd6ff30"/><circle cx="32" cy="19.5" r="5.5" fill="none" stroke="#ff4d4d" stroke-width="1.6"/><circle cx="32" cy="19.5" r="1.4" fill="#ff4d4d"/>`,
  scope2: `<rect x="14" y="32" width="36" height="4" rx="2" ${D}/><rect x="12" y="12" width="40" height="17" rx="8" ${M}/><circle cx="12" cy="20.5" r="8.5" ${D}/><circle cx="12" cy="20.5" r="4" fill="#5aa8e0"/><circle cx="52" cy="20.5" r="6.5" ${D}/><rect x="30" y="8" width="5" height="5" rx="1" ${D}/>`,
  scope4: `<rect x="10" y="33" width="44" height="4" rx="2" ${D}/><rect x="8" y="11" width="48" height="19" rx="9" ${M}/><circle cx="8" cy="20.5" r="9.5" ${D}/><circle cx="8" cy="20.5" r="5" fill="#5aa8e0"/><circle cx="56" cy="20.5" r="7" ${D}/><rect x="26" y="6" width="6" height="6" rx="1.5" ${D}/><rect x="40" y="6" width="6" height="6" rx="1.5" ${D}/>`,
  scope8: `<rect x="6" y="34" width="52" height="4" rx="2" ${D}/><rect x="4" y="10" width="56" height="21" rx="10" ${M}/><circle cx="6" cy="20.5" r="10.5" ${D}/><circle cx="6" cy="20.5" r="6" fill="#5aa8e0"/><circle cx="60" cy="20.5" r="7.5" ${D}/><rect x="24" y="4" width="7" height="7" rx="1.5" ${D}/><rect x="40" y="4" width="7" height="7" rx="1.5" ${D}/><path d="M14 11v19M50 11v19" stroke="#0c0f13" stroke-width="1.6"/>`,
};
const MUZZLE: Record<string, string> = {
  suppressor: `<rect x="6" y="12" width="52" height="16" rx="6" ${M}/><path d="M16 12v16M26 12v16M36 12v16M46 12v16" stroke="#0c0f13" stroke-width="1.6"/><rect x="2" y="16" width="8" height="8" rx="2" ${D}/>`,
  comp: `<rect x="14" y="10" width="38" height="20" rx="5" ${M}/><path d="M24 10v20M32 10v20M40 10v20" stroke="#0c0f13" stroke-width="3"/><rect x="6" y="15" width="10" height="10" rx="2" ${D}/>`,
  flash: `<path d="M12 14h12l12-5 8 3v16l-8 3-12-5H12z" ${M}/><path d="M36 9v22M44 12v16" stroke="#0c0f13" stroke-width="1.6"/><rect x="4" y="16" width="10" height="8" rx="2" ${D}/>`,
};
const GRIP: Record<string, string> = {
  grip: `<rect x="22" y="4" width="20" height="8" rx="2" ${D}/><path d="M25 12h14l-2 24a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3z" ${M}/><path d="M27 18h10M27 24h10M27 30h10" stroke="#0c0f13" stroke-width="1.8"/>`,
  angled: `<rect x="12" y="6" width="26" height="8" rx="2" ${D}/><path d="M30 12l12 0 8 22a3 3 0 0 1-2 4l-4 1a3 3 0 0 1-3-2z" ${M}/><path d="M38 20l8 0M41 27l8 0" stroke="#0c0f13" stroke-width="1.8"/>`,
};
const MAG = (long: number, quick: boolean): string => `<path d="M20 4h22v${long - 4}l-6 6h-18z" ${M}/><path d="M23 4v${long - 4}" stroke="#0c0f13" stroke-width="1.4"/><rect x="18" y="2" width="26" height="5" rx="1.5" ${D}/>${quick ? `<path d="M42 ${long - 8}l8 4-8 4z" ${A}/>` : ''}<circle cx="31" cy="${Math.round(long / 2)}" r="2.2" fill="#d28a1f"/>`;
const STOCK: Record<string, string> = {
  std: `<path d="M8 10h48v8l-8 4v14H20L8 22z" ${M}/><path d="M14 16h30" stroke="#0c0f13" stroke-width="1.5"/>`,
  tactical: `<path d="M8 8h48v6H22l-8 8v14H8z" ${M}/><path d="M24 20h28v6H30l-6 6z" ${D}/><rect x="8" y="30" width="10" height="8" rx="2" ${D}/>`,
  cheek: `<path d="M8 12h48v6l-6 4v14H20L8 22z" ${M}/><path d="M24 12h22l-2-6H26z" ${A}/><path d="M14 18h30" stroke="#0c0f13" stroke-width="1.5"/>`,
};

/** 슬롯에 끼워진 파츠(또는 슬롯 안내)를 그린 SVG. part 가 없으면 빈 슬롯의 윤곽 아이콘. */
export function partIcon(slot: PartSlot, part?: PartId | null): string {
  switch (slot) {
    case 'sight': return wrap(SIGHT[part ?? 'scope2'] ?? SIGHT.scope2!);
    case 'muzzle': return wrap(MUZZLE[part ?? 'suppressor'] ?? MUZZLE.suppressor!);
    case 'grip': return wrap(GRIP[part ?? 'grip'] ?? GRIP.grip!);
    case 'mag': return wrap(MAG(part === 'extmag' || part === 'extquick' ? 38 : 30, part === 'quickmag' || part === 'extquick'));
    case 'stock': return wrap(STOCK[part ?? 'std'] ?? STOCK.std!);
  }
}

export const gearIcon = {
  helmet: (lv: number): string => wrap(`<path d="M8 28C8 14 18 6 32 6s24 8 24 22v4H8z" fill="url(#${lv ? 'zi-m' : 'zi-d'})" ${S}/><path d="M8 28h48M20 12c4-3 8-4 12-4" stroke="#0c0f13" stroke-width="1.6" fill="none"/><rect x="12" y="30" width="40" height="5" rx="2" ${D}/>${lv ? `<text x="32" y="25" text-anchor="middle" font-size="12" font-weight="800" fill="#0c0f13">${lv}</text>` : ''}`),
  vest: (lv: number): string => wrap(`<path d="M16 6l8 4h16l8-4 8 8-6 8v16H14V22l-6-8z" fill="url(#${lv ? 'zi-m' : 'zi-d'})" ${S}/><path d="M24 10l8 8 8-8M32 18v22" stroke="#0c0f13" stroke-width="1.6" fill="none"/>${lv ? `<text x="32" y="33" text-anchor="middle" font-size="11" font-weight="800" fill="#0c0f13">${lv}</text>` : ''}`),
  bandage: (): string => wrap(`<rect x="8" y="12" width="48" height="18" rx="9" fill="#f2f4f6" ${S}/><rect x="22" y="12" width="20" height="18" fill="#dfe4e9" ${S}/><path d="M32 16v10M27 21h10" stroke="#d6454f" stroke-width="3" stroke-linecap="round"/>`),
  medkit: (): string => wrap(`<rect x="8" y="12" width="48" height="26" rx="5" fill="#e9eef2" ${S}/><path d="M24 12V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v4" fill="none" ${S}/><path d="M32 18v14M25 25h14" stroke="#d6454f" stroke-width="4.5" stroke-linecap="round"/>`),
};
