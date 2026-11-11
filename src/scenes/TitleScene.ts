import { openSkillTree } from "../skillTree";
import Phaser from "phaser";
import { titleLandscape } from "../render/Art";
import { AudioBridge } from "../render/AudioBridge";
import { key, mount, readBest } from "../ui";
export class TitleScene extends Phaser.Scene {
  constructor() {
    super("Title");
  }
  create(): void {
    titleLandscape(this);
    const ui = mount(
      this,
      "title-screen",
      `<div class="brand"><span class="brand-mark">✧</span> TEAM WALDO</div><div class="edition">1인칭 · 고난도</div><div class="title-copy"><h1>NIGHT<span>WARDEN</span></h1><div class="subtitle">밤의 파수꾼</div><p class="description">마지막 불빛이 꺼지기 전에.<br>잠든 숲을 깨우는 어둠에 맞서세요.</p><div class="title-actions"><button class="primary" id="start">숲으로 들어가기 <span>→</span></button><button class="text-button" id="skill-tree">스킬 트리</button><button class="text-button" id="help">플레이 방법 ↗</button></div></div><div class="title-footer"><span class="keyboard-hint"><span class="keycap">W A S D</span> 이동 &nbsp; · &nbsp; 공격은 자동</span><span>최고 기록 &nbsp; ${readBest().toLocaleString()} &nbsp; / &nbsp; 6분 생존 + 보스전</span><button class="sound-button" id="sound"></button></div>`,
    );
    const tree = ui.querySelector<HTMLButtonElement>("#skill-tree")!;
    tree.onclick = () => openSkillTree(ui, tree);
    let starting = false;
    const start = () => {
      if (starting || ui.querySelector(".modal-shade")) return;
      starting = true;
      AudioBridge.unlock();
      this.scene.start("Game");
    };
    ui.querySelector("#start")!.addEventListener("click", start);
    key(this, "SPACE", start);
    key(this, "ENTER", start);
    const sound = ui.querySelector<HTMLButtonElement>("#sound")!;
    const sync = () =>
      (sound.textContent = AudioBridge.muted ? "소리 꺼짐 ◇" : "소리 켜짐 ♪");
    sync();
    sound.onclick = () => {
      AudioBridge.toggle();
      sync();
    };
    ui.querySelector("#help")!.addEventListener("click", () => {
      if (ui.querySelector(".modal-shade")) return;
      const help = document.createElement("div");
      help.className = "modal-shade";
      help.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-label="플레이 방법"><div class="eyebrow">FIELD GUIDE / 01</div><h2>불빛을 지키는 방법</h2><div class="help-grid"><p><strong>01 — 움직이세요</strong><br>WASD · 방향키로 이동합니다.<br>화면 클릭 후 마우스로 둘러봅니다. Q/E로도 회전합니다.<br>터치: 왼쪽은 이동, 오른쪽은 시점.</p><p><strong>02 — 강해지세요</strong><br>공격은 자동입니다. 적이 떨어뜨린<br>푸른 결정을 모아 능력을 선택하세요.</p><p><strong>03 — 살아남으세요</strong><br>세 구간을 2분씩 견디고<br>마지막 ‘밤의 군주’를 쓰러뜨리세요.</p><p><strong>04 — 숨을 고르세요</strong><br>ESC 또는 Ⅱ 버튼으로 일시정지.<br>숫자 1·2·3으로 능력을 선택합니다.</p></div><button class="primary">알겠습니다 <span>→</span></button></section>`;
      ui.append(help);
      const close = help.querySelector<HTMLButtonElement>("button")!;
      close.onclick = () => {
        help.remove();
        ui.querySelector<HTMLButtonElement>("#help")!.focus();
      };
      close.focus();
    });
    key(this, "ESC", () => ui.querySelector(".modal-shade")?.remove());
  }
}
