import { describe, expect, it } from 'vitest';
import { load } from '../../routes/app/+page.server';

describe('/app onboarding gate', () => {
  it('redirects to / when unauthenticated', async () => {
    try {
      await load({ locals: { user: null }, cookies: { get: () => undefined } } as any);
      throw new Error('expected redirect');
    } catch (err: any) {
      expect(err?.status).toBe(302);
      expect(err?.location).toBe('/');
    }
  });

  it('redirects to /app/home when already onboarded', async () => {
    try {
      await load({
        locals: { user: { id: 'u1' } },
        cookies: { get: (key: string) => (key === 'looma_onboarding_v1' ? '1' : undefined) }
      } as any);
      throw new Error('expected redirect');
    } catch (err: any) {
      expect(err?.status).toBe(302);
      expect(err?.location).toBe('/app/home');
    }
  });

  it('returns showOnboarding when not onboarded', async () => {
    const data = await load({
      locals: { user: { id: 'u1' } },
      cookies: { get: () => undefined }
    } as any);
    expect(data).toEqual({ showOnboarding: true });
  });
});

