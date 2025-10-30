import { redirect, type RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '$lib/supabase/server';

type UserResult = {
  supabase: SupabaseClient;
  user: User | null;
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
    const { data, error } = await supabase.auth.getUser(bearerToken);
    if (!error && data.user) {
      return { supabase, user: data.user };
    }
  }

  const {
    data: { user: cookieUser },
    error
  } = await supabase.auth.getUser();

  if (!error && cookieUser) {
    user = cookieUser;
  }

  return { supabase, user };
};

export const requireUserServer = async (event: RequestEvent): Promise<UserResult> => {
  const result = await getUserServer(event);
  if (!result.user) {
    throw redirect(302, '/app/login');
  }
  return result;
};
