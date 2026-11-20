/** Fixed, bounded architectural profiles. Values in city world units. */
export interface FacadeFin { at: number; width: number; depth: number; shade: number }
export function facadeFins(length: number, height: number, style: number, quality: 'low' | 'standard' | 'high'): FacadeFin[] {
  if (quality === 'low' || length < 72 || height < 85 || style === 3) return [];
  const count = Math.min(5, Math.max(1, Math.floor(length / (quality === 'high' ? 64 : 96)) - 1));
  const width = style === 2 ? 4.2 : style === 1 ? 2 : 3;
  return Array.from({length:count},(_,i)=>({at:length*(i+1)/(count+1),width,depth:style===2?5:2.5,shade:style===1?0.52:0.18}));
}
