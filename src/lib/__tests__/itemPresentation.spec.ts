import { describe, expect, it } from 'vitest';
import { capabilityLabel, itemSourceDetail, itemSourceLabel, sanctuarySlotLabel } from '$lib/items/presentation';

describe('item presentation', () => {
  it('explains meaningful item sources', () => {
    expect(itemSourceLabel('care_milestone')).toBe('Earned through shared care');
    expect(itemSourceLabel('chapter_reward', 'mission')).toBe('Formed during a mission chapter');
    expect(itemSourceLabel('chapter_reward', 'bond')).toBe('Formed as your bond deepened');
  });

  it('uses the most useful provenance detail', () => {
    expect(itemSourceDetail({ title: 'Title', body: 'Body', reason: 'Reason' })).toBe('Reason');
    expect(itemSourceDetail({ title: 'Title', body: 'Body' })).toBe('Body');
  });

  it('turns capabilities and slots into user-facing labels', () => {
    expect(capabilityLabel('interactive')).toBe('Shared interaction');
    expect(capabilityLabel('placeable')).toBe('Sanctuary object');
    expect(sanctuarySlotLabel('center_glade')).toBe('Center Glade');
  });
});
