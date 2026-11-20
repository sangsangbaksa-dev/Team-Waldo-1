/** Scalar binary min heap; no tuple allocations per insertion or swap. */
export class MinPriorityQueue {
  private data: number[] = [];
  get size(): number { return this.data.length / 2; }
  push(priority: number, value: number): void {
    const a = this.data; let k = a.length / 2; a.push(priority, value);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (a[2 * p] <= priority) break;
      a[2 * k] = a[2 * p]; a[2 * k + 1] = a[2 * p + 1]; k = p;
    }
    a[2 * k] = priority; a[2 * k + 1] = value;
  }
  pop(): number | undefined {
    const a = this.data;
    if (!a.length) return undefined;
    const result = a[1], value = a.pop()!, priority = a.pop()!;
    const n = a.length / 2;
    if (!n) return result;
    let k = 0;
    for (;;) {
      const l = 2 * k + 1, r = l + 1;
      if (l >= n) break;
      const child = r < n && a[2 * r] < a[2 * l] ? r : l;
      if (a[2 * child] >= priority) break;
      a[2 * k] = a[2 * child]; a[2 * k + 1] = a[2 * child + 1]; k = child;
    }
    a[2 * k] = priority; a[2 * k + 1] = value;
    return result;
  }
}
