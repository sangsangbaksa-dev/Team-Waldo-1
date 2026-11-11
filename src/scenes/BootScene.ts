import Phaser from "phaser";
import { FONT, GAME_WIDTH } from "../config";
import { loadGameData } from "../data";
import { createArt } from "../render/Art";

/** 데이터 검증과 플레이스홀더 텍스처 생성. 에셋 로딩도 여기에 추가한다. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
    try {
      this.registry.set("data", loadGameData());
    } catch (e) {
      // 기획이 JSON을 잘못 고쳤을 때 어느 파일 어느 필드인지 화면에 보여준다
      this.add.text(8, 8, (e as Error).message, {
        ...FONT,
        color: "#ff8080",
        wordWrap: { width: GAME_WIDTH - 16 },
      });
      return;
    }

    createArt(this);

    this.scene.start("Title");
  }
}
