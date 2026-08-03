import { describe, expect, it } from 'vitest';
import { issueWorldTicket, normalizeWorldIdentity, signaturesMatchForTest } from '$lib/server/worldTicket';

const SECRET = 'test-world-ticket-secret-at-least-32-characters';

describe('world ticket issuer', () => {
  it('signs a short-lived ticket without accepting identity input from the browser', () => {
    const issued = issueWorldTicket('11111111-1111-4111-8111-111111111111', { displayName: 'Aster', handle: 'aster' }, { present: false, name: '', kind: '', availability: 'unavailable' }, SECRET, 100);
    expect(issued.expiresAt).toBe(145);
    expect(signaturesMatchForTest(issued.ticket, SECRET)).toBe(true);
    expect(issued.ticket).not.toContain('Aster');
  });

  it('bounds the safe presentation projection', () => {
    expect(normalizeWorldIdentity({ display_name: ' ', handle: '@traveler' })).toEqual({
      displayName: '@traveler', handle: 'traveler'
    });
    expect(normalizeWorldIdentity({})).toEqual({ displayName: 'Explorer', handle: null });
  });
});
