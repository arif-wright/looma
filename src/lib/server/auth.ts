import { redirect, type RequestEvent } from '@sveltejs/kit';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '$lib/supabase/server';
import { env as publicEnv } from '$env/dynamic/public';

type UserResult = {
  supabase: SupabaseClient;
  user: User | null;
};

type AuthenticatedUserResult = {
  supabase: SupabaseClient;
  user: User;
};

const extractBearerToken = (event: RequestEvent) => {
  const header = event.request.headers.get('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer') return null;
  return token?.trim() || null;
};

export const getUserServer = async (event: RequestEvent): Promise<UserResult> => {
  const supabase = createSupabaseServerClient(event);
  let user: User | null = null;

  const bearerToken = extractBearerToken(event);
  if (bearerToken) {
    const url = publicEnv.PUBLIC_SUPABASE_URL;
    const anonKey = publicEnv.PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return { supabase, user: null };
    }
    const supabaseWithToken = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await supabaseWithToken.auth.getUser(bearerToken);
    if (!error && data.user) {
      return { supabase, user: data.user };
    }
  }

  try {
    const {
      data: { user: cookieUser },
      error
    } = await supabase.auth.getUser();

    if (!error && cookieUser) {
      user = cookieUser;
    }
  } catch (err) {
    // If Supabase isn't configured (local smoke tests, CI without secrets),
    // we treat the request as unauthenticated instead of returning a 500.
    console.warn('[auth] supabase unavailable; continuing as guest');
  }

  return { supabase, user };
};

export const requireUserServer = async (event: RequestEvent): Promise<AuthenticatedUserResult> => {
  const result = await getUserServer(event);
  if (!result.user) {
    throw redirect(302, '/app/auth');
  }
  return { supabase: result.supabase, user: result.user };
};
