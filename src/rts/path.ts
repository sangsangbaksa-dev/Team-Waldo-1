// FRONTLINE — 격자 길찾기(A*). 결과는 월드 좌표(칸 중심)의 평탄한 배열 [x0,y0,x1,y1,...] 입니다.
// 부동소수점 덧셈·곱셈·sqrt 만 써서 모든 브라우저에서 같은 결과가 나옵니다(1대1 동기화의 전제).

export class Pather {
  private g: Float32Array; private from: Int32Array; private seen: Uint32Array; private shut: Uint32Array; private stamp = 0;
  constructor(readonly n: number, readonly grid: Uint8Array) {
    this.g = new Float32Array(n * n); this.from = new Int32Array(n * n); this.seen = new Uint32Array(n * n); this.shut = new Uint32Array(n * n);
  }
  free(cx: number, cy: number): boolean { return cx >= 0 && cy >= 0 && cx < this.n && cy < this.n && this.grid[cy * this.n + cx] === 0; }
  freeAt(x: number, y: number): boolean { return this.free(Math.floor(x), Math.floor(y)); }

  /** (x,y) 에서 가장 가까운 빈 칸의 중심. 반경 안에 없으면 null. */
  nearestFree(x: number, y: number, max = 16): Pt | null {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (this.free(cx, cy)) return { x: Math.min(Math.max(x, cx + 0.05), cx + 0.95), y: Math.min(Math.max(y, cy + 0.05), cy + 0.95) };
    let best: Pt | null = null, bd = Infinity;
    for (let r = 1; r <= max; r++) {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r || !this.free(cx + i, cy + j)) continue;
        const dx = cx + i + 0.5 - x, dy = cy + j + 0.5 - y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = { x: cx + i + 0.5, y: cy + j + 0.5 }; }
      }
      if (best && bd <= r * r) break;
    }
    return best;
  }

  /** 두 점 사이를 막힘 없이 걸을 수 있는지(몸 폭을 조금 감안해 좌우도 확인). */
  los(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) return true;
    const ux = dx / len, uy = dy / len, px = -uy * 0.3, py = ux * 0.3, steps = Math.ceil(len / 0.4);
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(len, i * 0.4), x = x0 + ux * t, y = y0 + uy * t;
      if (!this.freeAt(x, y) || !this.freeAt(x + px, y + py) || !this.freeAt(x - px, y - py)) return false;
    }
    return true;
  }

  find(sx: number, sy: number, gx: number, gy: number): number[] | null {
    const n = this.n, goal = this.nearestFree(gx, gy), start = this.nearestFree(sx, sy, 4);
    if (!goal || !start) return null;
    if (this.los(sx, sy, goal.x, goal.y)) return [goal.x, goal.y];
    const si = Math.floor(start.y) * n + Math.floor(start.x), gi = Math.floor(goal.y) * n + Math.floor(goal.x), gcx = gi % n, gcy = (gi - gcx) / n;
    this.stamp++; const st = this.stamp;
    const heap: number[] = [], push = (f: number, i: number): void => {
      heap.push(f, i); let k = heap.length / 2 - 1;
      while (k > 0) { const p = (k - 1) >> 1; if (heap[p * 2] <= heap[k * 2]) break; const tf = heap[p * 2], ti = heap[p * 2 + 1]; heap[p * 2] = heap[k * 2]; heap[p * 2 + 1] = heap[k * 2 + 1]; heap[k * 2] = tf; heap[k * 2 + 1] = ti; k = p; }
    };
    const pop = (): number => {
      const top = heap[1], lf = heap[heap.length - 2], li = heap[heap.length - 1]; heap.length -= 2;
      const m = heap.length / 2;
      if (m > 0) {
        heap[0] = lf; heap[1] = li; let k = 0;
        for (;;) { const a = k * 2 + 1, b = a + 1; let s = k; if (a < m && heap[a * 2] < heap[s * 2]) s = a; if (b < m && heap[b * 2] < heap[s * 2]) s = b; if (s === k) break; const tf = heap[s * 2], ti = heap[s * 2 + 1]; heap[s * 2] = heap[k * 2]; heap[s * 2 + 1] = heap[k * 2 + 1]; heap[k * 2] = tf; heap[k * 2 + 1] = ti; k = s; }
      }
      return top;
    };
    const hOf = (i: number): number => { const x = i % n, y = (i - x) / n, dx = Math.abs(x - gcx), dy = Math.abs(y - gcy); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    this.g[si] = 0; this.seen[si] = st; this.from[si] = -1; push(hOf(si), si);
    let best = si, bestH = hOf(si), found = false, budget = 6000;
    while (heap.length && budget-- > 0) {
      const cur = pop();
      if (this.shut[cur] === st) continue; this.shut[cur] = st;
      if (cur === gi) { found = true; break; }
      const h = hOf(cur); if (h < bestH) { bestH = h; best = cur; }
      const cx = cur % n, cy = (cur - cx) / n;
      for (let d = 0; d < 8; d++) {
        const ox = DX[d], oy = DY[d], nx = cx + ox, ny = cy + oy;
        if (!this.free(nx, ny)) continue;
        if (ox !== 0 && oy !== 0 && (!this.free(cx + ox, cy) || !this.free(cx, cy + oy))) continue;
        const ni = ny * n + nx; if (this.shut[ni] === st) continue;
        const ng = this.g[cur] + (ox !== 0 && oy !== 0 ? Math.SQRT2 : 1);
        if (this.seen[ni] !== st || ng < this.g[ni]) { this.seen[ni] = st; this.g[ni] = ng; this.from[ni] = cur; push(ng + hOf(ni), ni); }
      }
    }
    const end = found ? gi : best;
    const cells: number[] = []; for (let i = end; i !== -1; i = this.from[i]) cells.push(i);
    cells.reverse();
    const pts: number[] = []; for (const c of cells) { const x = c % n; pts.push(x + 0.5, (c - x) / n + 0.5); }
    // 직선으로 갈 수 있는 구간은 한 번에 잇습니다.
    const out: number[] = []; let i = 0; const last = pts.length / 2 - 1;
    while (i < last) {
      let j = last; while (j > i + 1 && !this.los(pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1])) j--;
      out.push(pts[j * 2], pts[j * 2 + 1]); i = j;
    }
    if (found) { out[out.length - 2] = goal.x; out[out.length - 1] = goal.y; }
    return out.length ? out : [goal.x, goal.y];
  }
}
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
interface Pt { x: number; y: number }
