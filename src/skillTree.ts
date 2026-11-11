import type { GameData } from "./data";
import type { RunStats } from "./sim";

const branches = [
  {
    title: "전투",
    icon: "✦",
    nodes: [
      {
        id: "edge",
        name: "예리한 불씨",
        detail: "모든 무기 피해 +8%",
        cost: 1,
        stat: "damage",
        value: 0.08,
      },
      {
        id: "cadence",
        name: "속사의 서약",
        detail: "모든 무기 재사용 시간 −8%",
        cost: 3,
        stat: "cooldown",
        value: 0.08,
      },
      {
        id: "wrath",
        name: "새벽의 분노",
        detail: "모든 무기 피해 +18%",
        cost: 6,
        stat: "damage",
        value: 0.18,
      },
    ],
  },
  {
    title: "생존",
    icon: "◈",
    nodes: [
      {
        id: "vigor",
        name: "잔불의 심장",
        detail: "시작 및 최대 체력 +10",
        cost: 1,
        stat: "hp",
        value: 10,
      },
      {
        id: "stride",
        name: "숲의 걸음",
        detail: "이동 속도 +7%",
        cost: 3,
        stat: "speed",
        value: 0.07,
      },
      {
        id: "guard",
        name: "밤의 방패",
        detail: "시작 및 최대 체력 +22",
        cost: 6,
        stat: "hp",
        value: 22,
      },
    ],
  },
  {
    title: "수집",
    icon: "✧",
    nodes: [
      {
        id: "magnet",
        name: "결정의 메아리",
        detail: "경험치 수집 거리 +15%",
        cost: 1,
        stat: "pickup",
        value: 0.15,
      },
      {
        id: "study",
        name: "정찰 일지",
        detail: "다음 레벨에 필요한 경험치 −10%",
        cost: 3,
        stat: "xp",
        value: 0.1,
      },
      {
        id: "beacon",
        name: "길잡이 봉화",
        detail: "경험치 수집 거리 +30%",
        cost: 6,
        stat: "pickup",
        value: 0.3,
      },
    ],
  },
] as const;

const key = "night-warden.skill-tree.v1";
type Progress = { points: number; unlocked: string[]; completed: number };
let progress: Progress = { points: 0, unlocked: [], completed: 0 };

try {
  const saved = JSON.parse(
    localStorage.getItem(key) ?? "null",
  ) as Partial<Progress> | null;
  if (
    saved &&
    Number.isSafeInteger(saved.points) &&
    saved.points! >= 0 &&
    Array.isArray(saved.unlocked)
  ) {
    progress = {
      points: saved.points!,
      completed:
        Number.isSafeInteger(saved.completed) && saved.completed! >= 0
          ? saved.completed!
          : 0,
      unlocked: branches
        .flatMap((branch) => branch.nodes.map((node) => node.id))
        .filter((id) => saved.unlocked!.includes(id)),
    };
  }
} catch {
  /* Progress stays available for the current session. */
}

function save() {
  try {
    localStorage.setItem(key, JSON.stringify(progress));
  } catch {
    /* Session-only storage. */
  }
}

export function trialInfo() {
  const attempt = progress.completed + 1;
  return {
    attempt,
    deadline: [30, 45, 60, 75, 90][attempt - 1] as number | undefined,
  };
}

export function awardSkillPoints(stats: RunStats): number {
  const initiationReward = trialInfo().deadline === undefined ? 0 : 2;
  progress.completed++;
  const earned =
    initiationReward +
    Math.floor(stats.kills / 10) +
    Math.floor(stats.time / 60) +
    (stats.victory ? 8 : 0);
  progress.points += earned;
  save();
  return earned;
}

