import Phaser from 'phaser';
import { FONT } from '../config';
import type { SimEvent } from '../sim';

const MAX_NUMBERS_PER_FRAME = 12;
const MAX_PUFFS_PER_FRAME = 20;

/**
 * SimEvent를 받아 연출을 낸다: 데미지 숫자, 처치 효과, 화면 흔들림.
 * 오브젝트는 풀에서 꺼내 쓰고, 한 프레임에 너무 많이 뜨지 않게 수를 제한한다.
 */
export class EffectRenderer {
  private readonly numbers: Phaser.GameObjects.Text[] = [];
  private readonly puffs: Phaser.GameObjects.Image[] = [];
  private numbersThisFrame = 0;
  private puffsThisFrame = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  /** 매 프레임 시작에 호출해서 프레임당 제한을 초기화한다. */
  beginFrame(): void {
    this.numbersThisFrame = 0;
    this.puffsThisFrame = 0;
  }

  handle(e: SimEvent): void {
    switch (e.t) {
      case 'hit':
        this.damageNumber(e.x, e.y, e.dmg);
        break;
      case 'kill':
        this.puff(e.x, e.y);
        break;
      case 'playerHurt':
        this.scene.cameras.main.shake(80, 0.004);
        break;
      case 'bossSpawn':
        this.scene.cameras.main.flash(200, 255, 255, 255);
        break;
    }
  }

  private damageNumber(x: number, y: number, dmg: number): void {
    if (this.numbersThisFrame++ >= MAX_NUMBERS_PER_FRAME) return;
    const t = this.numbers.pop() ?? this.scene.add.text(0, 0, '', { ...FONT, fontSize: '8px' }).setOrigin(0.5).setDepth(10);
    t.setText(String(Math.round(dmg))).setPosition(x, y - 6).setAlpha(1).setVisible(true);
    this.scene.tweens.add({
      targets: t,
      y: y - 20,
      alpha: 0,
      duration: 450,
      onComplete: () => {
        t.setVisible(false);
        this.numbers.push(t);
      },
    });
  }

  private puff(x: number, y: number): void {
    if (this.puffsThisFrame++ >= MAX_PUFFS_PER_FRAME) return;
    const s = this.puffs.pop() ?? this.scene.add.image(0, 0, 'circle').setDepth(5);
    s.setPosition(x, y).setDisplaySize(6, 6).setAlpha(0.8).setVisible(true);
    this.scene.tweens.add({
      targets: s,
      displayWidth: 22,
      displayHeight: 22,
      alpha: 0,
      duration: 220,
      onComplete: () => {
        s.setVisible(false);
        this.puffs.push(s);
      },
    });
  }
}
