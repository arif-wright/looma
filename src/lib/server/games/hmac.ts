import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '$env/dynamic/private';

const encoder = new TextEncoder();

const resolveSecret = () => {
  const secret = env.GAME_SIGNING_SECRET ?? env.VITE_GAME_SIGNING_SECRET ?? '';
  if (!secret || secret.trim().length === 0) {
    throw new Error('GAME_SIGNING_SECRET is not configured');
  }
  return secret;
};

let cachedSecret: string | null = null;

export const getSigningSecret = () => {
  if (!cachedSecret) {
    cachedSecret = resolveSecret();
  }
  return cachedSecret;
};

export const buildSignaturePayload = (
  sessionId: string,
  score: number,
  durationMs: number,
  nonce: string
) => `${sessionId}|${score}|${durationMs}|${nonce}`;

export const makeSignature = (
  sessionId: string,
  score: number,
  durationMs: number,
  nonce: string,
  secret = getSigningSecret()
) => {
  const payload = buildSignaturePayload(sessionId, score, durationMs, nonce);
  return createHmac('sha256', secret).update(payload).digest('hex');
};

export const verifySignature = (
  payload: string,
  signature: string,
  secret = getSigningSecret()
) => {
  if (!signature) return false;
  try {
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    const sigBuffer = encoder.encode(signature);
    const expectedBuffer = encoder.encode(expected);
    if (sigBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch (err) {
    console.error('[games:hmac] verify failed', err);
    return false;
  }
};
