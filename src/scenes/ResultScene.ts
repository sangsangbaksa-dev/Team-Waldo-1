import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import type { RunStats } from '../sim';

const BEST_KEY = 'survival-pixel.best';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(data: { stats: RunStats }): void {
    const s = data.stats;
    let best = s.score;
    try {
      best = Math.max(s.score, Number(localStorage.getItem(BEST_KEY)) || 0);
      localStorage.setItem(BEST_KEY, String(best));
    } catch {
      // 저장소를 못 쓰는 환경에서는 최고 점수 없이 진행
    }

    const t = Math.floor(s.time);
    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 50, s.victory ? '클리어!' : '게임 오버', { ...FONT, fontSize: '24px', color: s.victory ? '#ffe080' : '#ff8080' }).setOrigin(0.5);
    this.add.text(cx, GAME_HEIGHT / 2 + 10, [
      `점수  ${s.score}`,
      `최고 점수  ${best}`,
      `처치  ${s.kills}`,
      `생존 시간  ${Math.floor(t / 60)}분 ${t % 60}초`,
      `레벨  ${s.level}`,
      '',
      '클릭하거나 스페이스를 눌러 다시 시작',
    ].join('\n'), { ...FONT, align: 'center', lineSpacing: 4 }).setOrigin(0.5);

    const restart = () => this.scene.start('Game');
    // 죽는 순간의 입력으로 바로 넘어가지 않도록 잠깐 기다린다
    this.time.delayedCall(500, () => {
      this.input.once('pointerdown', restart);
      this.input.keyboard?.once('keydown-SPACE', restart);
    });
  }
}
