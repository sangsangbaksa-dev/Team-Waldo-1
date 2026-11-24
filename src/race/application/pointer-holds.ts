export class PointerHolds<Action> {
  private readonly sources = new Map<Action, Set<number>>();

  press(action: Action, pointerId: number): void {
    let ids = this.sources.get(action);
    if (!ids) this.sources.set(action, ids = new Set());
    ids.add(pointerId);
  }

  release(action: Action, pointerId: number): void {
    const ids = this.sources.get(action);
    if (!ids) return;
    ids.delete(pointerId);
    if (!ids.size) this.sources.delete(action);
  }

  active(action: Action): boolean {
    return this.sources.has(action);
  }

  clear(): void {
    this.sources.clear();
  }
}
