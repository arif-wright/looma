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

  const display_name = (payload?.display_name ?? '').trim().slice(0, 60);
  const bio = clampText(payload?.bio, 300);
  const pronouns = (payload?.pronouns ?? '').trim().slice(0, 30);
  const location = (payload?.location ?? '').trim().slice(0, 60);
  const links = safeLinks(payload?.links ?? []);
  const show_shards = Boolean(payload?.show_shards);
  const show_level = Boolean(payload?.show_level);
  const show_joined = Boolean(payload?.show_joined);

  const { data, error: updateError } = await locals.supabase
    .from('profiles')
    .update({ display_name, bio, pronouns, location, links, show_shards, show_level, show_joined })
    .eq('id', user.id)
    .select('id, display_name, bio, pronouns, location, links, show_shards, show_level, show_joined, avatar_url, handle, banner_url, joined_at')
    .maybeSingle();

  if (updateError) {
    console.error('[profile details] update failed', updateError);
    throw error(500, 'Unable to update profile');
  }

  return json({ ok: true, profile: data });
};
