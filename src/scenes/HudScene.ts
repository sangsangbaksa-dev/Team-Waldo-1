import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../config';
import type { World } from '../sim';

/** GameScene 위에 겹쳐 그리는 UI. world를 읽기만 한다. */
export class HudScene extends Phaser.Scene {
  private world!: Readonly<World>;
  private bars!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private timer!: Phaser.GameObjects.Text;
  private paused!: Phaser.GameObjects.Text;

  constructor() {
    super('Hud');
  }

  init(data: { world: World }): void {
    this.world = data.world;
  }

  create(): void {
    this.bars = this.add.graphics();
    this.info = this.add.text(6, 16, '', FONT);
    this.timer = this.add.text(GAME_WIDTH / 2, 10, '', { ...FONT, fontSize: '12px' }).setOrigin(0.5, 0);
    this.paused = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '일시정지 (ESC)', { ...FONT, fontSize: '16px' }).setOrigin(0.5);
  }

  update(): void {
    const w = this.world;
    const p = w.player;
    const g = this.bars;
    g.clear();
    // 경험치 바 (화면 위쪽 전체)
    g.fillStyle(0x000000, 0.6).fillRect(0, 0, GAME_WIDTH, 5);
    g.fillStyle(0x40e0ff).fillRect(0, 0, GAME_WIDTH * Math.min(1, p.xp / p.xpToNext), 5);
    // 체력 바
    g.fillStyle(0x000000, 0.6).fillRect(6, 8, 80, 6);
    g.fillStyle(0xe04848).fillRect(6, 8, 80 * Math.max(0, p.hp / p.stats.maxHp), 6);

    const stages = w.data.stages.stages.length;
    this.info.setText(`Lv ${p.level}   처치 ${w.stats.kills}   구간 ${w.stage.index + 1}/${stages}${w.stage.bossSpawned ? ' 보스' : ''}`);
    const t = Math.floor(w.time);
    this.timer.setText(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
    this.paused.setVisible(w.paused);
  }
}
