import { createHmac, randomUUID } from 'node:crypto';

export const TEST_JOIN_SECRET = 'test-world-ticket-secret-at-least-32-characters';
export const TEST_USER_ONE = '11111111-1111-4111-8111-111111111111';
export const TEST_USER_TWO = '22222222-2222-4222-8222-222222222222';

export const createTestTicket = (overrides: Record<string, unknown> = {}, now = Math.floor(Date.now() / 1000)) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const claims = {
    iss: 'memvoya-web', aud: 'memvoya-world', room: 'wilds', protocol: 1,
    sub: TEST_USER_ONE, jti: randomUUID(), iat: now, exp: now + 45,
    identity: { displayName: 'Aster', handle: 'aster' },
    companion: { present: true, name: 'Lumi', kind: 'muse', availability: 'available' },
    ...overrides
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const signature = createHmac('sha256', TEST_JOIN_SECRET).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
};
