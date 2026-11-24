export class Sound {
  ctx: {
    state: string;
    currentTime: number;
    resume(): Promise<void>;
    suspend(): Promise<void>;
  } | null;
  level: { gain: { cancelScheduledValues(time: number): void; setTargetAtTime(value: number, time: number, constant: number): void } } | null;
  nextBeat: number;
  pause(paused: boolean): void;
}
