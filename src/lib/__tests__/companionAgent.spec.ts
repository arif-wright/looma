import { describe, expect, it } from 'vitest';
import { agentRegistry, __resetCompanionAgentRateLimits } from '$lib/agents/registry';
import type { AgentEvent } from '$lib/agents/types';
import {
  buildCompanionPromptContext,
  buildCompanionSystemPrompt,
  buildLlmOutcomeRecord,
  classifyCompanionLlmIntensity,
  resolveCompanionPromptProfile
} from '$lib/server/llm/companionText';

const baseEvent = (overrides: Partial<AgentEvent> = {}): AgentEvent => ({
  id: 'evt-1',
  type: 'game.session.start',
  scope: 'game',
  timestamp: '2026-02-08T10:00:00.000Z',
  payload: { gameId: 'runner' },
  context: {
    portableState: { tone: 'warm' }
  },
  meta: {
    sessionId: 'sess-1',
    userId: 'user-1',
    suppressReactions: false
  },
  ...overrides
});

describe('companion agent game reactions', () => {
  it('uses archetype-specific first-bond prompts and the peak response tier', () => {
    const voices = {
      root: 'earthy',
      muse: 'melodic',
      guardian: 'protective',
      spark: 'lively',
      echo: 'memory-holding'
    };

    for (const [archetype, marker] of Object.entries(voices)) {
      const prompt = buildCompanionSystemPrompt(archetype, true);
      expect(resolveCompanionPromptProfile(archetype).archetype).toBe(archetype);
      expect(prompt).toContain(marker);
      expect(prompt).toContain('first remembered moment');
    }

    const event = baseEvent({
      type: 'companion.ritual.listen',
      scope: 'companion',
      payload: {
        companionId: 'root-id',
        companionName: 'Root',
        companionArchetype: 'root',
        firstBond: true,
        chapterTone: 'care',
        relationshipState: { trust: 8, affection: 7 },
        mood: 'calm',
        reflection: 'I want somewhere quiet to begin.'
      }
    });

    expect(classifyCompanionLlmIntensity({ event, context: event.context ?? null })).toBe('peak');
    expect(buildCompanionPromptContext({ event, context: event.context ?? null, intensity: 'peak' })).toMatchObject({
      companionName: 'Root',
      companionArchetype: 'root',
      firstBond: true,
      chapterTone: 'care',
      relationshipState: { trust: 8, affection: 7 }
    });
  });

  it('records enough first-bond outcome metadata to distinguish success and fallback causes', () => {
    expect(
      buildLlmOutcomeRecord({
        userId: 'user-1',
        intensity: 'peak',
        model: 'gpt-5-mini',
        outputChars: 0,
        outcome: 'fallback',
        reason: 'missing_api_key',
        eventType: 'companion.ritual.listen',
        companionId: 'root-id',
        archetype: 'root',
        firstBond: true
      })
    ).toMatchObject({
      outcome: 'fallback',
      reason: 'missing_api_key',
      event_type: 'companion.ritual.listen',
      companion_id: 'root-id',
      archetype: 'root',
      first_bond: true
    });
  });

  it('suppresses reactions when suppressReactions is true', async () => {
    __resetCompanionAgentRateLimits();
    const event = baseEvent({
      meta: {
        sessionId: 'sess-1',
        userId: 'user-1',
        suppressReactions: true
      }
    });
    const result = await agentRegistry.companion.handle(event);
    expect(result.output?.suppressed).toBe(true);
  });

  it('rate-limits pre-run reaction to one per hour', async () => {
    __resetCompanionAgentRateLimits();
    const first = await agentRegistry.companion.handle(
      baseEvent({
        timestamp: '2026-02-08T09:00:00.000Z',
        meta: { sessionId: 'sess-10', userId: 'user-10', suppressReactions: false }
      })
    );
    expect(first.handled).toBe(true);

    const second = await agentRegistry.companion.handle(
      baseEvent({
        timestamp: '2026-02-08T09:30:00.000Z',
        meta: { sessionId: 'sess-11', userId: 'user-10', suppressReactions: false }
      })
    );
    expect((second.output?.reaction as { text?: string } | undefined)?.text).toBeUndefined();
  });

  it('adds reward-aware text for canonical game.complete payloads', async () => {
    __resetCompanionAgentRateLimits();
    const result = await agentRegistry.companion.handle(
      baseEvent({
        type: 'game.complete',
        timestamp: '2026-02-08T11:00:00.000Z',
        payload: {
          gameId: 'runner',
          score: 900,
          rewardsGranted: {
            xpGained: 22,
            shardsGained: 5
          }
        }
      })
    );

    const text = (result.output?.reaction as { text?: string } | undefined)?.text ?? '';
    expect(text).toContain('22');
    expect(text.toLowerCase()).toContain('xp');
    expect(text).toContain('5');
    expect(text.toLowerCase()).toContain('shard');
  });

  it('skips non-canonical game.complete payloads without rewards summary', async () => {
    __resetCompanionAgentRateLimits();
    const result = await agentRegistry.companion.handle(
      baseEvent({
        type: 'game.complete',
        timestamp: '2026-02-08T12:00:00.000Z',
        payload: {
          gameId: 'runner',
          score: 900
        }
      })
    );
    expect((result.output?.reaction as { text?: string } | undefined)?.text).toBeUndefined();
  });

  it('supports mission.start with short deterministic text', async () => {
    __resetCompanionAgentRateLimits();
    const result = await agentRegistry.companion.handle(
      baseEvent({
        type: 'mission.start',
        timestamp: '2026-02-08T12:20:00.000Z',
        payload: {
          missionId: 'm-1',
          missionType: 'action'
        }
      })
    );

    const text = (result.output?.reaction as { text?: string } | undefined)?.text ?? '';
    expect(text.length).toBeGreaterThan(0);
    expect(text.length).toBeLessThan(120);
  });

  it('produces deterministic daily variants for the same user and event type', async () => {
    __resetCompanionAgentRateLimits();
    const one = await agentRegistry.companion.handle(
      baseEvent({
        type: 'mission.complete',
        timestamp: '2026-02-08T09:00:00.000Z',
        payload: {
          missionId: 'm-1',
          rewards: { xpGranted: 8, energyGranted: 3 }
        }
      })
    );
    const two = await agentRegistry.companion.handle(
      baseEvent({
        type: 'mission.complete',
        timestamp: '2026-02-08T22:59:00.000Z',
        payload: {
          missionId: 'm-1',
          rewards: { xpGranted: 8, energyGranted: 3 }
        }
      })
    );

    const firstText = (one.output?.reaction as { text?: string } | undefined)?.text ?? '';
    const secondText = (two.output?.reaction as { text?: string } | undefined)?.text ?? '';
    expect(firstText).toBe(secondText);
  });

  it('supports companion ritual events with short text', async () => {
    __resetCompanionAgentRateLimits();
    const result = await agentRegistry.companion.handle(
      baseEvent({
        type: 'companion.ritual.listen',
        timestamp: '2026-02-08T12:40:00.000Z',
        payload: {
          companionId: 'muse',
          ritualKey: 'listen'
        }
      })
    );

    const text = (result.output?.reaction as { text?: string } | undefined)?.text ?? '';
    expect(text.length).toBeGreaterThan(0);
    expect(text.length).toBeLessThan(120);
  });
});
