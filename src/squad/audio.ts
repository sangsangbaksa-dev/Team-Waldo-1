// SQUAD CLASH 효과음: 발진기/노이즈 합성만 씁니다(파일 없음). 전투 소리는 프레임당 개수를 제한해 배속에서도 시끄럽지 않게 합니다.
import { AudioEngine, burst, tone } from '../audio-core';
import type { Effect } from './sim';
export class SquadAudio {
  private eng = new AudioEngine();
  private lastBattle = 0;
  get enabled(): boolean { return this.eng.enabled; }
  set enabled(on: boolean) { this.eng.setEnabled(on); }
  unlock(): void { this.eng.unlock(); }
  setPaused(on: boolean): void { this.eng.setPaused(on); }
  place(): void { tone(this.eng, 520, 0.07, 0.16, 'triangle', 120); }
  remove(): void { tone(this.eng, 360, 0.08, 0.14, 'triangle', -120); }
  deny(): void { tone(this.eng, 160, 0.14, 0.18, 'square', -50); }
  click(): void { tone(this.eng, 700, 0.05, 0.12, 'triangle'); }
  ready(): void { tone(this.eng, 440, 0.12, 0.16, 'triangle', 0); tone(this.eng, 660, 0.18, 0.16, 'triangle', 0, 0.1); }
  start(): void { burst(this.eng, 0.35, 0.12, 900, 0.7, 'highpass'); tone(this.eng, 220, 0.4, 0.18, 'sawtooth', 220); }
  win(): void { [523, 659, 784, 1047].forEach((f, i) => tone(this.eng, f, 0.45, 0.18, 'triangle', 0, i * 0.13)); }
  lose(): void { [392, 330, 262].forEach((f, i) => tone(this.eng, f, 0.5, 0.16, 'sawtooth', -40, i * 0.18)); }
  /** 이번 스텝에 새로 생긴 효과(age 0)만 넘기세요. 70ms 에 한 번, 종류별로 하나씩만 소리 냅니다. */
  battle(effects: Effect[], now: number): void {
    if (now - this.lastBattle < 70) return; let hit = false, heal = false, siege = false, death = false;
    for (const e of effects) { if (e.age !== 0) continue; if (e.kind === 'hit') hit = true; else if (e.kind === 'heal') heal = true; else if (e.kind === 'siege') siege = true; else death = true; }
    if (!(hit || heal || siege || death)) return; this.lastBattle = now;
    if (siege) burst(this.eng, 0.25, 0.2, 140, 0.8, 'lowpass');
    if (hit) tone(this.eng, 300 + Math.random() * 120, 0.05, 0.08, 'square', -80);
    if (heal) tone(this.eng, 880, 0.1, 0.07, 'sine', 160);
    if (death) tone(this.eng, 200, 0.16, 0.12, 'sawtooth', -90);
  }
  dispose(): void { this.eng.dispose(); }
}
