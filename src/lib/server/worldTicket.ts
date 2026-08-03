import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PublicWorldCompanion } from '$lib/server/worldCompanion';

export const WORLD_TICKET_ISSUER = 'memvoya-web';
export const WORLD_TICKET_AUDIENCE = 'memvoya-world';
export const WORLD_TICKET_ROOM = 'wilds';
export const WORLD_TICKET_PROTOCOL = 1;
export const WORLD_TICKET_TTL_SECONDS = 45;

export type SafeWorldIdentity = { displayName: string; handle: string | null };
export type WorldTicketClaims = {
  iss: typeof WORLD_TICKET_ISSUER;
  aud: typeof WORLD_TICKET_AUDIENCE;
  room: typeof WORLD_TICKET_ROOM;
  protocol: typeof WORLD_TICKET_PROTOCOL;
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  identity: SafeWorldIdentity;
  companion: PublicWorldCompanion;
};

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (input: string, secret: string) => createHmac('sha256', secret).update(input).digest('base64url');

export const normalizeWorldIdentity = (value: {
  display_name?: string | null;
  handle?: string | null;
}): SafeWorldIdentity => {
  const displayName = value.display_name?.trim().slice(0, 40);
  const handle = value.handle?.trim().replace(/^@/, '').slice(0, 30) || null;
  return { displayName: displayName || (handle ? `@${handle}` : 'Explorer'), handle };
};

export const issueWorldTicket = (
  userId: string,
  identity: SafeWorldIdentity,
  companion: PublicWorldCompanion,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
) => {
  if (secret.length < 32) throw new Error('WORLD_JOIN_SECRET must contain at least 32 characters');
  const claims: WorldTicketClaims = {
    iss: WORLD_TICKET_ISSUER,
    aud: WORLD_TICKET_AUDIENCE,
    room: WORLD_TICKET_ROOM,
    protocol: WORLD_TICKET_PROTOCOL,
    sub: userId,
    jti: randomUUID(),
    iat: nowSeconds,
    exp: nowSeconds + WORLD_TICKET_TTL_SECONDS,
    identity,
    companion
  };
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  return { ticket: `${unsigned}.${sign(unsigned, secret)}`, expiresAt: claims.exp };
};

// Kept private to the issuer's tests; verification authority lives in the world service.
export const signaturesMatchForTest = (ticket: string, secret: string) => {
  const [header, payload, signature] = ticket.split('.');
  if (!header || !payload || !signature) return false;
  const actual = Buffer.from(signature);
  const expected = Buffer.from(sign(`${header}.${payload}`, secret));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
