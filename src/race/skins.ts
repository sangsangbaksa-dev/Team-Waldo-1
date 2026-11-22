/** Compact race cosmetics table, independent from maps and driving physics. */
export interface SkinDef { id: string; name: string; color: string; accent: string; cost: number }
export const SKINS: ReadonlyArray<SkinDef> = [
  { id: 'stock', name: '기본', color: '', accent: '', cost: 0 },
  { id: 'night', name: '나이트 블랙', color: '#15171d', accent: '#ff3b5c', cost: 220 },
  { id: 'pearl', name: '펄 화이트', color: '#f1f3f6', accent: '#2e7dff', cost: 220 },
  { id: 'sunset', name: '선셋 오렌지', color: '#ff6a2b', accent: '#2a1038', cost: 320 },
  { id: 'neon', name: '네온 라임', color: '#9cff2e', accent: '#1b1d22', cost: 320 },
  { id: 'royal', name: '로열 퍼플', color: '#6a35d9', accent: '#f2c230', cost: 420 },
  { id: 'gold', name: '골드 러시', color: '#d9a62e', accent: '#15171d', cost: 600 },
];
export const skinById = (id: string): SkinDef => SKINS.find(s => s.id === id) ?? SKINS[0];
