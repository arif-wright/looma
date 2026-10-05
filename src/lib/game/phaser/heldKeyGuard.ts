const WORLD_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE']);

/** Physical key state survives Phaser resetKeys. Only an actual keyup releases suppression. */
export class HeldKeyGuard {
  private readonly held = new Set<string>();
  private readonly suppressed = new Set<string>();

  keyDown(code: string, repeat: boolean, active: boolean) {
    if (!WORLD_KEYS.has(code)) return;
    // Repeats first observed after focus/scene changes never count as fresh input.
    if (!active || (repeat && !this.held.has(code))) this.suppressed.add(code);
    this.held.add(code);
  }

  keyUp(code: string) { this.held.delete(code); this.suppressed.delete(code); }

  suppressHeld() { for (const code of this.held) this.suppressed.add(code); }

  isDown(code: string, phaserIsDown: boolean) {
    return phaserIsDown && this.held.has(code) && !this.suppressed.has(code);
  }
}
