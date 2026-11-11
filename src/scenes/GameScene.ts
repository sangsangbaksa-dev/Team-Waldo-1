import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, hexToInt } from '../config';
import type { GameData } from '../data';
import { AudioBridge } from '../render/AudioBridge';
import { EffectRenderer } from '../render/EffectRenderer';
import { EntityRenderer } from '../render/EntityRenderer';
import { DT, createWorld, step, type Command, type SimEvent, type World } from '../sim';

const MAX_STEPS_PER_FRAME = 5;
const GEM_COLOR = 0x40e0ff;

/**
 * 틱 루프를 돌리는 씬. 입력을 Command로 바꿔 sim에 넘기고, sim 상태를 읽어 그린다.
 * 게임 규칙은 여기에 넣지 않는다.
 */
export class GameScene extends Phaser.Scene {
  private world!: World;
  private acc = 0;
  private speed = 1;
  private queued: Command[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private bg!: Phaser.GameObjects.TileSprite;
  private playerSprite!: Phaser.GameObjects.Image;
  private enemies!: EntityRenderer;
  private projectiles!: EntityRenderer;
  private pickups!: EntityRenderer;
  private effects!: EffectRenderer;
  private audio!: AudioBridge;

  constructor() {
    super('Game');
  }

  create(): void {
    const data = this.registry.get('data') as GameData;
    const params = new URLSearchParams(window.location.search);
    // ?seed=123 으로 같은 판을 재현하고, ?speed=10 으로 빨리 돌려 볼 수 있다
    const seed = Number(params.get('seed')) || (Date.now() & 0x7fffffff);
    this.speed = Math.max(1, Number(params.get('speed')) || 1);

    this.world = createWorld(data, seed);
    this.acc = 0;
    this.queued = [];

    this.bg = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'grid').setOrigin(0).setScrollFactor(0).setDepth(0);
    this.pickups = new EntityRenderer(this, 1, () => GEM_COLOR);
    this.enemies = new EntityRenderer(this, 2, (k) => hexToInt(data.enemies[k].placeholderColor));
    this.projectiles = new EntityRenderer(this, 4, (k) => hexToInt(data.weapons[k].placeholderColor));
    const r = data.balance.player.radius;
    this.playerSprite = this.add.image(0, 0, 'circle').setDisplaySize(r * 2, r * 2).setDepth(3);
    this.effects = new EffectRenderer(this);
    this.audio = new AudioBridge();

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,ESC') as Record<string, Phaser.Input.Keyboard.Key>;
    this.keys.ESC.on('down', () => this.queued.push({ t: this.world.paused ? 'resume' : 'pause' }));

    this.scene.launch('Hud', { world: this.world });
  }

  update(_time: number, delta: number): void {
    const k = this.keys;
    const move: Command = {
      t: 'move',
      x: (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0),
      y: (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0),
    };

    this.acc += (delta / 1000) * this.speed;
    let steps = 0;
    while (this.acc >= DT && steps < MAX_STEPS_PER_FRAME * this.speed) {
      this.queued.push(move);
      step(this.world, this.queued);
      this.queued = [];
      this.acc -= DT;
      steps++;
      for (const e of this.world.events) this.onEvent(e);
      if (this.world.over) return;
    }
    if (this.acc > DT) this.acc = 0; // 탭 전환 등으로 밀린 시간은 버린다

    this.draw(this.acc / DT);
  }

  private onEvent(e: SimEvent): void {
    this.effects.handle(e);
    this.audio.handle(e);
    if (e.t === 'levelUp') {
      this.scene.launch('LevelUp', {
        level: e.level,
        choices: e.choices,
        onChoose: (index: number) => this.queued.push({ t: 'choose', index }),
      });
    } else if (e.t === 'runEnd') {
      this.scene.stop('Hud');
      this.scene.stop('LevelUp');
      this.scene.start('Result', { stats: e.stats });
    }
  }

  private draw(alpha: number): void {
    const w = this.world;
    const p = w.player;
    const frozen = w.paused || w.pendingChoices !== null;
    const a = frozen ? 1 : alpha;
    const x = p.px + (p.x - p.px) * a;
    const y = p.py + (p.y - p.py) * a;

    this.playerSprite.setPosition(x, y).setAlpha(p.invuln > 0 ? 0.5 : 1);
    const cam = this.cameras.main;
    cam.setScroll(x - GAME_WIDTH / 2, y - GAME_HEIGHT / 2);
    this.bg.setTilePosition(cam.scrollX, cam.scrollY);

    this.pickups.draw(w.pickups, a);
    this.enemies.draw(w.enemies, a);
    this.projectiles.draw(w.projectiles, a);
  }
}
