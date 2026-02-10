import { env } from '$env/dynamic/private';
import { decideAlphaAccess, parseBool, parseCsv, type AlphaGateConfig } from '$lib/server/alphaGateCore';

export const readAlphaGateConfig = (): AlphaGateConfig => {
  const enabled = parseBool(env.ALPHA_GATE_ENABLED, false);
  const allowAll = parseBool(env.ALPHA_ALLOW_ALL, false);

  // Always include admin emails as a safety net.
  const adminEmails = parseCsv(env.ADMIN_EMAILS);
  const allowlistEmails = Array.from(new Set([...parseCsv(env.ALPHA_ALLOWLIST_EMAILS), ...adminEmails]));
  const allowlistUserIds = parseCsv(env.ALPHA_ALLOWLIST_USER_IDS);

  const contactEmail = (env.ALPHA_CONTACT_EMAIL ?? '').trim() || null;
  const contactText =
    (env.ALPHA_CONTACT_TEXT ?? '').trim() ||
    'If you think you should have access, contact the Looma team.';

  return {
    enabled,
    allowAll,
    allowlistEmails,
    allowlistUserIds,
    contactEmail,
    contactText
  };
};

export const alphaGate = (user: { id: string; email?: string | null }) =>
  decideAlphaAccess(user, readAlphaGateConfig());

