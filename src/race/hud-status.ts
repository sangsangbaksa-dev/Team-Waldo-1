// SPEED RUSH — stable HUD labels, independent of WebGL and DOM.
import { fmtTime } from '../records';

export type RaceHudMode =
  | { kind: 'online-duel'; opponent: string }
  | { kind: 'online-room'; players: number }
  | { kind: 'time-trial'; ghostTime: number | null; delta: number | null }
  | { kind: 'race'; bestLap: number };

export function raceHudSubtitle(mode: RaceHudMode): string {
  switch (mode.kind) {
    case 'online-duel': return `VS ${mode.opponent}`;
    case 'online-room': return `${mode.players}인 레이스`;
    case 'time-trial':
      if (mode.ghostTime === null) return '첫 기록 — 이 주행이 고스트가 됩니다';
      return mode.delta === null
        ? `GHOST ${fmtTime(mode.ghostTime)}`
        : `GHOST ${mode.delta >= 0 ? '+' : '-'}${Math.abs(mode.delta).toFixed(2)}`;
    case 'race': return Number.isFinite(mode.bestLap) ? `BEST ${fmtTime(mode.bestLap)}` : '';
  }
}
