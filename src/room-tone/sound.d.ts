/** Browser audio object: only the public session contract is exported. */
export class Sound {
  ctx: AudioContext | null;
  level: GainNode | null;
  paused: boolean;
  muted: boolean;
  clock: ReturnType<typeof setInterval> | null;
  pause(paused: boolean): void;
  startClock(): void;
  ready(): boolean;
  powerQueue: Promise<void>;
  syncPower(): void;
  dispose(): void;
}
