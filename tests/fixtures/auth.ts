import { config as loadEnv } from 'dotenv';
import { createClient, type Session } from '@supabase/supabase-js';
import type { APIRequestContext, Page } from '@playwright/test';
import { request } from '@playwright/test';
import { BASE_URL, TEST_USERS, SEED_USERS, type SeedUser } from './env';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY;

const ensureEnv = () => {
  if (!SUPABASE_URL) throw new Error('PUBLIC_SUPABASE_URL is required for auth helpers');
  if (!SUPABASE_ANON_KEY) throw new Error('PUBLIC_SUPABASE_ANON_KEY is required for auth helpers');
};

export type Credentials = Pick<SeedUser, 'email' | 'password'>;

const getClient = () =>
  createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

const getSession = async (user: Credentials): Promise<Session> => {
  ensureEnv();
  const client = getClient();
  const { data, error } = await client.auth.signInWithPassword(user);
  if (error || !data.session) {
    throw new Error(`Unable to sign in ${user.email}: ${error?.message ?? 'unknown error'}`);
  }
  return data.session;
};

export const getAccessToken = async (user: Credentials): Promise<string> => {
  const session = await getSession(user);
  return session.access_token;
};

export const authHeaders = async (user: Credentials): Promise<Record<string, string>> => {
  const token = await getAccessToken(user);
  return { Authorization: `Bearer ${token}` };
};

const projectRefFromUrl = (url: string) => {
  const host = new URL(url).host;
  const [subdomain] = host.split('.');
  return subdomain;
};

export const loginAs = async (page: Page, user: Credentials): Promise<Session> => {
  const session = await getSession(user);
  const projectRef = projectRefFromUrl(SUPABASE_URL!);
  const base = new URL(BASE_URL);
  const cookieUrl = base.origin;
  const secure = base.protocol === 'https:';
  const expiresAt = session.expires_at ?? Math.floor(Date.now() / 1000) + 3600;

  await page.context().addCookies([
    {
      name: `sb-${projectRef}-access-token`,
      value: session.access_token,
      url: cookieUrl,
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      expires: expiresAt
    },
    {
      name: `sb-${projectRef}-refresh-token`,
      value: session.refresh_token,
      url: cookieUrl,
      httpOnly: true,
      secure,
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

  try {
    await page.evaluate(
      ({ key, value }) => {
        window.localStorage.setItem(key, value);
      },
      { key: storageKey, value: payload }
    );
  } catch (error) {
    if (process.env.DEBUG_PLAYWRIGHT_COOKIES) {
      console.warn('[loginAs] localStorage injection skipped', error);
    }
  }

  return session;
};

export const createAuthedRequest = async (user: Credentials): Promise<APIRequestContext> => {
  const headers = await authHeaders(user);
  return request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: headers
  });
};

export const AUTHOR_CREDENTIALS: Credentials = {
  email: SEED_USERS.author.email,
  password: SEED_USERS.author.password
};

export const VIEWER_CREDENTIALS: Credentials = {
  email: SEED_USERS.viewer.email,
  password: SEED_USERS.viewer.password
};

export const getTestUsers = () => ({
  author: TEST_USERS.author,
  viewer: TEST_USERS.viewer
});
