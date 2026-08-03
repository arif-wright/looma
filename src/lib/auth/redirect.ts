export const sanitizeInternalPath = (input: string | null | undefined): string | null => {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//')) return null;
  return trimmed;
};

export const resolveNextParam = (value: string | null | undefined, fallback = '/app/home') => {
  return sanitizeInternalPath(value) ?? fallback;
};

export const resolveAuthCallbackUrl = (
  configuredSiteUrl: string | null | undefined,
  currentOrigin: string,
  configuredCallback: string | null | undefined = '/auth/callback'
) => {
  const callback = configuredCallback?.trim() || '/auth/callback';
  if (/^https?:\/\//i.test(callback)) return new URL(callback).toString();

  let origin = currentOrigin;
  const configured = configuredSiteUrl?.trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') origin = parsed.origin;
    } catch {
      // Invalid deployment configuration falls back to the current origin.
    }
  }

  const path = callback.startsWith('/') ? callback : `/${callback}`;
  return new URL(path, `${origin.replace(/\/$/, '')}/`).toString();
};

export const resolveCanonicalDeploymentUrl = (
  configuredSiteUrl: string | null | undefined,
  currentUrl: URL,
  deploymentAliases: readonly string[] = ['looma-omega.vercel.app']
) => {
  if (!deploymentAliases.includes(currentUrl.hostname)) return null;
  try {
    const canonical = new URL(configuredSiteUrl?.trim() || '');
    if (canonical.protocol !== 'https:' || canonical.hostname === currentUrl.hostname) return null;
    return new URL(`${currentUrl.pathname}${currentUrl.search}`, canonical.origin);
  } catch {
    return null;
  }
};
