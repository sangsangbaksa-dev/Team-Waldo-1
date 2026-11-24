export type HitRead = 'body' | 'head' | 'down';
export type ImpactKind = 'world' | 'body' | 'head';

export function hitRead(headshot: boolean, lethal: boolean): HitRead {
  if (headshot) return 'head';
  if (lethal) return 'down';
  return 'body';
}

export function hitPresentation(read: HitRead): { label: string; holdMs: number } {
  if (read === 'head') return { label: 'HEAD', holdMs: 820 };
  if (read === 'down') return { label: 'DOWN', holdMs: 820 };
  return { label: 'HIT', holdMs: 560 };
}

export interface ImpactLook { color: string; scale: number; life: number }

export function impactLook(kind: ImpactKind, causedByViewer: boolean): ImpactLook {
  if (kind === 'head' && causedByViewer) return { color: '#e6c48a', scale: 1.7, life: 0.46 };
  if (kind === 'body' && causedByViewer) return { color: '#d2b074', scale: 1.35, life: 0.38 };
  if (kind === 'body') return { color: '#b08960', scale: 1.05, life: 0.32 };
  return { color: '#8f8776', scale: 0.85, life: 0.22 };
}

export function healthLoss(before: number, after: number): number {
  return Math.max(0, Math.round(before - after));
}
