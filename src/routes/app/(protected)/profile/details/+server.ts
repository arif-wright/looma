import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clampText } from '$lib/utils/text';
import { safeLinks } from '$lib/utils/links';

export const POST: RequestHandler = async ({ locals, request }) => {
  const user = locals.user;
  if (!user) {
    throw error(401, 'Not authenticated');
  }

  const payload = await request.json().catch(() => ({}));

  const display_name = (payload?.display_name ?? '').trim().slice(0, 40);
  const bio = clampText(payload?.bio, 300);
  const pronouns = (payload?.pronouns ?? '').trim().slice(0, 30);
  const location = (payload?.location ?? '').trim().slice(0, 60);
  const links = safeLinks(payload?.links ?? []);
  const toBool = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback;

  const account_private = toBool(payload?.account_private, false);
  const show_shards = toBool(payload?.show_shards, true);
  const show_level = toBool(payload?.show_level, true);
  const show_joined = toBool(payload?.show_joined, true);
  const show_location = toBool(payload?.show_location, true);
  const show_achievements = toBool(payload?.show_achievements, true);
  const show_feed = toBool(payload?.show_feed, true);

  const updates: Record<string, unknown> = {
    bio,
    pronouns,
    location,
    links,
    account_private,
    show_shards,
    show_level,
    show_joined,
    show_location,
    show_achievements,
    show_feed
  };

  if (display_name.length > 0) {
    updates.display_name = display_name;
  }

  const { data, error: updateError } = await locals.supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select(
      'id, display_name, bio, pronouns, location, links, account_private, show_shards, show_level, show_joined, show_location, show_achievements, show_feed, avatar_url, handle, banner_url, joined_at'
    )
    .maybeSingle();

  if (updateError) {
    console.error('[profile details] update failed', updateError);
    throw error(500, 'Unable to update profile');
  }

  return json({ ok: true, profile: data });
};
