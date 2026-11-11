import Phaser from 'phaser';
import type { SimEvent } from '../sim';

/** SimEvent를 받아 연출을 낸다. 지금은 피격 시 화면 흔들림만 있고, 파티클과 데미지 숫자는 여기에 추가한다. */
export class EffectRenderer {
  constructor(private readonly scene: Phaser.Scene) {}

  handle(e: SimEvent): void {
    switch (e.t) {
      case 'playerHurt':
        this.scene.cameras.main.shake(80, 0.004);
        break;
      case 'bossSpawn':
        this.scene.cameras.main.flash(200, 255, 255, 255);
        break;
      // TODO(화면 담당): hit → 데미지 숫자, kill → 파티클
    }
  }
}
