import { describe, expect, it } from 'vitest';
import { decideAlphaAccess, type AlphaGateConfig } from '$lib/server/alphaGateCore';

const baseConfig = (overrides: Partial<AlphaGateConfig> = {}): AlphaGateConfig => ({
  enabled: true,
  allowAll: false,
  allowlistEmails: [],
  allowlistUserIds: [],
  contactEmail: null,
  contactText: 'contact us',
  ...overrides
});

describe('alpha gate', () => {
  it('allows when disabled', () => {
    const decision = decideAlphaAccess({ id: 'u1', email: 'a@b.com' }, baseConfig({ enabled: false }));
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('disabled');
  });

  it('allows allowlisted email', () => {
    const decision = decideAlphaAccess(
      { id: 'u1', email: 'tester@example.com' },
      baseConfig({ allowlistEmails: ['tester@example.com'] })
    );
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('email_allowlist');
  });

  it('allows allowlisted user id', () => {
    const decision = decideAlphaAccess(
      { id: 'u_test', email: 'x@y.com' },
      baseConfig({ allowlistUserIds: ['u_test'] })
    );
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('user_allowlist');
  });

  it('denies when enabled and not allowlisted', () => {
    const decision = decideAlphaAccess(
      { id: 'u1', email: 'x@y.com' },
      baseConfig({ allowlistEmails: ['tester@example.com'] })
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('not_allowlisted');
  });
});
