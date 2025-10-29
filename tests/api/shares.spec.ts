import { expect, request, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { BASE_URL, seed, type SeedResult } from '../fixtures/env';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY!;

const projectRef = (() => {
  const host = new URL(SUPABASE_URL).host;
  const [subdomain] = host.split('.');
  return subdomain;
})();

async function buildAuthedContext(user: { email: string; password: string }) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password
  });

  if (error || !data.session) {
    throw new Error(`Unable to create session for ${user.email}: ${error?.message ?? 'unknown error'}`);
  }

  const session = data.session;
  const cookieHeader = [
    `sb-${projectRef}-access-token=${session.access_token}`,
    `sb-${projectRef}-refresh-token=${session.refresh_token}`
  ].join('; ');

  const context = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      Cookie: cookieHeader,
      Authorization: `Bearer ${session.access_token}`
    }
  });

  return { context, session };
}

test.describe.serial('Shares API', () => {
  let seedData: SeedResult;
  let authedContext: Awaited<ReturnType<typeof buildAuthedContext>>['context'];

  test.beforeAll(async () => {
    seedData = await seed();
    const auth = await buildAuthedContext(seedData.viewer);
    authedContext = auth.context;
  });

  test.afterAll(async () => {
    await authedContext?.dispose();
  });

  test('reposting increments share count', async () => {
    const res = await authedContext.post('/api/shares', {
      data: { post_id: seedData.postId }
    });
    expect(res.status(), 'repost status').toBe(200);
    const body = await res.json();
    expect(body.shares_count).toBeGreaterThanOrEqual(1);
  });

  test('quote share succeeds within limit', async () => {
    const res = await authedContext.post('/api/shares', {
      data: { post_id: seedData.postId, quote: 'Looking good from automated tests!' }
    });
    expect(res.status(), 'quote status').toBe(200);
    const body = await res.json();
    expect(body.shares_count).toBeGreaterThanOrEqual(2);
  });

  test('unauthenticated share returns 401', async () => {
    const unauthContext = await request.newContext({ baseURL: BASE_URL });
    const res = await unauthContext.post('/api/shares', {
      data: { post_id: seedData.postId }
    });
    expect(res.status(), 'unauthenticated share status').toBe(401);
    await unauthContext.dispose();
  });

  test('quotes longer than 280 chars return 400', async () => {
    const longQuote = 'x'.repeat(300);
    const res = await authedContext.post('/api/shares', {
      data: { post_id: seedData.postId, quote: longQuote }
    });
    expect(res.status(), 'long quote status').toBe(400);
  });
});
