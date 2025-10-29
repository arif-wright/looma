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

test.describe.serial('Reactions API', () => {
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

  test('toggle post like on/off', async () => {
    const likeAdd = await authedContext.post('/api/reactions/post', {
      data: { post_id: seedData.postId, kind: 'like' }
    });
    const likeAddText = await likeAdd.text();
    console.log('like add response', likeAdd.status(), likeAddText);
    expect(likeAdd.status(), 'like add status').toBe(200);
    const likeAddBody = JSON.parse(likeAddText);
    expect(likeAddBody.toggledOn).toBe(true);
    expect(likeAddBody.counts.like).toBe(1);

    const likeRemove = await authedContext.post('/api/reactions/post', {
      data: { post_id: seedData.postId, kind: 'like' }
    });
    expect(likeRemove.status(), 'like remove status').toBe(200);
    const likeRemoveBody = await likeRemove.json();
    expect(likeRemoveBody.toggledOn).toBe(false);
    expect(likeRemoveBody.counts.like).toBe(0);
  });

  test('adding cheer does not affect like counts', async () => {
    const cheerAdd = await authedContext.post('/api/reactions/post', {
      data: { post_id: seedData.postId, kind: 'cheer' }
    });
    expect(cheerAdd.status(), 'cheer status').toBe(200);
    const cheerBody = await cheerAdd.json();
    expect(cheerBody.counts.cheer).toBe(1);
    expect(cheerBody.counts.like).toBe(0);

    const cheerRemove = await authedContext.post('/api/reactions/post', {
      data: { post_id: seedData.postId, kind: 'cheer' }
    });
    expect(cheerRemove.status(), 'cheer remove status').toBe(200);
    const cheerRemoveBody = await cheerRemove.json();
    expect(cheerRemoveBody.counts.cheer).toBe(0);
  });

  test('comment reactions toggle successfully', async () => {
    const add = await authedContext.post('/api/reactions/comment', {
      data: { comment_id: seedData.commentId, kind: 'spark' }
    });
    expect(add.status(), 'comment add status').toBe(200);
    const addBody = await add.json();
    expect(addBody.counts.spark).toBe(1);

    const remove = await authedContext.post('/api/reactions/comment', {
      data: { comment_id: seedData.commentId, kind: 'spark' }
    });
    expect(remove.status(), 'comment remove status').toBe(200);
    const removeBody = await remove.json();
    expect(removeBody.counts.spark).toBe(0);
  });

  test('unauthenticated requests are rejected', async () => {
    const unauthContext = await request.newContext({ baseURL: BASE_URL });
    const res = await unauthContext.post('/api/reactions/post', {
      data: { post_id: seedData.postId, kind: 'like' }
    });
    expect(res.status(), 'unauthenticated status').toBe(401);
    await unauthContext.dispose();
  });

  test('invalid reaction kinds return 400', async () => {
    const res = await authedContext.post('/api/reactions/post', {
      data: { post_id: seedData.postId, kind: 'clap' }
    });
    expect(res.status(), 'bad kind status').toBe(400);
  });
});
