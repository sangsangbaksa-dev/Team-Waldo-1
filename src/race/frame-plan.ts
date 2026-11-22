// Keep the 90Hz simulation clock consistent at ordinary low display FPS.
// Cap catch-up at 200ms so a suspended tab cannot spiral into long stalls.
export const STEP = 1 / 90;
export const MAX_FRAME_SECONDS = 0.2;
export function framePlan(remainder: number, elapsed: number): { steps: number; remainder: number } {
  const prev = Number.isFinite(remainder) ? Math.max(0, Math.min(STEP, remainder)) : 0;
  const dt = Number.isFinite(elapsed) ? Math.max(0, Math.min(MAX_FRAME_SECONDS, elapsed)) : 0;
  const total = prev + dt;
  const steps = Math.min(18, Math.floor((total + 1e-10) / STEP));
  return { steps, remainder: Math.max(0, Math.min(STEP, total - steps * STEP)) };
}

/** Nicknames are user content, never markup. */
export function escapeRaceText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Build a raw heading; the modal renderer handles HTML escaping exactly once. */
export const raceDuelHeading=(map:string,laps:number,nickname:string):string=>`${map} · ${laps}랩 · vs ${nickname}`;
