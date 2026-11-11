/**
 * 할당 없는 공간 해시. 매 틱 rebuild로 다시 만들고, query로 주변 후보를 얻는다.
 * query 결과는 "겹치는 셀에 있는 후보"라서, 정확한 거리 판정은 호출하는 쪽에서 한다.
 */
export class SpatialHash {
  private readonly tableSize: number;
  private readonly cellStart: Int32Array;
  private readonly entries: Int32Array;
  private readonly bucketOf: Int32Array;
  private readonly visited: Int32Array = new Int32Array(64);

  constructor(
    readonly cellSize: number,
    capacity: number,
  ) {
    this.tableSize = Math.max(64, capacity * 2);
    this.cellStart = new Int32Array(this.tableSize + 1);
    this.entries = new Int32Array(capacity);
    this.bucketOf = new Int32Array(capacity);
  }

  private bucket(cx: number, cy: number): number {
    const h = Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663);
    return (h >>> 0) % this.tableSize;
  }

  rebuild(x: Float32Array, y: Float32Array, count: number): void {
    const { cellStart, entries, bucketOf, cellSize } = this;
    cellStart.fill(0);
    for (let i = 0; i < count; i++) {
      const b = this.bucket(Math.floor(x[i] / cellSize), Math.floor(y[i] / cellSize));
      bucketOf[i] = b;
      cellStart[b + 1]++;
    }
    for (let b = 0; b < this.tableSize; b++) cellStart[b + 1] += cellStart[b];
    // cellStart[b]를 채우면서 끝 위치로 밀고, 아래에서 다시 되돌린다
    for (let i = 0; i < count; i++) entries[cellStart[bucketOf[i]]++] = i;
    for (let b = this.tableSize; b > 0; b--) cellStart[b] = cellStart[b - 1];
    cellStart[0] = 0;
  }

  /** (x, y) 중심 반경 r에 걸치는 셀의 엔티티 인덱스를 out에 담고 개수를 돌려준다. */
  query(x: number, y: number, r: number, out: Int32Array): number {
    const { cellSize, cellStart, entries, visited } = this;
    const x0 = Math.floor((x - r) / cellSize);
    const x1 = Math.floor((x + r) / cellSize);
    const y0 = Math.floor((y - r) / cellSize);
    const y1 = Math.floor((y + r) / cellSize);
    let n = 0;
    let nv = 0;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const b = this.bucket(cx, cy);
        // 서로 다른 셀이 같은 버킷으로 해시되면 중복으로 담지 않는다
        let seen = false;
        for (let k = 0; k < nv; k++) {
          if (visited[k] === b) {
            seen = true;
            break;
          }
        }
        if (seen) continue;
        if (nv < visited.length) visited[nv++] = b;
        for (let e = cellStart[b]; e < cellStart[b + 1]; e++) {
          if (n >= out.length) return n;
          out[n++] = entries[e];
        }
      }
    }
    return n;
  }
}
