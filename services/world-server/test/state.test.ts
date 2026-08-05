import { describe, expect, it, vi } from 'vitest';
import { PlayerState } from '../src/rooms/state.js';
import { applyPresenceTransition } from '../src/rooms/presence.js';
import { SlidingWindowRateLimiter } from '../src/security/rateLimiter.js';

describe('presence transitions', () => {
  it('marks drops and reconnects while preserving the player', () => {
    const player = new PlayerState();
    expect(applyPresenceTransition(player, 'drop')).toBe('keep');
    expect(player.connected).toBe(false);
    player.companionPresent = true;
    applyPresenceTransition(player, 'drop');
    expect(player.companionStatus).toBe('reconnecting');
    expect(applyPresenceTransition(player, 'reconnect')).toBe('keep');
    expect(player.connected).toBe(true);
    expect(player.companionStatus).toBe('idle');
    expect(applyPresenceTransition(player, 'leave')).toBe('remove');
  });

  it('serializes only the public companion projection', () => {
    const player = new PlayerState();
    player.companionPresent = true;
    player.companionName = 'Lumi';
    player.companionKind = 'muse';
    player.companionStatus = 'idle';
    const serialized = player.toJSON() as Record<string, unknown>;
    expect(serialized).toMatchObject({
      companionPresent: true, companionName: 'Lumi', companionKind: 'muse', companionStatus: 'idle'
    });
    expect(JSON.stringify(serialized)).not.toMatch(/memory|journal|prompt|trait|owner_id|userId/i);
  });

  it('serializes only an allowed renderer-neutral base body value', () => {
    const player = new PlayerState();
    expect(player.playerBody).toBe('male');
    player.playerBody = 'female';
    expect(player.toJSON()).toMatchObject({ playerBody: 'female' });
  });
});

describe('rate limiter', () => {
  it('rejects excess events and resets after the window', () => {
    vi.useFakeTimers();
    const limiter = new SlidingWindowRateLimiter(2, 1_000);
    expect(limiter.accept()).toBe(true);
    expect(limiter.accept()).toBe(true);
    expect(limiter.accept()).toBe(false);
    vi.advanceTimersByTime(1_001);
    expect(limiter.accept()).toBe(true);
    vi.useRealTimers();
  });
});
