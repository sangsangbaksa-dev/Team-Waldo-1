import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, '서바이벌 픽셀', { ...FONT, fontSize: '24px' }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, 'WASD 이동 · 공격은 자동\n\n클릭하거나 스페이스를 눌러 시작', { ...FONT, align: 'center' }).setOrigin(0.5);

    const start = () => this.scene.start('Game');
    this.input.once('pointerdown', start);
    this.input.keyboard?.once('keydown-SPACE', start);
  }
}
