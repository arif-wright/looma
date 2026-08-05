import { createHmac, timingSafeEqual } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISSUER = 'memvoya-web';
const AUDIENCE = 'memvoya-world';
const ROOM = 'wilds';
const PROTOCOL = 1;
const MAX_TTL_SECONDS = 60;
export type PlayerBody = 'male' | 'female';

export type WorldAuth = {
  userId: string;
  ticketId: string;
  expiresAt: number;
  displayName: string;
  handle: string | null;
  playerBody: PlayerBody;
  companion: {
    present: boolean;
    name: string;
    kind: string;
    availability: 'available' | 'unavailable';
  };
};

export type TicketFailure = 'missing' | 'malformed' | 'signature' | 'expired' | 'claims' | 'replayed';
export type TicketResult = { ok: true; auth: WorldAuth } | { ok: false; reason: TicketFailure };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const sign = (input: string, secret: string) => createHmac('sha256', secret).update(input).digest('base64url');
const cleanText = (value: unknown, max: number) =>
  typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)
    ? value : null;

export const verifyWorldTicket = (
  ticket: unknown,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): TicketResult => {
  if (typeof ticket !== 'string' || ticket.length === 0) return { ok: false, reason: 'missing' };
  if (ticket.length > 2_048) return { ok: false, reason: 'malformed' };
  const parts = ticket.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) return { ok: false, reason: 'malformed' };

  const expected = Buffer.from(sign(`${encodedHeader}.${encodedPayload}`, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, reason: 'signature' };
  }

  let header: unknown;
  let claims: unknown;
  try {
    header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!isPlainObject(header) || header.alg !== 'HS256' || header.typ !== 'JWT' || !isPlainObject(claims)) {
    return { ok: false, reason: 'claims' };
  }
  const identity = claims.identity;
  const companion = claims.companion;
  if (!isPlainObject(identity) || !isPlainObject(companion)) return { ok: false, reason: 'claims' };
  if (Object.keys(companion).some((key) => !['present', 'name', 'kind', 'availability'].includes(key))) {
    return { ok: false, reason: 'claims' };
  }
  const displayName = cleanText(identity.displayName, 40);
  const handle = identity.handle === null ? null : cleanText(identity.handle, 30);
  const companionName = companion.present === true ? cleanText(companion.name, 32) : '';
  const companionKind = companion.present === true ? cleanText(companion.kind, 24) : '';
  const companionAvailable = companion.availability === 'available';
  const playerBody = claims.playerBody === undefined ? 'male' : claims.playerBody;
  if (
    claims.iss !== ISSUER || claims.aud !== AUDIENCE || claims.room !== ROOM ||
    claims.protocol !== PROTOCOL || !UUID.test(String(claims.sub)) || !UUID.test(String(claims.jti)) ||
    !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) || !displayName ||
    (identity.handle !== null && !handle) || typeof companion.present !== 'boolean' ||
    !['available', 'unavailable'].includes(String(companion.availability)) ||
    (companion.present && (!companionName || !companionKind || !companionAvailable)) ||
    !['male', 'female'].includes(String(playerBody))
  ) return { ok: false, reason: 'claims' };
  const iat = claims.iat as number;
  const exp = claims.exp as number;
  if (exp <= nowSeconds) return { ok: false, reason: 'expired' };
  if (iat > nowSeconds + 5 || exp <= iat || exp - iat > MAX_TTL_SECONDS) {
    return { ok: false, reason: 'claims' };
  }
  return { ok: true, auth: {
    userId: String(claims.sub), ticketId: String(claims.jti), expiresAt: exp,
    displayName, handle, playerBody: playerBody as PlayerBody,
    companion: {
      present: companion.present,
      name: companionName ?? '',
      kind: companionKind ?? '',
      availability: companionAvailable ? 'available' : 'unavailable'
    }
  } };
};

export class TicketReplayGuard {
  private readonly consumed = new Map<string, number>();

  consume(auth: WorldAuth, nowSeconds = Math.floor(Date.now() / 1000)) {
    for (const [id, expiry] of this.consumed) if (expiry <= nowSeconds) this.consumed.delete(id);
    if (this.consumed.has(auth.ticketId)) return false;
    this.consumed.set(auth.ticketId, auth.expiresAt);
    return true;
  }
}

export const worldTicketReplayGuard = new TicketReplayGuard();

export const parseJoinCredential = (options: unknown) => {
  if (!isPlainObject(options) || Object.keys(options).some((key) => key !== 'ticket')) return null;
  return options.ticket;
};
