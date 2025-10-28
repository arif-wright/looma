import type { SupabaseClient } from '@supabase/supabase-js';

type AnalyticsPayload = {
  surface?: string | null;
  variant?: string | null;
  payload?: Record<string, unknown> | null;
};

export async function recordAnalyticsEvent(
  supabase: SupabaseClient,
  userId: string,
  eventType: string,
  data: AnalyticsPayload = {}
): Promise<void> {
  try {
    const { error } = await supabase.from('analytics_events').insert({
      user_id: userId,
      event_type: eventType,
      surface: data.surface ?? null,
      variant: data.variant ?? null,
      payload: data.payload ?? null
    });

    if (error) {
      console.error('[analytics] insert failed', error);
    }
  } catch (err) {
    console.error('[analytics] unexpected failure', err);
  }
}
