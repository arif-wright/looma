import { error } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestEvent } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';

type GameRow = {
  id: string;
  slug: string;
  name: string;
  max_score: number | null;
  is_active: boolean;
};

type ConfigRow = {
  id: string;
  game_id: string;
  max_duration_ms: number | null;
  min_duration_ms: number | null;
  max_score_per_min: number | null;
  min_client_ver: string | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  nonce: string;
  status: string;
  completed_at: string | null;
  game_id: string | null;
  started_at: string;
};

export const ensureAuth = async (event: RequestEvent): Promise<{
  user: User;
  supabase: ReturnType<typeof supabaseServer>;
}> => {
  const localsUser = event.locals.user as User | null | undefined;
  const localsClient = event.locals.supabase as ReturnType<typeof supabaseServer> | null | undefined;

  if (localsUser && localsClient) {
    return { user: localsUser, supabase: localsClient };
  }

  const supabase = localsClient ?? supabaseServer(event);
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError) {
    if (authError.message?.includes('Auth session missing')) {
      throw error(401, { code: 'unauthorized', message: 'Authentication required' });
    }
    console.error('[games] auth error', authError);
    throw error(500, { code: 'server_error', message: 'Unable to verify session' });
  }

  if (!user) {
    throw error(401, { code: 'unauthorized', message: 'Authentication required' });
  }

  event.locals.user = user;
  event.locals.supabase = supabase;

  return { user, supabase };
};

export const requireUser = ensureAuth;

export const getActiveGameBySlug = async (
  supabase: ReturnType<typeof supabaseServer>,
  slug: string
): Promise<GameRow | null> => {
  const { data, error: gameError } = await supabase
    .from('game_titles')
    .select('id, slug, name, max_score, is_active')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (gameError) {
    console.error('[games] failed to load game by slug', gameError);
    throw error(500, { code: 'server_error', message: 'Unable to load game' });
  }

  return (data as GameRow | null) ?? null;
};

export const getGameById = async (gameId: string): Promise<GameRow | null> => {
  const { data, error: gameError } = await supabaseAdmin
    .from('game_titles')
    .select('id, slug, name, max_score, is_active')
    .eq('id', gameId)
    .maybeSingle();

  if (gameError) {
    console.error('[games] failed to load game by id', gameError);
    throw error(500, { code: 'server_error', message: 'Unable to load game metadata' });
  }

  return (data as GameRow | null) ?? null;
};

export const getGameBySlugAdmin = async (slug: string): Promise<GameRow | null> => {
  const { data, error: gameError } = await supabaseAdmin
    .from('game_titles')
    .select('id, slug, name, max_score, is_active')
    .eq('slug', slug)
    .maybeSingle();

  if (gameError) {
    console.error('[games] failed to load game by slug (admin)', gameError);
    throw error(500, { code: 'server_error', message: 'Unable to load game' });
  }

  return (data as GameRow | null) ?? null;
};

export const getConfigForGame = async (
  supabase: ReturnType<typeof supabaseServer>,
  gameId: string
): Promise<ConfigRow | null> => {
  const { data, error: configError } = await supabase
    .from('game_config')
    .select('id, game_id, max_duration_ms, min_duration_ms, max_score_per_min, min_client_ver')
    .eq('game_id', gameId)
    .maybeSingle();

  if (configError) {
    console.error('[games] failed to load game config', configError);
    throw error(500, { code: 'server_error', message: 'Unable to load game configuration' });
  }

  return (data as ConfigRow | null) ?? null;
};

export const getSession = async (
  supabase: ReturnType<typeof supabaseServer>,
  sessionId: string
): Promise<SessionRow | null> => {
  const { data, error: sessionError } = await supabase
    .from('game_sessions')
    .select('id, user_id, nonce, status, completed_at, game_id, started_at')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError) {
    console.error('[games] failed to load game session', sessionError);
    throw error(500, { code: 'server_error', message: 'Unable to load session' });
  }

  return (data as SessionRow | null) ?? null;
};

export const hasAbuseFlag = async (_userId: string): Promise<boolean> => {
  // Placeholder for future heuristics or moderation hooks.
  return false;
};

export const getAdminClient = () => supabaseAdmin;
