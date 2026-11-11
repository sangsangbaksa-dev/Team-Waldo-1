import Phaser from "phaser";
import { AudioBridge } from "../render/AudioBridge";
import { formatTime, ICONS, mount } from "../ui";
import type { World } from "../sim";
export class HudScene extends Phaser.Scene {
  private world!: Readonly<World>;
  private ui!: HTMLDivElement;
  private build = "";
  private toggle!: () => void;
  private home!: () => void;
  constructor() {
    super("Hud");
  }
  init(data: { world: World; toggle: () => void; home: () => void }): void {
    this.world = data.world;
    this.toggle = data.toggle;
    this.home = data.home;
    this.build = "";
  }
  create(): void {
    this.ui = mount(
      this,
      "hud",
      `<div class="xpbar"><i id="xp"></i></div><div class="hud-top"><div class="vitals"><div class="vitals-label"><span>파수꾼 <span id="level"></span></span><span id="hp"></span></div><div class="bar"><i id="health"></i></div></div><div class="clock"><b id="time">00:00</b><small id="stage"></small></div><div class="hud-buttons"><button class="sound-button" id="sound" aria-label="소리 켜기 또는 끄기"></button><button class="sound-button" id="pause" aria-label="일시정지">Ⅱ</button></div></div><div class="boss" hidden><span>밤의 군주</span><div class="bar"><i></i></div></div><div class="hud-bottom"><div class="inventory"></div><div class="run-info"><span id="kills"></span><br><span class="keyboard-hint">WASD 이동 · ESC 일시정지</span></div></div><div class="touch-hint">화면을 드래그해 이동</div>`,
    );
    this.ui.querySelector("#pause")!.addEventListener("click", this.toggle);
    const sound = this.ui.querySelector<HTMLButtonElement>("#sound")!;
    const sync = () => (sound.textContent = AudioBridge.muted ? "◇" : "♪");
    sync();
    sound.onclick = () => {
      AudioBridge.toggle();
      sync();
    };
    this.announce("01 / THE SILENT WOODS", "속삭이는 숲 · 2분간 살아남으세요");
  }
  announce(label: string, message: string): void {
    this.ui.querySelector(".toast")?.remove();
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `<small>${label}</small><b>${message}</b>`;
    this.ui.append(t);
    this.time.delayedCall(4000, () => t.remove());
  }
  update(): void {
    const w = this.world,
      p = w.player;
    const text = (id: string, v: string) => {
      const el = this.ui.querySelector(id)!;
      if (el.textContent !== v) el.textContent = v;
    };
    text("#level", `LV.${p.level}`);
    text("#hp", `${Math.ceil(Math.max(0, p.hp))} / ${p.stats.maxHp}`);
    text("#time", formatTime(w.time));
    text(
      "#stage",
      w.stage.bossSpawned
        ? "FINAL / 밤의 군주"
        : ["01 / 속삭이는 숲", "02 / 잊힌 폐허", "03 / 달빛 성역"][
            w.stage.index
          ],
    );
    text(
      "#kills",
      `${w.stats.kills} 처치 · ${w.stats.score.toLocaleString()} 점수`,
    );
    (this.ui.querySelector("#health") as HTMLElement).style.width =
      `${Math.max(0, p.hp / p.stats.maxHp) * 100}%`;
    (this.ui.querySelector("#xp") as HTMLElement).style.width =
      `${(p.xp / p.xpToNext) * 100}%`;
    const items = [
      ...p.weapons.map((x) => ({
        id: w.data.weapons[x.def].id,
        name: w.data.weapons[x.def].name,
        level: x.level,
      })),
      ...p.passives.map((x) => ({
        id: w.data.passives[x.def].id,
        name: w.data.passives[x.def].name,
        level: x.level,
      })),
    ];
    const signature = items.map((x) => `${x.id}:${x.level}`).join();
    if (signature !== this.build) {
      this.build = signature;
      this.ui.querySelector(".inventory")!.innerHTML = items
        .map(
          (x) =>
            `<div class="slot" title="${x.name} Lv.${x.level}">${ICONS[x.id]}<small>${x.level}</small></div>`,
        )
        .join("");
    }
    const boss = this.ui.querySelector<HTMLElement>(".boss")!;
    boss.hidden = !w.stage.bossSpawned;
    if (w.stage.bossSpawned) {
      for (let i = 0; i < w.enemies.count; i++) {
        if (w.enemies.id[i] === w.stage.bossId) {
          boss.querySelector<HTMLElement>("i")!.style.width =
            `${Math.max(0, w.enemies.hp[i] / (w.data.enemies[w.enemies.kind[i]].hp * w.data.stages.boss.hpScale)) * 100}%`;
          break;
        }
      }
    }
    const menu = this.ui.querySelector(".pause-overlay");
    if (w.paused && !menu) {
      const el = document.createElement("div");
      el.className = "modal-shade pause-overlay";
      el.innerHTML =
        '<section class="modal pause-menu"><div class="eyebrow">TAKE A BREATH</div><h2>잠시, 숨을 고르세요</h2><p>숲은 당신을 기다립니다.</p><button class="primary" id="resume">계속하기 <span>→</span></button><button class="text-button" id="exit">타이틀로 돌아가기</button></section>';
      this.ui.append(el);
      el.querySelector("#resume")!.addEventListener("click", this.toggle);
      el.querySelector("#exit")!.addEventListener("click", this.home);
    } else if (!w.paused) menu?.remove();
  }
}
