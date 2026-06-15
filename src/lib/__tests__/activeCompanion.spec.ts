import { describe, expect, it } from 'vitest';
import {
  resolveCanonicalActiveCompanion,
  resolveCanonicalActiveCompanionId
} from '$lib/companions/activeCompanion';

describe('canonical active companion resolution', () => {
  const companions = [
    { id: 'first', is_active: true },
    { id: 'second', is_active: true }
  ];

  it('makes the protected-layout companion authoritative for Home and Companions', () => {
    const protectedActive = companions[1]!;

    expect(resolveCanonicalActiveCompanion(protectedActive, companions)?.id).toBe('second');
    expect(resolveCanonicalActiveCompanionId(protectedActive.id, companions)).toBe('second');
  });

  it('uses the database active row only when no protected-layout resolution exists', () => {
    expect(resolveCanonicalActiveCompanion(null, companions)?.id).toBe('first');
    expect(resolveCanonicalActiveCompanionId(null, companions)).toBe('first');
  });
});
