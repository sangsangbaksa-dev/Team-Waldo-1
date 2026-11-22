// FRONTLINE — 전장의 안개. 아군 유닛·건물의 시야 반경 안만 "보이는 곳", 한 번이라도 본 곳은 "탐색한 곳"입니다.
// 화면과 미니맵에서 읽기만 하는 값이라 시뮬레이션(락스텝)에는 영향을 주지 않습니다.
import { VISION } from './config';
import type { RtsSim } from './sim';

export const FOG_HIDDEN = 0, FOG_SEEN = 1, FOG_VISIBLE = 2;

/** 시야 계산 간격(틱). 이동 속도에 비해 충분히 촘촘하고 비용은 작습니다. */
export const VISION_EVERY = 4;

export class Vision {
  /** 칸마다 0=한 번도 못 봄, 1=봤지만 지금은 안 보임, 2=지금 보임. */
  readonly state: Uint8Array;
  private readonly size: number;
  private readonly previous: Uint8Array;
  /** 값이 바뀔 때마다 늘어납니다. 그리는 쪽이 다시 칠할지 판단하는 데 씁니다. */
  version = 0; private seenTick = -99;

  constructor(readonly n: number, readonly owner: number) { this.size = n; this.state = new Uint8Array(n * n); this.previous = new Uint8Array(n * n); }

  /** 시야를 다시 계산합니다. force 가 아니면 VISION_EVERY 틱마다만 합니다. */
  update(sim: RtsSim, force = false): boolean {
    if (!force && sim.tick - this.seenTick < VISION_EVERY && sim.tick >= this.seenTick) return false;
    this.seenTick = sim.tick; const n = this.size, st = this.state;
    for (let i = 0; i < st.length; i++) if (st[i] === FOG_VISIBLE) st[i] = FOG_SEEN;
    const reveal = (cx: number, cy: number, r: number): void => {
      const r2 = r * r, x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(n - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(n - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy <= r2) st[y * n + x] = FOG_VISIBLE; }
    };
    for (const u of sim.units) if (u.owner === this.owner && u.hp > 0) reveal(u.x, u.y, VISION[u.kind]);
    for (const b of sim.buildings) if (b.owner === this.owner && b.hp > 0) reveal(b.x + b.size / 2, b.y + b.size / 2, VISION[b.kind] + b.size / 2 - 1);
    // Rendering clients use the version to avoid rebuilding the minimap and
    // re-uploading a texture. Only advance it when visibility really changed.
    let changed = false;
    for (let i = 0; i < st.length; i++) {
      if (st[i] !== this.previous[i]) { this.previous[i] = st[i]; changed = true; }
    }
    if (changed) this.version++;
    return changed;
  }
  at(x: number, y: number): number {
    const cx = Math.floor(x), cy = Math.floor(y); if (cx < 0 || cy < 0 || cx >= this.n || cy >= this.n) return FOG_HIDDEN; return this.state[cy * this.n + cx];
  }
  visible(x: number, y: number): boolean { return this.at(x, y) === FOG_VISIBLE; }
  /** 한 번이라도 본 적이 있는 곳(지금 보이는 곳 포함). */
  explored(x: number, y: number): boolean { return this.at(x, y) !== FOG_HIDDEN; }
}
