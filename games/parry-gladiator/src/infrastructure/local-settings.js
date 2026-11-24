import { sanitizeSettings } from '../application/settings.js';

export const STORAGE_KEY = 'parry-gladiator.settings.v1';
function browserStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}
export function readSettings(storage = browserStorage(), reducedMotion = prefersReducedMotion()) {
  let saved;
  try { saved = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}'); } catch { saved = null; }
  return sanitizeSettings(saved, reducedMotion);
}
export function saveSettings(settings, storage = browserStorage()) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Settings are optional. */ }
}
