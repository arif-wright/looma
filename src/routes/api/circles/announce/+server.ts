import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { CIRCLES_CACHE_HEADERS, cleanText, isUuid } from '$lib/server/circles';
import { appendJournalEntryForActiveCompanion } from '$lib/server/companions/journal';

type AnnouncePayload = {
  circleId?: string;
  title?: string;
  body?: string;
  pinned?: boolean;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CIRCLES_CACHE_HEADERS });
  }

  let body: AnnouncePayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: CIRCLES_CACHE_HEADERS });
  }

  const circleId = typeof body.circleId === 'string' ? body.circleId : null;
  const title = cleanText(body.title, 120);
  const content = cleanText(body.body, 2000);
  const pinned = body.pinned === true;

  if (!isUuid(circleId) || !title || !content) {
    return json({ error: 'bad_request' }, { status: 400, headers: CIRCLES_CACHE_HEADERS });
  }

  const { data: roleRow } = await supabase
    .from('circle_members')
    .select('role')
    .eq('circle_id', circleId)
    .eq('user_id', session.user.id)
    .maybeSingle<{ role: 'owner' | 'admin' | 'member' }>();

  if (!roleRow || (roleRow.role !== 'owner' && roleRow.role !== 'admin')) {
    return json({ error: 'forbidden', message: 'Only owner/admin can post announcements.' }, { status: 403, headers: CIRCLES_CACHE_HEADERS });
  }

  if (pinned) {
    await supabase
      .from('circle_announcements')
      .update({ pinned: false })
      .eq('circle_id', circleId)
      .eq('pinned', true);
  }

  const { data, error } = await supabase
    .from('circle_announcements')
    .insert({
      circle_id: circleId,
      author_id: session.user.id,
      title,
      body: content,
      pinned
    })
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) {
    return json({ error: error.message }, { status: 400, headers: CIRCLES_CACHE_HEADERS });
  }

  try {
    await appendJournalEntryForActiveCompanion(supabase, {
      ownerId: session.user.id,
      sourceType: 'circle_announcement',
      sourceId: data?.id ?? null,
      title: title || 'Shared a circle update',
      body: content,
      meta: {
        circleId,
        pinned
      }
    });
  } catch (journalError) {
    console.error('[circles/announce] companion journal entry failed', journalError);
  }

  return json({ ok: true, announcementId: data?.id ?? null }, { headers: CIRCLES_CACHE_HEADERS });
};
