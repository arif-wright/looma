import { expect, request, test } from '@playwright/test';
import { BASE_URL } from '../fixtures/env';

test.describe('API safe error payloads', () => {
  test('unauthorized endpoints return a calm message (xp)', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const res = await ctx.post('/api/xp', { data: { amount: 1 } });
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error?: unknown; message?: unknown };
    expect(typeof body.message).toBe('string');
    expect(String(body.message)).toContain('session expired');
    await ctx.dispose();
  });

  test('unauthorized endpoints return a calm message (energy)', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const res = await ctx.post('/api/energy', { data: { to: '00000000-0000-0000-0000-000000000000', amount: 1 } });
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error?: unknown; message?: unknown };
    expect(typeof body.message).toBe('string');
    expect(String(body.message)).toContain('session expired');
    await ctx.dispose();
  });

  test('generic unauth API errors include message field (follow)', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const res = await ctx.post('/api/follow', { data: { userId: '00000000-0000-0000-0000-000000000000', action: 'follow' } });
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error?: unknown; message?: unknown };
    expect(typeof body.message).toBe('string');
    await ctx.dispose();
  });
});

