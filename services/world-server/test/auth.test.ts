import { describe, expect, it } from 'vitest';
import { parseJoinCredential, TicketReplayGuard, verifyWorldTicket } from '../src/auth/ticket.js';
import { createTestTicket, TEST_JOIN_SECRET, TEST_USER_ONE, TEST_USER_TWO } from './ticketFixture.js';

describe('world ticket verification', () => {
  it('derives identity from a valid signed credential', () => {
    const result = verifyWorldTicket(createTestTicket({}, 1_000), TEST_JOIN_SECRET, 1_010);
    expect(result).toEqual({ ok: true, auth: expect.objectContaining({
      userId: TEST_USER_ONE, displayName: 'Aster', handle: 'aster'
    }) });
  });

  it('rejects expired, malformed, missing, and incorrectly signed credentials', () => {
    expect(verifyWorldTicket(createTestTicket({ exp: 1_001 }, 1_000), TEST_JOIN_SECRET, 1_002)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyWorldTicket('not-a-ticket', TEST_JOIN_SECRET)).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyWorldTicket(undefined, TEST_JOIN_SECRET)).toEqual({ ok: false, reason: 'missing' });
    expect(verifyWorldTicket(createTestTicket(), `${TEST_JOIN_SECRET}x`)).toEqual({ ok: false, reason: 'signature' });
  });

  it('rejects client-supplied impersonation fields and one-time ticket replay', () => {
    const ticket = createTestTicket();
    expect(parseJoinCredential({ ticket, userId: TEST_USER_TWO })).toBeNull();
    const verified = verifyWorldTicket(ticket, TEST_JOIN_SECRET);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    const guard = new TicketReplayGuard();
    expect(guard.consume(verified.auth)).toBe(true);
    expect(guard.consume(verified.auth)).toBe(false);
  });
});
