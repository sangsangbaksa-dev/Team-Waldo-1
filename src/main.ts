import Phaser from "phaser";
import "./style.css";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { HudScene } from "./scenes/HudScene";
import { LevelUpScene } from "./scenes/LevelUpScene";
import { ResultScene } from "./scenes/ResultScene";
import { TitleScene } from "./scenes/TitleScene";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  input: { activePointers: 2 },
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  backgroundColor: "#1b2a1f",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [
    BootScene,
    TitleScene,
    GameScene,
    HudScene,
    LevelUpScene,
    ResultScene,
  ],
});
if (import.meta.env.DEV) Object.assign(window, { __game: game });
