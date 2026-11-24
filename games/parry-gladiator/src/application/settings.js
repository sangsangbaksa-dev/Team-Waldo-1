export function defaultSettings(reducedMotion = false) {
  return { volume: 0.55, muted: false, motion: reducedMotion ? 'reduced' : 'full', quality: 'auto', difficulty: 'gladiator', server: '' };
}

export function sanitizeSettings(saved, reducedMotion = false) {
  const result = defaultSettings(reducedMotion);
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return result;
  if (Number.isFinite(saved.volume)) result.volume = Math.max(0, Math.min(1, saved.volume));
  if (typeof saved.muted === 'boolean') result.muted = saved.muted;
  if (['full', 'reduced'].includes(saved.motion)) result.motion = saved.motion;
  if (['auto', 'high', 'low'].includes(saved.quality)) result.quality = saved.quality;
  if (['squire', 'gladiator', 'champion'].includes(saved.difficulty)) result.difficulty = saved.difficulty;
  if (typeof saved.server === 'string') result.server = saved.server;
  return result;
}
