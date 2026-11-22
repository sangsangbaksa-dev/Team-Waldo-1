import { BUILDINGS, UNITS, type BuildKind, type UnitKind } from './config';

// Hand-drawn 24x24 line icons for the HUD; strokes follow the button's text colour.
const P: Record<string, string> = {
  worker: '<path d="M6 20l8-8"/><path d="M12 6a5 5 0 0 1 7 7l-3-1-3-3z"/><circle cx="7" cy="7" r="2.5"/>',
  marine: '<circle cx="12" cy="6" r="3"/><path d="M7 21v-6l2-5h6l2 5v6"/><path d="M15 12l6-2"/>',
  rocket: '<path d="M4 16l12-8 3 3-12 8z"/><path d="M16 8l3-3 1 1-3 3"/><path d="M6 19l-2 2"/>',
  tank: '<rect x="3" y="12" width="18" height="6" rx="3"/><path d="M8 12V9h7v3"/><path d="M15 10h6"/><circle cx="7" cy="15" r="1"/><circle cx="12" cy="15" r="1"/><circle cx="17" cy="15" r="1"/>',
  jeep: '<path d="M3 15h18v-3l-3-1-2-4H8l-2 4-3 1z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  medic: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>',
  engineer: '<path d="M14 4a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3z"/><path d="M5 19l2-2"/>',
  hq: '<path d="M3 20h18"/><path d="M5 20V10l7-5 7 5v10"/><path d="M10 20v-5h4v5"/><path d="M12 5V2l3 1-3 1"/>',
  depot: '<path d="M4 9l8-5 8 5v11H4z"/><path d="M8 20v-7h8v7M8 16h8"/>',
  barracks: '<path d="M3 20h18M4 20V8h16v12"/><path d="M4 8l8-4 8 4"/><path d="M9 20v-6h6v6"/>',
  factory: '<path d="M3 20V11l5 3v-3l5 3v-3l5 3V4h3v16z"/>',
  tower: '<path d="M8 21l1-12h6l1 12z"/><path d="M7 9V5h2v2h2V5h2v2h2V5h2v4z"/>',
  move: '<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  stop: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M8 12h8"/>',
  attack: '<path d="M4 20L18 6"/><path d="M14 4l6 6-2 2-6-6z"/><path d="M6 14l4 4"/>',
  build: '<path d="M3 21h18"/><path d="M6 21V11h12v10"/><path d="M14 4l6 6-3 1-4-4z"/>',
  back: '<path d="M10 6l-6 6 6 6"/><path d="M4 12h11a5 5 0 0 1 5 5v2"/>',
  auto: '<path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5z"/>',
  power: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
};

let icId = 0;
/** Filled icons get a painted look: a light-to-dark gradient body, a bright rim stroke and a dark under-stroke for depth. */
const svg = (d: string, fill = false): string => {
  if (!fill) return `<svg class="rt-ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const id = `rtg${icId++}`;
  return `<svg class="rt-ic" viewBox="0 0 24 24" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".75"/><stop offset=".55" stop-color="currentColor" stop-opacity=".3"/><stop offset="1" stop-color="currentColor" stop-opacity=".1"/></linearGradient></defs><g fill="none" stroke="#000" stroke-opacity=".45" stroke-width="2.6" transform="translate(.5 .7)">${d}</g><g fill="url(#${id})" stroke="currentColor" stroke-width="1.7">${d}</g></svg>`;
};

export const unitIcon = (k: UnitKind): string => svg(P[k], true);
export const buildingIcon = (k: BuildKind): string => svg(P[k], true);

const byKey: Record<string, string> = { M: 'move', S: 'stop', A: 'attack', B: 'build', ESCAPE: 'back', ENTER: 'auto' };

/** Picks an icon from the button label (unit/building name) or its hotkey; abilities fall back to a bolt. */
export function buttonIcon(label: string, key: string): string {
  for (const k of Object.keys(UNITS) as UnitKind[]) if (label.includes(UNITS[k].name)) return unitIcon(k);
  for (const k of Object.keys(BUILDINGS) as BuildKind[]) if (label.includes(BUILDINGS[k].name)) return buildingIcon(k);
  return svg(P[byKey[key]] ?? P.power);
}
