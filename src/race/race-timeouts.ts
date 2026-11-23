// SPEED RUSH — timers that belong to one race session, not the game module.
// Every delayed result card/fallback is cancelled when its room is left.
export class RaceTimeouts {
  private pending = new Set<number>();

  schedule(delayMs: number, callback: () => void): void {
    const id = window.setTimeout(() => {
      this.pending.delete(id);
      callback();
    }, delayMs);
    this.pending.add(id);
  }

  clear(): void {
    for (const id of this.pending) window.clearTimeout(id);
    this.pending.clear();
  }

  get size(): number { return this.pending.size; }
}
