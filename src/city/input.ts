export class HeldPointer {
  private owner: number | null = null;

  get active(): boolean { return this.owner !== null; }

  press(id: number): boolean {
    if (this.owner !== null) return false;
    this.owner = id;
    return true;
  }

  release(id: number): void {
    if (this.owner === id) this.clear();
  }

  clear(): void { this.owner = null; }
}

export function primaryReleased(event: { pointerType: string; type: string; buttons: number }): boolean {
  return event.pointerType !== 'touch' && (event.type === 'pointercancel' || event.type === 'lostpointercapture' || (event.buttons & 1) === 0);
}
