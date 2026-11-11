import Phaser from "phaser";
import { DESCRIPTIONS, ICONS, key, mount } from "../ui";
import type { UpgradeChoice, World } from "../sim";
import { applyChoice } from "../sim/systems/progression";

const statLabels = {
  moveSpeed: "이동 속도",
  maxHp: "최대 체력",
  damage: "공격력 배율",
  cooldown: "재사용 시간 배율",
  area: "범위 배율",
  pickupRange: "수집 거리",
  xpGain: "경험치 배율",
  armor: "방어력",
};

function preview(world: World, choice: UpgradeChoice, index: number): string {
  const player = world.player;
  const after = { ...world, player: structuredClone(player) };
  applyChoice(after, index);
  const number = (value: number) =>
    new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
  const row = (
    label: string,
    from: number | undefined,
    to: number,
    unit = "",
  ) =>
    '<span class="upgrade-stat"><span>' +
    label +
    "</span><span>" +
    (from === undefined ? "—" : number(from) + unit) +
    " → <strong>" +
    number(to) +
    unit +
    "</strong></span></span>";
  if (choice.kind === "heal")
    return row("현재 체력", player.hp, after.player.hp);
  if (choice.kind === "passive") {
    const stat = world.data.passives[world.data.passiveIndex[choice.id]].stat;
    return row(statLabels[stat], player.stats[stat], after.player.stats[stat]);
  }
  const id = world.data.weaponIndex[choice.id];
  const def = world.data.weapons[id];
  const old = player.weapons.find((w) => w.def === id);
  const before = old ? def.levels[old.level - 1] : undefined;
  const next = def.levels[choice.level - 1];
  return (
    row(
      "명중당 피해",
      before && before.damage * player.stats.damage,
      next.damage * player.stats.damage,
    ) +
    row(
      "재사용 시간",
      before && before.cooldown * player.stats.cooldown,
      next.cooldown * player.stats.cooldown,
      "초",
    ) +
    (["projectile", "orbit", "boomerang", "storm"].includes(def.pattern)
      ? row("발사 수", before?.count, next.count)
      : "")
  );
}
export class LevelUpScene extends Phaser.Scene {
  constructor() {
    super("LevelUp");
  }
  create(data: {
    level: number;
    choices: UpgradeChoice[];
    world: World;
    onChoose: (index: number) => void;
  }): void {
    const ui = mount(
      this,
      "modal-shade upgrade",
      `<div class="eyebrow">레벨 ${data.level}</div><h2>업그레이드</h2><p class="muted">강화 효과를 비교하고 하나를 선택하세요.</p><div class="cards">${data.choices.map((c, i) => `<button class="upgrade-card" data-index="${i}"><span class="card-top"><span class="card-icon">${ICONS[c.id] || "✧"}</span><span class="card-kind">${c.kind === "weapon" ? "WEAPON" : c.kind === "heal" ? "RECOVERY" : "RELIC"} &nbsp; ${i + 1}</span></span><h3>${c.name}</h3><p>${(data.world.firstPerson ? ({ magic_bolt: "정면의 적에게 조준을 보조해 자동 발사합니다.", spark: "보고 있는 방향에 불꽃을 발사합니다.", moon_beam: "조준선이 적을 통과할 때 관통 광선을 발사합니다.", boomerang: "정면에 있는 적에게 돌아오는 초승달을 던집니다." } as Record<string, string>)[c.id] : undefined) ?? DESCRIPTIONS[c.id] ?? ""}</p><span class="upgrade-stats">${preview(data.world, c, i)}</span><span class="card-level">${c.kind === "heal" ? "체력 30% 회복" : c.isNew ? "새로운 능력 획득" : `레벨 ${c.level - 1} → ${c.level}`} <span style="float:right">↗</span></span></button>`).join("")}</div><div class="choice-hint">카드를 클릭하거나 <span class="keycap">1</span><span class="keycap">2</span><span class="keycap">3</span> 키로 선택</div>`,
    );
    ui.setAttribute("role", "dialog");
    ui.setAttribute("aria-modal", "true");
    ui.setAttribute("aria-label", "업그레이드");
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
