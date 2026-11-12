import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';
import { LevelUpScene } from './scenes/LevelUpScene';
import { ResultScene } from './scenes/ResultScene';

class ClassicStart extends Phaser.Scene {
  constructor() { super('Title'); }
  create(): void { this.scene.start('Game'); }
}
/** Keep the original Phaser survival mode independently loadable. */
export function startLegacy(parent: HTMLElement, onExit: () => void): void {
  parent.innerHTML = '<div id="classic-game"></div><button id="classic-exit" class="button secondary classic-exit">← 왕국 메뉴</button><div class="classic-label">CLASSIC SURVIVAL · WASD 이동 / 공격 자동 / ESC 정지</div>';
  parent.hidden = false;
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent: 'classic-game', width: GAME_WIDTH, height: GAME_HEIGHT,
    pixelArt: true, backgroundColor: '#1b2a1f',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, ClassicStart, GameScene, HudScene, LevelUpScene, ResultScene],
  });
  parent.querySelector<HTMLButtonElement>('#classic-exit')!.onclick = () => { game.destroy(true); onExit(); };
}
