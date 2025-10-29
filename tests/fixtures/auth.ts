import { config as loadEnv } from 'dotenv';
import { createClient, type Session } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY;

const ensureAuthEnv = () => {
  if (!SUPABASE_URL) throw new Error('PUBLIC_SUPABASE_URL is required for login helper');
  if (!SUPABASE_ANON_KEY) throw new Error('PUBLIC_SUPABASE_ANON_KEY is required for login helper');
};

const projectRefFromUrl = (url: string) => {
  const host = new URL(url).host;
  const [subdomain] = host.split('.');
  return subdomain;
};

type Credentials = {
  email: string;
  password: string;
};

export async function createSession(user: Credentials): Promise<Session> {
  ensureAuthEnv();
  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
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

  return data.session;
}

export async function loginAs(page: Page, user: Credentials): Promise<void> {
  ensureAuthEnv();
  const session = await createSession(user);
  const projectRef = projectRefFromUrl(SUPABASE_URL!);
  const expiresAt = session.expires_at ?? Math.floor(Date.now() / 1000) + 3600;

  await page.context().addCookies([
    {
      name: `sb-${projectRef}-access-token`,
      value: session.access_token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
      expires: expiresAt
    },
    {
      name: `sb-${projectRef}-refresh-token`,
      value: session.refresh_token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    }
  ]);

  const storageKey = `sb-${projectRef}-auth-token`;
  const payload = JSON.stringify({
    currentSession: session,
    currentUser: session.user,
    expiresAt
  });

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: storageKey, value: payload }
  );
}
