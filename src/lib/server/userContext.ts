import type { RequestEvent } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';
import { recordAnalyticsEvent } from './analytics';

export type UserContext = 'feed' | 'mission' | 'creature' | 'dashboard';

const CONTEXT_TO_SURFACE: Record<UserContext, string> = {
  feed: 'home',
  mission: 'mission',
  creature: 'creatures',
  dashboard: 'dashboard'
};

const parseLandingCookie = (value: string | undefined | null) => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

export async function updateUserContext(
  event: RequestEvent,
  context: UserContext,
  payload: Record<string, unknown> | null = null
): Promise<void> {
  const supabase = event.locals.sb ?? supabaseServer(event);

  let userId = event.locals.session?.user?.id ?? null;
  if (!userId) {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  if (!userId) return;

  const upsertPayload: Record<string, unknown> = {
    user_id: userId,
    last_context: context,
    last_context_payload: payload ?? null
  };

  const { error } = await supabase
    .from('user_preferences')
    .upsert(upsertPayload, { onConflict: 'user_id', ignoreDuplicates: false });

  if (error) {
    console.error('[userContext] update failed', error);
  }

  const landingValue = parseLandingCookie(event.cookies.get('looma_landing_at'));

  if (landingValue) {
    const msSinceLand = Date.now() - landingValue;
    await recordAnalyticsEvent(supabase, userId, 'first_action', {
      surface: CONTEXT_TO_SURFACE[context],
      payload: {
        ms_since_land: msSinceLand,
        context,
        extra: payload ?? null
      }
    });

    event.cookies.delete('looma_landing_at', {
      path: '/app',
      httpOnly: true,
      sameSite: 'lax',
      secure: event.url?.protocol === 'https:'
    });
  }
}
