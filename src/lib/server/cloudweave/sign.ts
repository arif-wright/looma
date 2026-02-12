import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getCloudWeaveConfig } from '$lib/server/cloudweave/config';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type SignedCloudWeaveBundle<T = Record<string, unknown>> = {
  payload: T;
  signature: string;
  signedAt: string;
};

const canonicalize = (input: JsonValue): JsonValue => {
  if (Array.isArray(input)) return input.map((entry) => canonicalize(entry));
  if (!input || typeof input !== 'object') return input;
  const obj = input as Record<string, JsonValue>;
  const keys = Object.keys(obj).sort();
  const normalized: Record<string, JsonValue> = {};
  for (const key of keys) normalized[key] = canonicalize(obj[key] ?? null);
  return normalized;
};

const stableStringify = (input: unknown) => JSON.stringify(canonicalize((input ?? null) as JsonValue));

const computeSignature = (payload: unknown, secret: string) => {
  const canonical = stableStringify(payload);
  return createHmac('sha256', secret).update(canonical).digest('hex');
};

export const hashSignature = (signature: string) => createHash('sha256').update(signature).digest('hex');

export const signExport = <T>(payload: T): SignedCloudWeaveBundle<T> => {
  const { signingSecret } = getCloudWeaveConfig();
  if (!signingSecret) {
    throw new Error('CloudWeave signing secret is not configured');
  }
  return {
    payload,
    signature: computeSignature(payload, signingSecret),
    signedAt: new Date().toISOString()
  };
};

export const verifyExport = (
  bundle: SignedCloudWeaveBundle | null | undefined
): { ok: true } | { ok: false; reason: string } => {
  const { signingSecret } = getCloudWeaveConfig();
  if (!signingSecret) return { ok: false, reason: 'missing_signing_secret' };
  if (!bundle || typeof bundle !== 'object') return { ok: false, reason: 'invalid_bundle' };
  if (!bundle.payload || typeof bundle.signature !== 'string' || typeof bundle.signedAt !== 'string') {
    return { ok: false, reason: 'invalid_bundle_shape' };
  }
  if (!/^[a-f0-9]{64}$/i.test(bundle.signature)) return { ok: false, reason: 'invalid_signature_format' };

  const expected = computeSignature(bundle.payload, signingSecret);
  const given = bundle.signature;
  const expectedBuf = Buffer.from(expected, 'hex');
  const givenBuf = Buffer.from(given, 'hex');
  if (expectedBuf.length !== givenBuf.length) return { ok: false, reason: 'signature_mismatch' };
  if (!timingSafeEqual(expectedBuf, givenBuf)) return { ok: false, reason: 'signature_mismatch' };
  return { ok: true };
};
