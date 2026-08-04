import { describe, expect, it } from 'vitest';
import { selectWorldRenderer } from '$lib/game/rendererSelection';

describe('world renderer selection', () => {
  it('defaults missing and invalid values to Phaser', () => {
    expect(selectWorldRenderer(undefined)).toBe('phaser');
    expect(selectWorldRenderer('webgl')).toBe('phaser');
  });

  it('selects either supported renderer without case sensitivity', () => {
    expect(selectWorldRenderer(' phaser ')).toBe('phaser');
    expect(selectWorldRenderer(' THREE ')).toBe('three');
  });
});
