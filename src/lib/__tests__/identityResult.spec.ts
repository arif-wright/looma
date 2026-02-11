import { describe, expect, it } from 'vitest';
import { sanitizeIdentityResult } from '$lib/server/missions/identityResult';

describe('sanitizeIdentityResult', () => {
  it('keeps only allowlisted fields', () => {
    const result = sanitizeIdentityResult({
      archetype: 'Catalyst',
      traits: ['curious', 'steady'],
      tone: 'warm',
      hidden: 'drop-me'
    });

    expect(result).toEqual({
      archetype: 'Catalyst',
      traits: ['curious', 'steady'],
      tone: 'warm'
    });
  });

  it('returns null without required fields', () => {
    expect(sanitizeIdentityResult({ traits: ['one'] })).toBeNull();
  });
});