export function applySkillTree(base: GameData): GameData {
  if (!progress.unlocked.length) return base;
  const data = structuredClone(base);
  const bonuses = { damage: 0, cooldown: 0, hp: 0, speed: 0, pickup: 0, xp: 0 };
  for (const branch of branches) {
    for (const node of branch.nodes) {
      if (progress.unlocked.includes(node.id)) bonuses[node.stat] += node.value;
    }
  }
  data.balance.player.hp += bonuses.hp;
  data.balance.player.moveSpeed *= 1 + bonuses.speed;
  data.balance.player.pickupRange *= 1 + bonuses.pickup;
  data.balance.xpCurve.base *= 1 - bonuses.xp;
  for (const weapon of data.weapons) {
    for (const level of weapon.levels) {
      level.damage *= 1 + bonuses.damage;
      level.cooldown *= 1 - bonuses.cooldown;
    }
  }
  return data;
}

export function openSkillTree(
  parent: HTMLElement,
  trigger: HTMLButtonElement,
  nextRun?: () => void,
) {
  if (parent.querySelector(".modal-shade")) return;
  const overlay = document.createElement("div");
  overlay.className = "modal-shade skill-tree";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "스킬 트리");
  const close = () => {
    overlay.remove();
    trigger.focus();
  };
  const render = (focusId?: string) => {
    overlay.innerHTML = `<section class="tree-panel"><header class="tree-header"><div><h2>스킬 트리</h2><p>해금한 능력은 이후 모든 도전에 적용됩니다.</p></div><div class="tree-balance" aria-live="polite">불씨 <strong>${progress.points}</strong></div><button class="sound-button tree-close" aria-label="스킬 트리 닫기">✕</button></header><div class="tree-branches">${branches
      .map(
        (branch) =>
          `<section><h3><span>${branch.icon}</span> ${branch.title}</h3>${branch.nodes
            .map((node, i) => {
              const unlocked = progress.unlocked.includes(node.id);
              const locked =
                i > 0 && !progress.unlocked.includes(branch.nodes[i - 1].id);
              const state = unlocked
                ? "해금 완료"
                : locked
                  ? "선행 노드 필요"
                  : `불씨 ${node.cost}`;
              return `<button class="tree-node ${unlocked ? "unlocked" : ""}" data-node="${node.id}" ${unlocked || locked || progress.points < node.cost ? "disabled" : ""}><b>${node.name}</b><span>${node.detail}</span><small>${state}</small></button>`;
            })
            .join("")}</section>`,
      )
      .join(
        "",
      )}</div><footer>첫 다섯 판은 종료마다 불씨 2개 · 적 10마리 처치 또는 1분 생존마다 불씨 1개 · 보스 처치 보너스 8개</footer>${nextRun ? '<button class="primary tree-next">다음 판 시작 <span>→</span></button>' : ""}</section>`;
    const closeButton =
      overlay.querySelector<HTMLButtonElement>(".tree-close")!;
    closeButton.onclick = close;
    const nextButton = overlay.querySelector<HTMLButtonElement>(".tree-next");
    if (nextButton && nextRun) nextButton.onclick = nextRun;
    for (const button of overlay.querySelectorAll<HTMLButtonElement>(
      "[data-node]",
    )) {
      button.onclick = () => {
        const branch = branches.find((b) =>
          b.nodes.some((n) => n.id === button.dataset.node),
        );
        if (!branch) return;
        const index = branch.nodes.findIndex(
          (n) => n.id === button.dataset.node,
        );
        const node = branch.nodes[index];
        if (
          progress.unlocked.includes(node.id) ||
          progress.points < node.cost ||
          (index > 0 && !progress.unlocked.includes(branch.nodes[index - 1].id))
        )
          return;
        progress.points -= node.cost;
        progress.unlocked.push(node.id);
        save();
        render(branch.nodes[index + 1]?.id);
      };
    }
    const next = focusId
      ? overlay.querySelector<HTMLButtonElement>(
          `[data-node="${focusId}"]:not(:disabled)`,
        )
      : null;
    (next ?? closeButton).focus();
  };
  overlay.onkeydown = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  };
  parent.append(overlay);
  render();
}
