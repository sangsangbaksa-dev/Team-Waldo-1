import { awardSkillPoints, openSkillTree } from "../skillTree";
import Phaser from "phaser";
import { titleLandscape } from "../render/Art";
import { formatTime, key, mount, saveBest } from "../ui";
import type { RunStats } from "../sim";
export class ResultScene extends Phaser.Scene {
  constructor() {
    super("Result");
  }
  create(data: { stats: RunStats }): void {
    const s = data.stats,
      best = saveBest(s.score);
    const earned = awardSkillPoints(s);
    titleLandscape(this);
    const ui = mount(
      this,
      "result",
      `<div class="crest">${s.victory ? "✧" : "☾"}</div><div class="eyebrow">${s.victory ? "DAWN HAS FOUND YOU" : "THE FOREST WILL REMEMBER"}</div><h1>${s.victory ? "숲에 새벽이 찾아왔습니다" : "불빛은 다시 피어납니다"}</h1><p>${s.victory ? "밤의 군주를 쓰러뜨렸습니다. 당신이 지킨 불빛은 오래도록 남을 것입니다." : "어둠 속에 남긴 발자취. 다음 밤에는 조금 더 멀리."}</p><div class="stats"><div><b>${s.score.toLocaleString()}</b><small>획득 점수</small></div><div><b>${formatTime(s.time)}</b><small>생존 시간</small></div><div><b>${s.kills}</b><small>처치</small></div><div><b>${s.level}</b><small>도달 레벨</small></div></div><div class="result-actions"><button class="primary" id="retry">다시 도전하기 <span>→</span></button><button class="text-button" id="skill-tree">스킬 트리</button><button class="text-button" id="home">타이틀로 돌아가기</button></div><p>불씨 +${earned} &nbsp; · &nbsp; 최고 기록 &nbsp; ${best.toLocaleString()}</p>`,
    );
    const tree = ui.querySelector<HTMLButtonElement>("#skill-tree")!;
    tree.onclick = () => openSkillTree(ui, tree);
    let ready = false;
    this.time.delayedCall(500, () => (ready = true));
    const retry = () => {
      if (ready && !ui.querySelector(".modal-shade")) this.scene.start("Game");
    };
    ui.querySelector("#retry")!.addEventListener("click", retry);
    ui.querySelector("#home")!.addEventListener("click", () =>
      this.scene.start("Title"),
    );
    key(this, "SPACE", retry);
  }
}
