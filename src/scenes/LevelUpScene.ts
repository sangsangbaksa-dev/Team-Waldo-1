import Phaser from "phaser";
import { DESCRIPTIONS, ICONS, key, mount } from "../ui";
import type { UpgradeChoice } from "../sim";
export class LevelUpScene extends Phaser.Scene {
  constructor() {
    super("LevelUp");
  }
  create(data: {
    level: number;
    choices: UpgradeChoice[];
    onChoose: (index: number) => void;
  }): void {
    const ui = mount(
      this,
      "modal-shade upgrade",
      `<div class="eyebrow">A LIGHT IN THE DARK / LEVEL ${data.level}</div><h2>당신의 불빛이 강해집니다</h2><p class="muted">하나의 능력을 선택하세요. 선택하는 동안 시간은 멈춥니다.</p><div class="cards">${data.choices.map((c, i) => `<button class="upgrade-card" data-index="${i}"><span class="card-top"><span class="card-icon">${ICONS[c.id] || "✧"}</span><span class="card-kind">${c.kind === "weapon" ? "WEAPON" : c.kind === "heal" ? "RECOVERY" : "RELIC"} &nbsp; ${i + 1}</span></span><h3>${c.name}</h3><p>${DESCRIPTIONS[c.id] || ""}</p><span class="card-level">${c.kind === "heal" ? "체력 30% 회복" : c.isNew ? "새로운 능력 획득" : `레벨 ${c.level - 1} → ${c.level}`} <span style="float:right">↗</span></span></button>`).join("")}</div><div class="choice-hint">카드를 클릭하거나 <span class="keycap">1</span><span class="keycap">2</span><span class="keycap">3</span> 키로 선택</div>`,
    );
    let chosen = false;
    const choose = (i: number) => {
      if (chosen || i >= data.choices.length) return;
      chosen = true;
      data.onChoose(i);
      this.scene.stop();
    };
    ui.querySelectorAll<HTMLButtonElement>("[data-index]").forEach(
      (b) => (b.onclick = () => choose(Number(b.dataset.index))),
    );
    ["ONE", "TWO", "THREE"].forEach((k, i) => key(this, k, () => choose(i)));
    ui.querySelector<HTMLButtonElement>("button")?.focus({
      preventScroll: true,
    });
  }
}
