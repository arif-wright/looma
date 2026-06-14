import { describe, expect, it } from 'vitest';
import {
  canCompleteSharedRest,
  canSpawnCompanion,
  buildReflectionAcknowledgement,
  completedBondContinuityCopy,
  firstBondCheckinCopy,
  firstBondPendingCopy,
  hasCompletedFirstBond,
  clipRememberedReflection,
  isFirstBondPending,
  isFirstBondMoment,
  isFirstBondJournalEntry,
  isRecoverableMemoryFailure,
  isReconnectComplete,
  journalMomentHref,
  journalMomentToContinuity,
  persistedReflectionToContinuity,
  reconcileFirstBondCompletedAt,
  resolveHomeBondPercent,
  selectJournalFreshnessMoment,
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
        upsert: (payload: Record<string, unknown>) => {
          persisted = payload;
          return {
            select: () => ({
              single: async () => ({
                data: { id: 'memory-1', created_at: '2026-06-13T10:00:00.000Z' },
                error: null
              })
            })
          };
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
    expect(result).toMatchObject({
      entry: { id: 'memory-1', created_at: '2026-06-13T10:00:00.000Z' }
    });
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

    expect(persistedReflectionToContinuity(persisted, 'companion-1')).toEqual({
      id: 'memory-1',
      title: 'Mira remembered your check-in',
      body: 'I am nervous, but hopeful.',
      href: '/app/memory?companion=companion-1&moment=memory-1#moment-memory-1',
      persisted: true
    });
    expect(journalMomentHref('companion one', 'memory/1')).toBe(
      '/app/memory?companion=companion%20one&moment=memory%2F1#moment-memory%2F1'
    );
    expect(clipRememberedReflection('  I am   nervous, but hopeful.  ')).toBe('I am nervous, but hopeful.');
  });

  it('reconciles successful first bond state from the same persisted moment shown in Journal', () => {
    const persisted = {
      id: 'memory-1',
      title: 'Mira remembered your check-in',
      body: 'I am nervous, but hopeful.',
      created_at: '2026-06-13T10:00:00.000Z',
      meta_json: { generatedBy: 'home_reconnect' }
    };

    const completedAt = reconcileFirstBondCompletedAt(null, persisted);
    expect(completedAt).toBe(persisted.created_at);
    expect(isFirstBondPending(true, completedAt)).toBe(false);
    expect(persistedReflectionToContinuity(persisted, 'companion-1')?.id).toBe(persisted.id);
    expect(isFirstBondJournalEntry(persisted)).toBe(true);
    expect(isFirstBondJournalEntry({ ...persisted, meta_json: { category: 'checkin' } })).toBe(true);
    expect(isFirstBondJournalEntry({ ...persisted, meta_json: { generatedBy: 'chapter_digest' } })).toBe(false);
  });

  it('never uses pre-first-bond Home copy after persisted or completed bond truth exists', () => {
    const persisted = {
      id: 'memory-1',
      title: 'Mira remembered your check-in',
      body: 'I am nervous, but hopeful.',
      created_at: '2026-06-13T10:00:00.000Z'
    };
    const copy = completedBondContinuityCopy('Mira');

    expect(hasCompletedFirstBond({ hasCompanion: true, firstBondCompletedAt: persisted.created_at })).toBe(true);
    expect(hasCompletedFirstBond({ hasCompanion: true, persistedReflection: persisted })).toBe(true);
    expect(hasCompletedFirstBond({ hasCompanion: true })).toBe(false);
    expect(copy.relationalReason).not.toContain('waiting for your first shared moment');
    expect(copy.title).not.toContain('ready for a first remembered moment');
  });

  it('does not let a stale zero bond score hide first-bond trust and affection', () => {
    expect(resolveHomeBondPercent({ bondScore: 0, affection: 8, trust: 10 })).toBe(9);
    expect(resolveHomeBondPercent({ bondScore: 40, affection: 8, trust: 10 })).toBe(40);
    expect(resolveHomeBondPercent({ bondScore: null, affection: 0, trust: 0 })).toBe(0);
  });

  it('keeps Journal dates consistent and surfaces an exact targeted remembered moment', () => {
    const checkinCopy = firstBondCheckinCopy('Steady');
    expect(checkinCopy).toBe(
      'You arrived feeling steady, and this check-in became part of your shared history.'
    );
    expect(checkinCopy).not.toMatch(/\d{4}-\d{2}-\d{2}/);

    const targeted = { journalEntryId: 'memory-1', generatedBy: 'home_reconnect', title: 'First moment' };
    const generated = { journalEntryId: null, generatedBy: 'chapter_digest', title: 'Generated digest' };
    const other = { journalEntryId: 'memory-2', generatedBy: 'home_reconnect', title: 'Later moment' };

    expect(selectJournalFreshnessMoment([generated, other, targeted], 'memory-1')).toBe(targeted);
    expect(selectJournalFreshnessMoment([generated, other], null)).toBe(other);
  });

  it('makes the first companion response specific to the reflection and emotional state', () => {
    const response = buildReflectionAcknowledgement({
      companionName: 'Mira',
      mood: 'heavy',
      reflection: 'I am worried about tomorrow, but I still want to try.',
      firstBond: true
    });

    expect(response).toContain('I am worried about tomorrow');
    expect(response).toContain('the weight in what you shared');
    expect(response).toContain('the first thing we remember together');
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
        upsert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: { message: 'journal unavailable' } })
          })
        })
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
    expect(isRecoverableMemoryFailure({ error: 'memory_persistence_failed', recoverable: true })).toBe(true);
    expect(isRecoverableMemoryFailure({ error: 'server_error', recoverable: true })).toBe(false);
    expect(firstBondPendingCopy('Mira')).toContain('nothing is being called remembered');
    expect(firstBondPendingCopy('Mira')).toContain('Try saving this moment again');
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
