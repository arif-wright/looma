import { describe, expect, it } from 'vitest';
import { resolveAuthCallbackUrl, resolveCanonicalDeploymentUrl } from '$lib/auth/redirect';

describe('auth callback URL', () => {
  it('prefers the configured canonical site over the deployment alias', () => {
    expect(resolveAuthCallbackUrl(
      'https://memvoya.com',
      'https://looma-omega.vercel.app',
      '/auth/callback'
    )).toBe('https://memvoya.com/auth/callback');
  });

  it('supports local fallback and explicit absolute callbacks', () => {
    expect(resolveAuthCallbackUrl(undefined, 'http://localhost:5173', 'auth/callback'))
      .toBe('http://localhost:5173/auth/callback');
    expect(resolveAuthCallbackUrl('https://memvoya.com', 'http://localhost:5173', 'https://auth.example/cb'))
      .toBe('https://auth.example/cb');
  });

  it('redirects only the known Vercel alias to the configured canonical host', () => {
    expect(resolveCanonicalDeploymentUrl(
      'https://memvoya.com',
      new URL('https://looma-omega.vercel.app/app/home?from=login')
    )?.toString()).toBe('https://memvoya.com/app/home?from=login');
    expect(resolveCanonicalDeploymentUrl(
      'https://memvoya.com',
      new URL('https://preview-123.vercel.app/app/home')
    )).toBeNull();
    expect(resolveCanonicalDeploymentUrl(
      'https://memvoya.com',
      new URL('https://memvoya.com/app/home')
    )).toBeNull();
  });
});
