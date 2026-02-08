import { describe, expect, it } from 'vitest';
import { agentRegistry, __resetCompanionAgentRateLimits } from '$lib/agents/registry';
import type { AgentEvent } from '$lib/agents/types';

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
});
