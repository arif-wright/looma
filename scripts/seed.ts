import { config as loadEnv } from 'dotenv';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SeedUserConfig = {
  email: string;
  password: string;
  handle: string;
  displayName: string;
};

export type SeedUser = SeedUserConfig & {
  id: string;
};

export type SeedResult = {
  author: SeedUser;
  viewer: SeedUser;
  postId: string;
  commentId: string;
};

export const SEED_USERS: Record<'author' | 'viewer', SeedUserConfig> = {
  author: {
    email: 'author@test.local',
    password: 'Test1234!',
    handle: 'seed-author',
    displayName: 'Author Seed'
  },
  viewer: {
    email: 'viewer@test.local',
    password: 'Test1234!',
    handle: 'seed-viewer',
    displayName: 'Viewer Seed'
  }
};

const POST_ID = '00000000-0000-4000-8000-00000000feed';
const COMMENT_ID = '00000000-0000-4000-8000-00000000c0f1';

const assertNonProduction = () => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed script must not run in production');
  }
};

const ensureEnv = () => {
  if (!PUBLIC_SUPABASE_URL) {
    throw new Error('PUBLIC_SUPABASE_URL is required to seed data');
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to seed data');
  }
};

const listUserByEmail = async (admin: SupabaseClient, email: string): Promise<User | null> => {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
    email
  } as any);

  if (error) {
    throw error;
  }

  return data?.users?.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
};

const ensureUser = async (admin: SupabaseClient, config: SeedUserConfig): Promise<User> => {
  const existing = await listUserByEmail(admin, config.email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      password: config.password,
      email_confirm: true
    });
    return existing;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: config.email,
    password: config.password,
    email_confirm: true,
    user_metadata: { seed: 'playwright' }
  });

  if (error) {
    if (error.message && /already registered/i.test(error.message)) {
      const user = await listUserByEmail(admin, config.email);
      if (user) return user;
    }
    throw error;
  }

  if (!data?.user) {
    throw new Error(`Supabase did not return a user for ${config.email}`);
  }

  return data.user;
};

const ensureProfile = async (admin: SupabaseClient, user: User, config: SeedUserConfig) => {
  const { error } = await admin.from('profiles').upsert({
    id: user.id,
    display_name: config.displayName,
    handle: config.handle,
    avatar_url: null
  });

  if (error) {
    throw new Error(`Failed to upsert profile for ${config.email}: ${error.message}`);
  }
};

const ensurePostAndComment = async (admin: SupabaseClient, author: User, viewer: User) => {
  const { error: postError } = await admin.from('posts').upsert(
    {
      id: POST_ID,
      user_id: author.id,
      slug: 'seed-post',
      body: 'Seed post for automated tests',
      meta: { seed: true },
      is_public: true
    },
    { onConflict: 'id' }
  );

  if (postError) {
    throw new Error(`Failed to upsert seed post: ${postError.message}`);
  }

  const { error: commentError } = await admin.from('comments').upsert(
    {
      id: COMMENT_ID,
      post_id: POST_ID,
      parent_id: null,
      user_id: viewer.id,
      author_id: viewer.id,
      body: 'Excited to see this update! — seed comment',
      target_kind: 'post',
      target_id: POST_ID,
      is_public: true
    },
    { onConflict: 'id' }
  );

  if (commentError) {
    throw new Error(`Failed to upsert seed comment: ${commentError.message}`);
  }

  const { error: pinError } = await admin
    .from('posts')
    .update({ is_pinned: true })
    .eq('id', POST_ID);

  if (pinError) {
    console.error('[seed] failed to pin post', pinError);
  }
};

const ensureCompanions = async (
  admin: SupabaseClient,
  owner: User,
  entries: Array<{ name: string; species: string; mood: string; featured?: boolean }>
) => {
  const createdIds: string[] = [];
  for (const entry of entries) {
    const { data: existing } = await admin
      .from('companions')
      .select('id')
      .eq('owner_id', owner.id)
      .eq('name', entry.name)
      .maybeSingle();

    let companionId = existing?.id ?? null;
    if (!companionId) {
      const { data, error } = await admin
        .from('companions')
        .insert({
          owner_id: owner.id,
          name: entry.name,
          species: entry.species,
          mood: entry.mood,
          bond_level: 3,
          bond_xp: 60,
          bond_next: 100
        })
        .select('id')
        .single();
      if (error) {
        throw new Error(`Failed to insert companion ${entry.name}: ${error.message}`);
      }
      companionId = data?.id as string;
    }

    if (entry.featured) {
      await admin.from('profiles').update({ featured_companion_id: companionId }).eq('id', owner.id);
    }

    createdIds.push(companionId);
  }
  return createdIds;
};

export const seed = async (): Promise<SeedResult> => {
  assertNonProduction();
  ensureEnv();

  const admin = createClient(PUBLIC_SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const authorUser = await ensureUser(admin, SEED_USERS.author);
  const viewerUser = await ensureUser(admin, SEED_USERS.viewer);

  await ensureProfile(admin, authorUser, SEED_USERS.author);
  await ensureProfile(admin, viewerUser, SEED_USERS.viewer);
  await ensurePostAndComment(admin, authorUser, viewerUser);
  await ensureCompanions(admin, viewerUser, [
    { name: 'Nova', species: 'Lumen Wisp', mood: 'Radiant', featured: true },
    { name: 'Quill', species: 'Arc Owl', mood: 'Curious' }
  ]);
  await ensureCompanions(admin, authorUser, [
    { name: 'Ember', species: 'Sol Fox', mood: 'Calm', featured: true }
  ]);

  return {
    author: { ...SEED_USERS.author, id: authorUser.id },
    viewer: { ...SEED_USERS.viewer, id: viewerUser.id },
    postId: POST_ID,
    commentId: COMMENT_ID
  };
};

const run = async () => {
  const result = await seed();
  console.log('[seed] users ready:', {
    author: { email: result.author.email, id: result.author.id },
    viewer: { email: result.viewer.email, id: result.viewer.id },
    postId: result.postId,
    commentId: result.commentId
  });
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch((error) => {
    console.error('[seed] failed', error);
    process.exitCode = 1;
  });
}
