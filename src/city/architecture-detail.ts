/** Fixed, bounded architectural profiles. Values in city world units. */
export interface FacadeFin { at: number; width: number; depth: number; shade: number }
export function facadeFins(length: number, height: number, style: number, quality: 'low' | 'standard' | 'high'): FacadeFin[] {
  if (quality === 'low' || length < 72 || height < 85 || style === 3) return [];
  const count = Math.min(5, Math.max(1, Math.floor(length / (quality === 'high' ? 64 : 96)) - 1));
  const width = style === 2 ? 4.2 : style === 1 ? 2 : 3;
  return Array.from({length:count},(_,i)=>({at:length*(i+1)/(count+1),width,depth:style===2?5:2.5,shade:style===1?0.52:0.18}));
}

/** Keep landmark architecture recognizable independent of procedural seeds. */
export function facadeStyle(kind: string | undefined, sign: string | undefined, height: number, random: number): number {
  if (kind === 'bank' || kind === 'casino') return 2; // masonry / art deco
  if (kind === 'plant' || kind === 'gunshop' || sign === 'ARMY' || height < 0.1) return 3;
  if (kind === 'club') return 4;
  if (kind === 'store') return 0;
  if (sign === 'POLICE') return 4;
  return Math.min(4, Math.max(0, Math.floor(random * 5)));
}

/** Three-by-three block chunks for culling; low quality uses larger batches. */
export function architectureChunk(x:number,z:number,pitch:number,quality:'low'|'standard'|'high'):string{
  const span=pitch*(quality==='low'?5:3);
  return `${Math.floor(x/span)}:${Math.floor(z/span)}`;
}
