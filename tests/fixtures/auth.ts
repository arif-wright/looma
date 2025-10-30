import { config as loadEnv } from 'dotenv';
import { createClient, type Session } from '@supabase/supabase-js';
import { request, type APIRequestContext, type Browser, type Page, type StorageState } from '@playwright/test';
import { BASE_URL } from './env';

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

const buildCookieHeader = (storage: StorageState, hostname: string) => {
  const normalizedHost = hostname.replace(/^\./, '');
  const cookies = storage.cookies.filter((cookie) => {
    if (!cookie.domain) return true;
    const domain = cookie.domain.replace(/^\./, '');
    return normalizedHost === domain || normalizedHost.endsWith(`.${domain}`);
  });

  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
};

export async function loginAs(page: Page, user: Credentials): Promise<Session> {
  ensureAuthEnv();
  const session = await createSession(user);
  const projectRef = projectRefFromUrl(SUPABASE_URL!);
  const base = new URL(BASE_URL);
  const cookieUrl = `${base.origin}`;
  const secure = base.protocol === 'https:';
  const expiresAt = session.expires_at ?? Math.floor(Date.now() / 1000) + 3600;

  const cookieEntries = [
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
    },
    {
      name: `sb-${projectRef}-session`,
      value: JSON.stringify({
        currentSession: session,
        expiresAt
      }),
      url: cookieUrl,
      httpOnly: false,
      secure,
      sameSite: 'Lax',
      expires: expiresAt
    }
  ];

  await page.context().addCookies(cookieEntries);

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

  return session;
}

export async function createApiRequestContext(
  browser: Browser,
  user: Credentials
): Promise<APIRequestContext> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const session = await loginAs(page, user);
  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');
  const storageState = await context.storageState();
  const cookieHeader = buildCookieHeader(storageState, new URL(BASE_URL).hostname);
  if (process.env.DEBUG_PLAYWRIGHT_COOKIES) {
    console.log('[createApiRequestContext] storage cookies', storageState.cookies);
  }
  await context.close();

  if (process.env.DEBUG_PLAYWRIGHT_COOKIES) {
    console.log('[createApiRequestContext] cookie header', cookieHeader);
  }

  return request.newContext({
    baseURL: BASE_URL,
    storageState,
    extraHTTPHeaders: {
      Authorization: `Bearer ${session.access_token}`,
      Cookie: cookieHeader
    }
  });
}
