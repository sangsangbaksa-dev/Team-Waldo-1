import type { ActivityId, Sim, SlackEvent } from '../domain/contracts';
export function createSessionStats() {
  return { act: {} as Partial<Record<ActivityId, number>>, maxCombo: 1, maxSus: 0, warns: 0, reasons: [] as string[] };
}
export type SessionStats = ReturnType<typeof createSessionStats>;
export function advanceSession(sim: Sim, tally: SessionStats, dt: number): { elapsed: number; events: SlackEvent[] } {
  const before = sim.state.time, activity = sim.state.cover ? null : sim.state.activity;
  sim.update(dt);
  const elapsed = sim.state.time - before, events = sim.drain();
  for (const ev of events) {
    if (ev.t === 'strike') { tally.reasons.push(ev.reason); tally.maxSus = 100; }
    else if (ev.t === 'friend-warn') tally.warns++;
  }
  if (activity) tally.act[activity] = (tally.act[activity] ?? 0) + elapsed;
  tally.maxCombo = Math.max(tally.maxCombo, sim.state.combo);
  tally.maxSus = Math.max(tally.maxSus, sim.state.sus);
  return { elapsed, events };
}
