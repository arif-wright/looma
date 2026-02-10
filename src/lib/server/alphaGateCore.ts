export type AlphaGateDecision = {
  enabled: boolean;
  allowed: boolean;
  reason: string;
  contactEmail: string | null;
  contactText: string;
};

export type AlphaGateConfig = {
  enabled: boolean;
  allowAll: boolean;
  allowlistEmails: string[];
  allowlistUserIds: string[];
  contactEmail: string | null;
  contactText: string;
};

export const parseBool = (value: string | undefined, fallback = false) => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

export const parseCsv = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

export const decideAlphaAccess = (
  user: { id: string; email?: string | null },
  config: AlphaGateConfig
): AlphaGateDecision => {
  if (!config.enabled) {
    return {
      enabled: false,
      allowed: true,
      reason: 'disabled',
      contactEmail: config.contactEmail,
      contactText: config.contactText
    };
  }

  if (config.allowAll) {
    return {
      enabled: true,
      allowed: true,
      reason: 'allow_all',
      contactEmail: config.contactEmail,
      contactText: config.contactText
    };
  }

  // Prevent accidental lockout due to misconfiguration.
  if (config.allowlistEmails.length === 0 && config.allowlistUserIds.length === 0) {
    console.warn('[alpha] gate enabled but allowlist is empty; allowing all users');
    return {
      enabled: true,
      allowed: true,
      reason: 'empty_allowlist',
      contactEmail: config.contactEmail,
      contactText: config.contactText
    };
  }

  const email = (user.email ?? '').trim().toLowerCase();
  const allowedEmails = config.allowlistEmails.map((v) => v.toLowerCase());
  if (email && allowedEmails.includes(email)) {
    return {
      enabled: true,
      allowed: true,
      reason: 'email_allowlist',
      contactEmail: config.contactEmail,
      contactText: config.contactText
    };
  }

  if (config.allowlistUserIds.includes(user.id)) {
    return {
      enabled: true,
      allowed: true,
      reason: 'user_allowlist',
      contactEmail: config.contactEmail,
      contactText: config.contactText
    };
  }

  return {
    enabled: true,
    allowed: false,
    reason: 'not_allowlisted',
    contactEmail: config.contactEmail,
    contactText: config.contactText
  };
};

