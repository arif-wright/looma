import { describe, expect, it } from 'vitest';
import {
  canCompleteSharedRest,
  canSpawnCompanion,
  clipRememberedReflection,
  isFirstBondPending,
  isFirstBondMoment,
  isReconnectComplete,
  journalMomentToContinuity,
  persistedReflectionToContinuity,
  shouldRedirectToBondGenesis
} from '$lib/launch/proofIntegrity';
import { LAUNCH_PROOF_EVENTS, PREMIUM_CONVERSION_EVENTS } from '$lib/launch/funnels';
import { LAUNCH_PRIMARY_PATHS, LAUNCH_SUPPORTING_PATHS } from '$lib/launch/navigation';
import { appendCompanionJournalEntry } from '$lib/server/companions/journal';
import { recordAnalyticsEvent } from '$lib/server/analytics';

describe('launch proof integrity', () => {
  it('connects onboarding to a durable first check-in without reclassifying later daily check-ins', async () => {
    expect(isFirstBondMoment(true, false)).toBe(true);
    expect(isFirstBondMoment(true, true)).toBe(false);
    expect(isFirstBondMoment(false, false)).toBe(false);
    expect(isFirstBondPending(true, null)).toBe(true);
    expect(isFirstBondPending(true, '2026-06-13T12:00:00.000Z')).toBe(false);
    expect(isFirstBondPending(false, null)).toBe(false);

    let persisted: Record<string, unknown> | null = null;
    const client = {
      from: () => ({
        upsert: async (payload: Record<string, unknown>) => {
          persisted = payload;
          return { error: null };
        }
      })
    };
    const result = await appendCompanionJournalEntry(client as any, {
      ownerId: 'user-1',
      companionId: 'companion-1',
      sourceType: 'system',
      sourceId: 'checkin-1',
      title: 'Mira remembered your check-in',
      body: 'I am nervous, but hopeful.',
      meta: { generatedBy: 'home_reconnect' },
      rebuildSummary: false
    });

    expect(result.ok).toBe(true);
    expect(persisted).toMatchObject({
      owner_id: 'user-1',
      companion_id: 'companion-1',
      source_id: 'checkin-1',
      body: 'I am nervous, but hopeful.'
    });
  });

  it('returns durable remembered continuity from a persisted reflection row', () => {
    const persisted = JSON.parse(
      JSON.stringify({
        id: 'memory-1',
        title: 'Mira remembered your check-in',
        body: 'I am nervous, but hopeful.',
        created_at: '2026-06-13T10:00:00.000Z',
        meta_json: { generatedBy: 'home_reconnect' }
      })
    );

    expect(persistedReflectionToContinuity(persisted)).toEqual({
      id: 'memory-1',
      title: 'Mira remembered your check-in',
      body: 'I am nervous, but hopeful.',
      href: '/app/memory',
      persisted: true
    });
    expect(clipRememberedReflection('  I am   nervous, but hopeful.  ')).toBe('I am nervous, but hopeful.');
  });

  it('uses a journal moment headline rather than its internal category label on Home', () => {
    const continuity = journalMomentToContinuity({
      id: 'checkin-1',
      label: 'Check-in',
      title: 'Mira remembers how you arrived',
      body: 'You last arrived feeling hopeful.',
      href: '/app/memory?companion=companion-1'
    });

    expect(continuity).toMatchObject({
      title: 'Mira remembers how you arrived',
      body: 'You last arrived feeling hopeful.'
    });
    expect(continuity?.title).not.toBe('Check-in');
  });

  it('fails open when companion count cannot be confirmed', () => {
    expect(shouldRedirectToBondGenesis(0, false)).toBe(true);
    expect(shouldRedirectToBondGenesis(null, true)).toBe(false);
    expect(shouldRedirectToBondGenesis(0, true)).toBe(false);
    expect(shouldRedirectToBondGenesis(1, false)).toBe(false);
  });

  it('fails closed when companion spawn eligibility cannot be confirmed', () => {
    expect(canSpawnCompanion(0, false)).toBe(true);
    expect(canSpawnCompanion(null, true)).toBe(false);
    expect(canSpawnCompanion(0, true)).toBe(false);
    expect(canSpawnCompanion(1, false)).toBe(false);
  });

  it('keeps reconnect incomplete until its Journal memory persists', () => {
    expect(isReconnectComplete(false)).toBe(false);
    expect(isReconnectComplete(true)).toBe(true);
    expect(isFirstBondMoment(true, false)).toBe(true);
  });

  it('treats a failed first-bond Journal write as recoverable and incomplete', async () => {
    const client = {
      from: () => ({
        upsert: async () => ({ error: { message: 'journal unavailable' } })
      })
    };
    const result = await appendCompanionJournalEntry(client as any, {
      ownerId: 'user-1',
      companionId: 'companion-1',
      sourceType: 'system',
      sourceId: 'checkin-1',
      title: 'Mira remembered your check-in',
      body: 'I am nervous, but hopeful.',
      meta: { generatedBy: 'home_reconnect' },
      rebuildSummary: false
    });

    expect(result.ok).toBe(false);
    expect(isReconnectComplete(result.ok)).toBe(false);
    expect(isFirstBondMoment(true, result.ok)).toBe(true);
  });

  it('defines measurable launch and premium funnels', () => {
    expect(LAUNCH_PROOF_EVENTS).toEqual(
      expect.arrayContaining(['first_checkin_completed', 'first_memory_persisted', 'return_memory_shown'])
    );
    expect(PREMIUM_CONVERSION_EVENTS).toEqual(
      expect.arrayContaining(['premium_offer_viewed', 'premium_checkout_started', 'premium_subscription_converted'])
    );
  });

  it('keeps Messages supporting rather than primary for launch', () => {
    expect(LAUNCH_PRIMARY_PATHS).not.toContain('/app/messages');
    expect(LAUNCH_SUPPORTING_PATHS).toContain('/app/messages');
  });

  it('only surfaces shared rest when the Moss Seat is usable and off cooldown', () => {
    const placements = [{ item: { item_key: 'care-moss-seat', capabilities: ['placeable', 'interactive'] } }];
    const now = Date.parse('2026-06-13T12:00:00.000Z');

    expect(canCompleteSharedRest(placements, null, now)).toBe(true);
    expect(canCompleteSharedRest(placements, '2026-06-13T10:00:00.000Z', now)).toBe(false);
    expect(canCompleteSharedRest(placements, '2026-06-13T07:00:00.000Z', now)).toBe(true);
    expect(canCompleteSharedRest([], null, now)).toBe(false);
  });

  it('writes launch analytics to both the legacy and required analytics fields', async () => {
    let inserted: Record<string, unknown> | null = null;
    const client = {
      from: () => ({
        insert: async (payload: Record<string, unknown>) => {
          inserted = payload;
          return { error: null };
        }
      })
    };

    await recordAnalyticsEvent(client as any, 'user-1', 'first_memory_shown', {
      surface: 'home',
      sessionId: '00000000-0000-4000-8000-000000000001',
      payload: { memoryId: 'memory-1' }
    });

    expect(inserted).toMatchObject({
      event_type: 'first_memory_shown',
      kind: 'first_memory_shown',
      session_id: '00000000-0000-4000-8000-000000000001',
      surface: 'home',
      payload: { memoryId: 'memory-1' },
      meta: { memoryId: 'memory-1' }
    });
  });
});
