import Phaser from 'phaser';
import { FONT, GAME_WIDTH } from '../config';
import { loadGameData } from '../data';

/** 데이터 검증과 플레이스홀더 텍스처 생성. 에셋 로딩도 여기에 추가한다. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    try {
      this.registry.set('data', loadGameData());
    } catch (e) {
      // 기획이 JSON을 잘못 고쳤을 때 어느 파일 어느 필드인지 화면에 보여준다
      this.add.text(8, 8, (e as Error).message, { ...FONT, color: '#ff8080', wordWrap: { width: GAME_WIDTH - 16 } });
      return;
    }

    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff).fillCircle(16, 16, 16);
    g.generateTexture('circle', 32, 32);
    g.clear();
    g.fillStyle(0x223526).fillRect(0, 0, 32, 32);
    g.lineStyle(1, 0x2c4532).strokeRect(0.5, 0.5, 32, 32);
    g.generateTexture('grid', 32, 32);
    g.destroy();

    this.scene.start('Title');
  }
}
