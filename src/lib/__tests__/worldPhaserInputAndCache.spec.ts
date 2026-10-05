import { describe, expect, it } from 'vitest';
import { HeldKeyGuard } from '../game/phaser/heldKeyGuard';
import { SPRITE_CACHE_TARGET_BYTES, spritePageEvictions } from '../game/phaser/spriteCache';

describe('Phaser held-key suppression', () => {
  for (const reason of ['area transition', 'disconnect and reconnect']) {
    it(`requires keyup and a fresh keydown after ${reason}`, () => {
      const guard = new HeldKeyGuard();
      guard.keyDown('KeyD', false, true);
      expect(guard.isDown('KeyD', true)).toBe(true);
      guard.suppressHeld(); // Phaser resetKeys happens alongside this, but native D is still held.
      guard.keyDown('KeyD', true, true); // Native repeat makes Phaser isDown=true again.
      expect(guard.isDown('KeyD', true)).toBe(false);
      guard.keyDown('KeyD', false, true); // Even a mislabeled repeat cannot bypass the missing keyup.
      expect(guard.isDown('KeyD', true)).toBe(false);
      guard.keyUp('KeyD');
      expect(guard.isDown('KeyD', true)).toBe(false); // Stale engine state is insufficient.
      guard.keyDown('KeyD', false, true);
      expect(guard.isDown('KeyD', true)).toBe(true);
    });
  }
  it('does not accept a key first held while inactive when connection resumes', () => {
    const guard = new HeldKeyGuard();
    guard.keyDown('ArrowRight', false, false);
    guard.keyDown('ArrowRight', true, true);
    expect(guard.isDown('ArrowRight', true)).toBe(false);
    guard.keyUp('ArrowRight');
    guard.keyDown('ArrowRight', false, true);
    expect(guard.isDown('ArrowRight', true)).toBe(true);
  });
  it('rejects repeats first observed after focus changes and suppresses held interaction keys', () => {
    const guard = new HeldKeyGuard();
    guard.keyDown('KeyE', true, true);
    expect(guard.isDown('KeyE', true)).toBe(false);
    guard.keyUp('KeyE');
    guard.keyDown('KeyE', false, true);
    expect(guard.isDown('KeyE', true)).toBe(true);
    guard.suppressHeld();
    guard.keyDown('KeyE', true, true);
    expect(guard.isDown('KeyE', true)).toBe(false);
  });
});

describe('Phaser actor atlas byte target', () => {
  const mib = 1024 * 1024;
  const pages = Array.from({ length: 7 }, (_, index) => ({ key: `page-${index}`, bytes: 4 * mib, lastUsed: index }));
  it('immediately evicts oldest inactive pages to a 16 MiB target', () => {
    expect(SPRITE_CACHE_TARGET_BYTES).toBe(16 * mib);
    expect(spritePageEvictions(pages, new Set(['page-0', 'page-6']))).toEqual({ evictions: ['page-1', 'page-2', 'page-3'], remainingBytes: 16 * mib });
  });
  it('preserves currently displayed and active-sequence pages when their live bound exceeds the target', () => {
    const protectedKeys = new Set(pages.slice(0, 5).map((page) => page.key));
    expect(spritePageEvictions(pages, protectedKeys)).toEqual({ evictions: ['page-5', 'page-6'], remainingBytes: 20 * mib });
  });
  it('uses actual decoded bytes rather than assuming equal page sizes', () => {
    expect(spritePageEvictions([{ key: 'short', bytes: 2 * mib, lastUsed: 0 }, { key: 'long', bytes: 4 * mib, lastUsed: 1 }], new Set(['long']), 4 * mib))
      .toEqual({ evictions: ['short'], remainingBytes: 4 * mib });
  });
});
