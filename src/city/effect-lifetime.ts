/** In-place compaction for transient visual effects.
 * Keep the same backing array across thousands of animation frames to avoid
 * per-frame garbage collection pressure during battles. */
export function compactLiveEffects<T extends {life:number}>(items:T[]):number {
  let kept=0;
  for(let i=0;i<items.length;i++){
    const item=items[i];
    if(item.life>0)items[kept++]=item;
  }
  items.length=kept;
  return kept;
}
