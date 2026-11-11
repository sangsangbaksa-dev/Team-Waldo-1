import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import type { UpgradeChoice } from '../sim';

interface LevelUpData {
  level: number;
  choices: UpgradeChoice[];
  onChoose: (index: number) => void;
}

const KIND_LABEL: Record<UpgradeChoice['kind'], string> = { weapon: '무기', passive: '패시브', heal: '회복' };

/** 레벨업 3지선다 오버레이. 클릭하거나 숫자 키 1~3으로 고른다. */
export class LevelUpScene extends Phaser.Scene {
  constructor() {
    super('LevelUp');
  }

  create(data: LevelUpData): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setOrigin(0);
    this.add.text(GAME_WIDTH / 2, 40, `레벨 ${data.level}! 하나를 고르세요`, { ...FONT, fontSize: '14px' }).setOrigin(0.5);

    let chosen = false;
    const choose = (i: number) => {
      if (chosen || i >= data.choices.length) return;
      chosen = true;
      data.onChoose(i);
      this.scene.stop();
    };

    const w = 130;
    const gap = 12;
    const total = data.choices.length * w + (data.choices.length - 1) * gap;
    data.choices.forEach((c, i) => {
      const x = (GAME_WIDTH - total) / 2 + i * (w + gap);
      const card = this.add.rectangle(x, 80, w, 110, 0x2a3a5a).setOrigin(0).setStrokeStyle(1, 0x8090c0);
      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => card.setFillStyle(0x3a4f7a));
      card.on('pointerout', () => card.setFillStyle(0x2a3a5a));
      card.on('pointerdown', () => choose(i));

      const sub = c.kind === 'heal' ? '체력 30% 회복' : c.isNew ? '새로 획득' : `Lv ${c.level - 1} → ${c.level}`;
      this.add.text(x + w / 2, 96, `[${i + 1}] ${KIND_LABEL[c.kind]}`, { ...FONT, color: '#a0b0d0' }).setOrigin(0.5);
      this.add.text(x + w / 2, 128, c.name, { ...FONT, fontSize: '14px' }).setOrigin(0.5);
      this.add.text(x + w / 2, 160, sub, { ...FONT, color: '#ffe080' }).setOrigin(0.5);
    });

    ['ONE', 'TWO', 'THREE'].forEach((key, i) => this.input.keyboard?.on(`keydown-${key}`, () => choose(i)));
  }
}
