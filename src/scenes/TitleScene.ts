import Phaser from 'phaser';
import { FONT, GAME_WIDTH } from '../config';
import { openWar } from '../battle/view';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }
  create(): void {
    this.add.text(GAME_WIDTH / 2, 55, '왕국 전쟁 · 3D', { ...FONT, fontSize: '24px' }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 92, '경제를 성장시키고 3개 AI 왕국을 정복하세요', { ...FONT }).setOrigin(0.5);
    const startWar = () => { this.scene.pause(); openWar(() => this.scene.resume()); };
    const button = (y: number, label: string, action: () => void) => {
      this.add.rectangle(GAME_WIDTH / 2, y, 250, 36, 0x253d31).setStrokeStyle(1, 0x5eead4).setInteractive({ useHandCursor: true }).on('pointerdown', action);
      this.add.text(GAME_WIDTH / 2, y, label, { ...FONT, fontSize: '12px' }).setOrigin(0.5);
    };
    button(145, '⚔ 3D 왕국 전쟁 시작', startWar);
    button(195, '기존 서바이벌 모드', () => this.scene.start('Game'));
    this.input.keyboard?.on('keydown-SPACE', startWar);
  }
}
