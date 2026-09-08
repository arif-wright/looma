import { describe, expect, it } from 'vitest';
import { presentRewardHistory, recordedRewardBody } from '../companions/rewardHistory';

describe('reward history presentation', () => {
  it('replaces an automatic claim without changing the saved record or provenance', () => {
    const row = Object.freeze({
      id: 'reward-entry',
      created_at: '2026-09-08T12:00:00Z',
      source_type: 'system',
      body: 'Weeks of repeated return have deepened your bond.',
      meta_json: { generatedBy: 'chapter_reward_reveal', rewardTitle: 'Care Lantern' }
    });
    const presented = presentRewardHistory(row);
    expect(presented.body).toBe(recordedRewardBody('Care Lantern'));
    expect(presented.id).toBe(row.id);
    expect(presented.created_at).toBe(row.created_at);
    expect(presented.meta_json).toBe(row.meta_json);
    expect(row.body).toBe('Weeks of repeated return have deepened your bond.');
  });

  it('preserves personal reflections even with reward metadata', () => {
    const row = {
      source_type: 'post', body: 'This lantern reminds me of our garden.',
      meta_json: { generatedBy: 'chapter_reward_reveal', rewardTitle: 'Care Lantern' }
    };
    expect(presentRewardHistory(row)).toBe(row);
  });

  it('leaves unrelated system entries unchanged', () => {
    const row = { source_type: 'system', body: 'A garden visit.', meta_json: { generatedBy: 'home_reconnect' } };
    expect(presentRewardHistory(row)).toBe(row);
  });

  it('handles legacy reward entries without a title', () => {
    const row = { source_type: 'system', meta_json: { generatedBy: 'chapter_reward_reveal' } };
    expect(presentRewardHistory({ ...row, body: '' }).body).toBe(recordedRewardBody(null));
  });
});
