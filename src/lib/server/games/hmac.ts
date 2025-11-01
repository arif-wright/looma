import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '$env/dynamic/private';

const resolveSecret = () => {
  const secret = env.GAME_SIGNING_SECRET ?? env.VITE_GAME_SIGNING_SECRET ?? 'dev-secret';
  if (!secret || secret.trim().length === 0) {
    throw new Error('GAME_SIGNING_SECRET is not configured');
  }
  return secret;
};

const encoder = new TextEncoder();

const secretMemo: { value?: string } = {};

const getSecret = () => {
  if (!secretMemo.value) {
    secretMemo.value = resolveSecret();
  }
  return secretMemo.value;
};

export const buildSignaturePayload = (sessionId: string, score: number, durationMs: number, nonce: string) =>
  `${sessionId}|${score}|${durationMs}|${nonce}`;

export const signGamePayload = (payload: string) =>
  createHmac('sha256', getSecret()).update(payload).digest('hex');

export const verifyGameSignature = (signature: string, payload: string): boolean => {
  if (!signature) return false;
  try {
    const expected = signGamePayload(payload);
    const sigBuffer = encoder.encode(signature);
    const expectedBuffer = encoder.encode(expected);
    if (sigBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch (err) {
    console.error('[games:hmac] verify failed', err);
    return false;
  }
};
