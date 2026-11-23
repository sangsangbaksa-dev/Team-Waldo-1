/** ROOM TONE WebAudio session and spatial effect public contract. */
export class Sound {
  ctx: AudioContext | null;
  level: GainNode | null;
  paused: boolean;
  muted: boolean;
  clock: ReturnType<typeof setInterval> | null;
  powerQueue: Promise<void>;
  start(): Promise<void>;
  setMute(muted: boolean): void;
  pause(paused: boolean): void;
  syncPower(): void;
  startClock(): void;
  ready(): boolean;
  dispose(): void;
  ambience(chapter: number): void;
  threat(proximity: number): void;
  step(running: boolean, crouched: boolean): void;
  monsterStep(distance: number, pan?: number): void;
  notice(): void;
  tone(index: number): void;
  pickup(): void;
  success(): void;
  caught(): void;
}
