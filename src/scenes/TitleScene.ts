import Phaser from 'phaser';
import { FONT, GAME_WIDTH } from '../config';
import { openWar } from '../battle/view';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }
  create(): void {
    this.add.text(GAME_WIDTH / 2, 55, '서바이벌 픽셀', { ...FONT, fontSize: '24px' }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 92, '영지를 키우고 최후의 세력이 되세요', { ...FONT }).setOrigin(0.5);
    const startWar = () => { this.scene.pause(); openWar(() => this.scene.resume()); };
    const button = (y: number, label: string, action: () => void) => {
      this.add.rectangle(GAME_WIDTH / 2, y, 250, 36, 0x253d31).setStrokeStyle(1, 0x5eead4).setInteractive({ useHandCursor: true }).on('pointerdown', action);
      this.add.text(GAME_WIDTH / 2, y, label, { ...FONT, fontSize: '12px' }).setOrigin(0.5);
    };
    button(145, '3D 4인 경영 전쟁 (AI)', startWar);
    button(195, '기존 서바이벌', () => this.scene.start('Game'));
    this.input.keyboard?.on('keydown-SPACE', startWar);
  }
}
