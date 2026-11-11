import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, hexToInt } from "../config";
import type { GameData } from "../data";
import { AudioBridge } from "../render/AudioBridge";
import { EffectRenderer } from "../render/EffectRenderer";
import { EntityRenderer } from "../render/EntityRenderer";
import {
  DT,
  auraRadius,
  createWorld,
  step,
  type Command,
  type SimEvent,
  type World,
} from "../sim";
import { HudScene } from "./HudScene";
import { key } from "../ui";

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
  private aura!: Phaser.GameObjects.Arc;
  private enemies!: EntityRenderer;
  private projectiles!: EntityRenderer;
  private pickups!: EntityRenderer;
  private effects!: EffectRenderer;
  private audio!: AudioBridge;
  private scenery: Phaser.GameObjects.Image[] = [];
  private glow!: Phaser.GameObjects.Image;
  private warnings!: Phaser.GameObjects.Graphics;
  private joystick!: Phaser.GameObjects.Graphics;
  private touch: {
    id: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
  } | null = null;

  constructor() {
    super("Game");
  }

  create(): void {
    const data = this.registry.get("data") as GameData;
    const params = new URLSearchParams(window.location.search);
    // ?seed=123 으로 같은 판을 재현하고, ?speed=10 으로 빨리 돌려 볼 수 있다
    const seed = Number(params.get("seed")) || Date.now() & 0x7fffffff;
    this.speed = Math.min(20, Math.max(1, Number(params.get("speed")) || 1));

    this.world = createWorld(data, seed);
    this.acc = 0;
    this.queued = [];

    this.touch = null;
    this.scenery = [];
    this.bg = this.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, "ground")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(0);
    for (let i = 0; i < 40; i++)
      this.scenery.push(
        this.add
          .image(0, 0, i % 5 === 0 ? "stone" : i % 11 === 0 ? "shrine" : "tree")
          .setAlpha(i % 5 === 0 ? 0.7 : 0.45)
          .setDepth(0.5)
          .setScale(i % 5 === 0 ? 1 : 0.7 + (i % 3) * 0.2),
      );
    this.glow = this.add.image(0, 0, "glow").setDepth(1).setScale(1.1);
    this.pickups = new EntityRenderer(
      this,
      1,
      () => GEM_COLOR,
      () => "gem",
    );
    this.enemies = new EntityRenderer(
      this,
      2,
      (k) =>
        data.enemies[k].palette === "red"
          ? 0xec9d84
          : data.enemies[k].palette === "gold"
            ? 0xe9cf83
            : 0xffffff,
      (k) =>
        data.enemies[k].sprite === "slime_king"
          ? "slime"
          : data.enemies[k].sprite,
      true,
    );
    this.projectiles = new EntityRenderer(
      this,
      4,
      (k) => hexToInt(data.weapons[k].placeholderColor),
      (k) =>
        data.weapons[k].id === "knife"
          ? "knife"
          : data.weapons[k].pattern === "orbit"
            ? "orb"
            : "bolt",
    );
    this.playerSprite = this.add
      .image(0, 0, "warden")
      .setDisplaySize(24, 24)
      .setDepth(3);
    this.warnings = this.add.graphics().setDepth(1.5);
    this.joystick = this.add.graphics().setScrollFactor(0).setDepth(20);
    this.aura = this.add
      .circle(0, 0, 1, 0x80d0ff, 0.12)
      .setStrokeStyle(1, 0x80d0ff, 0.5)
      .setDepth(1)
      .setVisible(false);
    this.effects = new EffectRenderer(this);
    this.audio = new AudioBridge();

    this.keys = this.input.keyboard!.addKeys(
      "W,A,S,D,UP,DOWN,LEFT,RIGHT,ESC",
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    const toggle = () => {
      if (!this.world.pendingChoices)
        this.queued.push({ t: this.world.paused ? "resume" : "pause" });
    };
    key(this, "ESC", toggle);
    const blur = () => {
      this.touch = null;
      this.queued.push({ t: "pause" });
    };
    window.addEventListener("blur", blur);
    const visibility = () => {
      if (document.hidden) blur();
    };
    document.addEventListener("visibilitychange", visibility);
    this.events.once("shutdown", () => {
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      this.input.removeAllListeners();
    });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.world.paused || this.world.pendingChoices) return;
      this.touch = { id: p.id, x: p.x, y: p.y, dx: 0, dy: 0 };
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.touch && p.id === this.touch.id) {
        this.touch.dx = (p.x - this.touch.x) / 28;
        this.touch.dy = (p.y - this.touch.y) / 28;
      }
    });
    const release = () => {
      this.touch = null;
    };
    this.input.on("pointerup", release);
    this.input.on("pointerupoutside", release);
    this.input.on("gameout", release);
    this.scene.launch("Hud", {
      world: this.world,
      toggle,
      home: () => {
        this.scene.stop("Hud");
        this.scene.stop("LevelUp");
        this.scene.start("Title");
      },
    });
  }

  update(_time: number, delta: number): void {
    const k = this.keys;
    const move: Command = {
      t: "move",
      x:
        this.touch?.dx ||
        (k.D.isDown || k.RIGHT.isDown ? 1 : 0) -
          (k.A.isDown || k.LEFT.isDown ? 1 : 0),
      y:
        this.touch?.dy ||
        (k.S.isDown || k.DOWN.isDown ? 1 : 0) -
          (k.W.isDown || k.UP.isDown ? 1 : 0),
    };

    this.effects.beginFrame();
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
    if (!this.world.paused && !this.world.pendingChoices)
      this.audio.ambience(this.world.time);
  }

  private onEvent(e: SimEvent): void {
    this.effects.handle(e);
    this.audio.handle(e);
    if (e.t === "levelUp") {
      this.touch = null;
      this.scene.launch("LevelUp", {
        level: e.level,
        choices: e.choices,
        onChoose: (index: number) => this.queued.push({ t: "choose", index }),
      });
    } else if (e.t === "stageStart") {
      (this.scene.get("Hud") as HudScene).announce(
        `0${e.index + 1} / THE NIGHT DEEPENS`,
        [
          "속삭이는 숲",
          "잊힌 폐허 · 어둠이 짙어집니다",
          "달빛 성역 · 새벽이 가까워집니다",
        ][e.index],
      );
    } else if (e.t === "bossSpawn") {
      (this.scene.get("Hud") as HudScene).announce(
        e.miniboss ? "A GUARDIAN AWAKENS" : "THE LORD OF NIGHT",
        e.miniboss
          ? "숲의 수호자가 깨어납니다"
          : "밤의 군주 · 마지막 불빛을 지키세요",
      );
    } else if (e.t === "runEnd") {
      this.scene.stop("Hud");
      this.scene.stop("LevelUp");
      this.scene.start("Result", { stats: e.stats });
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
    this.playerSprite.setFlipX(p.faceX < 0);
    if (!frozen && (p.moveX || p.moveY))
      this.playerSprite.y += Math.sin(w.time * 17) * 1.2;
    this.glow.setPosition(x, y);
    const cam = this.cameras.main;
    cam.setScroll(x - GAME_WIDTH / 2, y - GAME_HEIGHT / 2);
    this.bg.setTilePosition(cam.scrollX, cam.scrollY);
    this.bg.setTint([0xffffff, 0xbac3c6, 0xc0b6dc][w.stage.index]);
    this.scenery.forEach((s, i) => {
      const bx = (i * 173) % 960,
        by = (i * 137) % 720;
      s.setPosition(
        bx + Math.floor((x - bx + 480) / 960) * 960,
        by + Math.floor((y - by + 360) / 720) * 720,
      );
    });
    this.warnings.clear();
    for (let i = 0; i < w.enemies.count; i++) {
      const def = w.data.enemies[w.enemies.kind[i]];
      if (
        (def.behavior === "ranged" && w.enemies.timer[i] > 2.1) ||
        (def.behavior === "dash" && w.enemies.timer[i] > 2.2)
      ) {
        this.warnings
          .lineStyle(1, 0xf3a47e, 0.6)
          .strokeCircle(w.enemies.x[i], w.enemies.y[i], w.enemies.r[i] + 7);
      }
    }
    this.joystick.clear();
    if (this.touch) {
      const t = this.touch,
        len = Math.max(1, Math.hypot(t.dx, t.dy));
      this.joystick
        .lineStyle(1, 0xc9c9a0, 0.35)
        .strokeCircle(t.x, t.y, 28)
        .fillStyle(0xd7c795, 0.35)
        .fillCircle(t.x + (t.dx / len) * 24, t.y + (t.dy / len) * 24, 8);
    }

    // 오라형 무기가 있으면 범위를 보여준다
    let auraR = 0;
    for (const ws of p.weapons) {
      const def = w.data.weapons[ws.def];
      if (def.pattern === "aura")
        auraR = Math.max(auraR, auraRadius(def.levels[ws.level - 1], p.stats));
    }
    this.aura
      .setVisible(auraR > 0)
      .setPosition(x, y)
      .setRadius(auraR);

    this.pickups.draw(w.pickups, a);
    this.enemies.draw(w.enemies, a);
    this.projectiles.draw(w.projectiles, a);
  }
}
