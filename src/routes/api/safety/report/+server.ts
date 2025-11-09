import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

const TARGET_KINDS = new Set(['profile', 'post', 'comment']);
const REPORT_REASONS = new Set(['harassment', 'hate', 'spam', 'nudity', 'violence', 'self-harm', 'other']);

type ReportPayload = {
  targetKind?: string;
  targetId?: string;
  reason?: string;
  details?: string | null;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);

  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  let body: ReportPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: CACHE_HEADERS });
  }

  const targetKind = typeof body.targetKind === 'string' ? body.targetKind : null;
  const targetId = typeof body.targetId === 'string' ? body.targetId : null;
  const reason = typeof body.reason === 'string' ? body.reason : null;

  if (!targetKind || !targetId || !reason || !TARGET_KINDS.has(targetKind) || !REPORT_REASONS.has(reason)) {
    return json({ error: 'bad_request' }, { status: 400, headers: CACHE_HEADERS });
  }

  const details = typeof body.details === 'string' && body.details.trim().length ? body.details.trim() : null;

  const { error } = await supabase.from('reports').insert({
    reporter_id: session.user.id,
    target_kind: targetKind,
    target_id: targetId,
    reason,
    details
  });

  if (error) {
    return json({ error: error.message }, { status: 400, headers: CACHE_HEADERS });
  }

  return json({ ok: true }, { headers: CACHE_HEADERS });
};
