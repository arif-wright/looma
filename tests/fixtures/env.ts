import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

export const BASE_URL = process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SeedUser = {
  id: string;
  email: string;
  password: string;
  handle: string;
};

export type SeedResult = {
  postId: string;
  commentId: string;
  author: SeedUser;
  viewer: SeedUser;
};

const ensureEnv = () => {
  if (!SUPABASE_URL) throw new Error('PUBLIC_SUPABASE_URL is required for tests');
  if (!SUPABASE_ANON_KEY) throw new Error('PUBLIC_SUPABASE_ANON_KEY is required for tests');
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for tests');
};

export type TestUser = SeedUser;

async function seedCore(): Promise<SeedResult> {
  ensureEnv();

  const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const suffix = Date.now().toString(36);
  const buildUser = (role: 'author' | 'viewer'): SeedUser => {
    const handle = `${role}_${suffix}`;
    return {
      id: '',
      email: `${handle}@example.com`,
      password: `Test${role === 'author' ? 'A' : 'V'}-${suffix}-P@ss`,
      handle
    };
  };

  const author = buildUser('author');
  const viewer = buildUser('viewer');

  const authorResult = await admin.auth.admin.createUser({
    email: author.email,
    email_confirm: true,
    password: author.password
  });
  if (authorResult.error || !authorResult.data.user?.id) {
    throw new Error(`Failed to create author user: ${authorResult.error?.message ?? 'unknown error'}`);
  }
  author.id = authorResult.data.user.id;

  const viewerResult = await admin.auth.admin.createUser({
    email: viewer.email,
    email_confirm: true,
    password: viewer.password
  });
  if (viewerResult.error || !viewerResult.data.user?.id) {
    throw new Error(`Failed to create viewer user: ${viewerResult.error?.message ?? 'unknown error'}`);
  }
  viewer.id = viewerResult.data.user.id;

  const { error: authorProfileError } = await admin.from('profiles').upsert({
    id: author.id,
    display_name: `Author ${suffix}`,
    handle: author.handle,
    avatar_url: null
  });
  if (authorProfileError) {
    throw new Error(`Failed to upsert author profile: ${authorProfileError.message}`);
  }

  const { error: viewerProfileError } = await admin.from('profiles').upsert({
    id: viewer.id,
    display_name: `Viewer ${suffix}`,
    handle: viewer.handle,
    avatar_url: null
  });
  if (viewerProfileError) {
    throw new Error(`Failed to upsert viewer profile: ${viewerProfileError.message}`);
  }

  const { data: postRow, error: postError } = await admin
    .from('posts')
    .insert({
      user_id: author.id,
      body: `Automated test post ${suffix}`,
      slug: `${author.handle}-${suffix}`,
      meta: { seed: suffix },
      is_public: true
    })
    .select('id')
    .single();

  if (postError || !postRow?.id) {
    throw new Error(`Failed to create post: ${postError?.message ?? 'unknown error'}`);
  }

  const { data: commentRow, error: commentError } = await admin
    .from('comments')
    .insert({
      post_id: postRow.id,
      parent_id: null,
      user_id: author.id,
      author_id: author.id,
      body: `Automated seed comment ${suffix}`,
      target_kind: 'post',
      target_id: postRow.id,
      is_public: true
    })
    .select('id')
    .single();

  if (commentError || !commentRow?.id) {
    throw new Error(`Failed to create comment: ${commentError?.message ?? 'unknown error'}`);
  }

  return {
    postId: postRow.id,
    commentId: commentRow.id,
    author,
    viewer
  };
}

export async function seed(): Promise<SeedResult> {
  return seedCore();
}

export async function seedMinimal(): Promise<SeedResult> {
  return seedCore();
}
