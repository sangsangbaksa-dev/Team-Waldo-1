export function acceptsGameplayInput(state: {
  phase: string; closed: boolean; paused: boolean; hasMatch: boolean; overlay: boolean;
}): boolean {
  return state.hasMatch && !state.closed && !state.paused && !state.overlay
    && (state.phase === 'play' || state.phase === 'countdown');
}

export class TouchButtons {
  private readonly owners = new Map<string, number>();

  press(action: string, id: number): boolean {
    if (this.owners.has(action) || [...this.owners.values()].includes(id)) return false;
    this.owners.set(action, id);
    return true;
  }

  owns(action: string, id: number): boolean { return this.owners.get(action) === id; }

  release(id: number): string | undefined {
    for (const [action, owner] of this.owners) {
      if (owner !== id) continue;
      this.owners.delete(action);
      return action;
    }
    return undefined;
  }

  clear(): void { this.owners.clear(); }
}
