import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { runSeed, type SeedResult } from '../fixtures/env';
import { createAuthedRequest, VIEWER_CREDENTIALS } from '../fixtures/auth';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const createdUserIds: string[] = [];

async function createTestUser(label: string) {
  const email = `recs-${label}-${Date.now()}-${randomUUID().slice(0, 4)}@example.com`;
  const password = 'Passw0rd!';
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (error || !data.user?.id) {
    throw error ?? new Error('Failed to create test user');
  }
  createdUserIds.push(data.user.id);
  const handle = `${label}-${data.user.id.slice(0, 8)}`;
  const { error: profileError } = await adminClient
    .from('profiles')
    .upsert({ id: data.user.id, handle, display_name: `${label} Tester` }, { onConflict: 'id' });
  if (profileError) {
    throw profileError;
  }
  return { id: data.user.id, email, password, handle };
}

async function setupMutualRecommendation(subjectId: string) {
  const candidate = await createTestUser('candidate');
  const connector = await createTestUser('connector');

  const { error } = await adminClient.from('follows').insert([
    { follower_id: connector.id, followee_id: subjectId },
    { follower_id: connector.id, followee_id: candidate.id }
  ]);
  if (error) throw error;

  return { candidate, connector };
}

test.describe.serial('Follow recommendations API', () => {
  let seed: SeedResult;
  let candidateId: string;

  test.beforeAll(async () => {
    seed = await runSeed();
    const { candidate } = await setupMutualRecommendation(seed.viewer.id);
    candidateId = candidate.id;
  });

  test.afterAll(async () => {
    await Promise.all(
      createdUserIds.map((id) => adminClient.auth.admin.deleteUser(id).catch(() => undefined))
    );
  });

  test('returns mutual suggestion for viewer', async () => {
    const viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);
    const res = await viewerCtx.get('/api/recs/people?limit=5');
    expect(res.status()).toBe(200);
    const payload = await res.json();
    const ids = Array.isArray(payload.items) ? payload.items.map((item: any) => item.user_id) : [];
    expect(ids).toContain(candidateId);
    await viewerCtx.dispose();
  });
});
