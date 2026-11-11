import type Phaser from "phaser";
export const DESCRIPTIONS: Record<string, string> = {
  magic_bolt: "가장 가까운 적에게 마력을 발사합니다.",
  knife: "이동 방향으로 관통 단검을 던집니다.",
  spark: "무작위 방향으로 강력한 불꽃을 퍼뜨립니다.",
  guardian_orb: "황금 구슬이 주위를 돌며 적을 밀어냅니다.",
  frost_aura: "결계 안의 적에게 지속 피해를 줍니다.",
  moon_beam: "가까운 적을 향해 관통하는 달빛을 쏩니다.",
  boomerang: "초승달이 날아간 뒤 되돌아옵니다.",
  storm: "모든 방향으로 번개 가시를 쏩니다.",
  swift_boots: "이동 속도 +8% / 레벨",
  heart: "최대 체력 +15% / 레벨. 늘어난 만큼 회복합니다.",
  power_stone: "모든 무기 공격력 +10% / 레벨",
  hourglass: "공격 대기시간 −6% / 레벨",
  magnet: "경험치 수집 범위 +25% / 레벨",
  tome: "획득 경험치 +8% / 레벨",
  heal: "최대 체력의 30%를 즉시 회복합니다.",
};
export const ICONS: Record<string, string> = {
  magic_bolt: "✦",
  knife: "†",
  spark: "♨",
  guardian_orb: "◈",
  frost_aura: "❄",
  moon_beam: "☽",
  boomerang: "☾",
  storm: "ϟ",
  swift_boots: "»",
  heart: "♡",
  power_stone: "◆",
  hourglass: "⌛",
  magnet: "◎",
  tome: "▤",
  heal: "✚",
};
export function mount(
  scene: Phaser.Scene,
  className: string,
  html: string,
): HTMLDivElement {
  const el = document.createElement("div");
  el.className = className;
  el.innerHTML = html;
  document.querySelector("#ui")!.append(el);
  scene.events.once("shutdown", () => el.remove());
  return el;
}
export function key(
  scene: Phaser.Scene,
  name: string,
  handler: () => void,
): void {
  scene.input.keyboard?.on(`keydown-${name}`, handler);
  scene.events.once("shutdown", () =>
    scene.input.keyboard?.off(`keydown-${name}`, handler),
  );
}
export function readBest(): number {
  try {
    return Number(localStorage.getItem("survival-pixel.best")) || 0;
  } catch {
    return 0;
  }
}
export function saveBest(score: number): number {
  const best = Math.max(score, readBest());
  try {
    localStorage.setItem("survival-pixel.best", String(best));
  } catch {
    /* optional */
  }
  return best;
}
export function formatTime(t: number): string {
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t) % 60).padStart(2, "0")}`;
}
