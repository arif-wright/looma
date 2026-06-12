import { describe, expect, it } from 'vitest';
import { buildSanctuaryReaction, buildSharedRestReaction, isSanctuarySlot } from '$lib/sanctuary';

describe('sanctuary helpers', () => {
  it('accepts only known placement slots', () => {
    expect(isSanctuarySlot('center_glade')).toBe(true);
    expect(isSanctuarySlot('somewhere_else')).toBe(false);
  });

  it('creates a companion-centered reaction', () => {
    expect(buildSanctuaryReaction('Mira', { title: 'Memory Bloom', tone: 'memory' })).toContain('Mira');
    expect(buildSanctuaryReaction('Mira', { title: 'Memory Bloom', tone: 'memory' })).toContain('Memory Bloom');
  });

  it('describes a shared rest using the restored spark', () => {
    const reaction = buildSharedRestReaction('Mira', 12, 47);
    expect(reaction).toContain('Mira');
    expect(reaction).toContain('35 spark');
  });
});
