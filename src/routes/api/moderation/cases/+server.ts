import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { serviceClient } from '$lib/server/admin';
import { MODERATION_CACHE_HEADERS, requireModerator } from '$lib/server/moderation';
import { parseCaseStatus } from '$lib/server/moderation/cases';

type ModerationCaseRow = {
  id: string;
  report_id: string;
  status: 'open' | 'under_review' | 'resolved' | 'dismissed';
  assigned_to: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
};

type ReportRow = {
  id: string;
  reporter_id: string;
  message_id: string;
  reason: string;
  details: string | null;
  created_at: string;
};

type MessageRow = {
  id: string;
  sender_id: string;
  conversation_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
};
type TrustRow = {
  user_id: string;
  score: number;
  tier: 'new' | 'standard' | 'trusted' | 'restricted';
  forced_tier: 'new' | 'standard' | 'trusted' | 'restricted' | null;
};
type TrustEventRow = {
  id: string;
  user_id: string;
  kind: string;
  delta: number;
  created_at: string;
};

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: MODERATION_CACHE_HEADERS });
  }

  const auth = await requireModerator(supabase, session.user.id, session.user.email ?? null);
  if (!auth.ok) {
    return json({ error: 'forbidden' }, { status: 403, headers: MODERATION_CACHE_HEADERS });
  }

  const admin = serviceClient();
  const tab = event.url.searchParams.get('tab');

  if (tab === 'actions') {
    const actionFilter = event.url.searchParams.get('action');
    let actionsQuery = admin
      .from('moderation_actions')
      .select('id, user_id, action, target_id, duration_minutes, reason, created_by, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (actionFilter) {
      actionsQuery = actionsQuery.eq('action', actionFilter);
    }

    const { data: actions, error: actionError } = await actionsQuery;
    if (actionError) {
      return json({ error: actionError.message }, { status: 400, headers: MODERATION_CACHE_HEADERS });
    }

    return json({ tab: 'actions', items: actions ?? [] }, { headers: MODERATION_CACHE_HEADERS });
  }

  const status = parseCaseStatus(event.url.searchParams.get('status') ?? 'open');

  let caseQuery = admin
    .from('moderation_cases')
    .select('id, report_id, status, assigned_to, resolution, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(250);

  if (status) {
    caseQuery = caseQuery.eq('status', status);
  }

  const { data: caseRowsRaw, error: caseError } = await caseQuery;
  if (caseError) {
    return json({ error: caseError.message }, { status: 400, headers: MODERATION_CACHE_HEADERS });
  }

  const caseRows = (caseRowsRaw ?? []) as ModerationCaseRow[];
  if (!caseRows.length) {
    return json({ items: [] }, { headers: MODERATION_CACHE_HEADERS });
  }

  const reportIds = caseRows.map((row) => row.report_id);
  const { data: reportRowsRaw, error: reportError } = await admin
    .from('message_reports')
    .select('id, reporter_id, message_id, reason, details, created_at')
    .in('id', reportIds);

  if (reportError) {
    return json({ error: reportError.message }, { status: 400, headers: MODERATION_CACHE_HEADERS });
  }

  const reportRows = (reportRowsRaw ?? []) as ReportRow[];
  const reportsById = new Map(reportRows.map((row) => [row.id, row]));

  const messageIds = Array.from(new Set(reportRows.map((row) => row.message_id)));
  const { data: messageRowsRaw, error: messageError } = await admin
    .from('messages')
    .select('id, sender_id, conversation_id, body, created_at, deleted_at')
    .in('id', messageIds);

  if (messageError) {
    return json({ error: messageError.message }, { status: 400, headers: MODERATION_CACHE_HEADERS });
  }

  const messageRows = (messageRowsRaw ?? []) as MessageRow[];
  const messagesById = new Map(messageRows.map((row) => [row.id, row]));

  const conversationIds = Array.from(new Set(messageRows.map((row) => row.conversation_id)));
  const { data: circlesRaw } = conversationIds.length
    ? await admin
        .from('circles')
        .select('id, name, conversation_id')
        .in('conversation_id', conversationIds)
    : { data: [] };

  const circleByConversationId = new Map(
    (circlesRaw ?? []).map((row) => [row.conversation_id as string, row as { id: string; name: string; conversation_id: string }])
  );

  const senderIds = Array.from(new Set(messageRows.map((row) => row.sender_id)));
  const { data: senderPrefs } = senderIds.length
    ? await admin
        .from('user_preferences')
        .select('user_id, moderation_status, moderation_until')
        .in('user_id', senderIds)
    : { data: [] };

  const senderModeration = new Map(
    (senderPrefs ?? []).map((row) => [
      row.user_id as string,
      {
        status: (row.moderation_status as string | null) ?? 'active',
        until: (row.moderation_until as string | null) ?? null
      }
    ])
  );

  const { data: trustRowsRaw } = senderIds.length
    ? await admin
        .from('user_trust')
        .select('user_id, score, tier, forced_tier')
        .in('user_id', senderIds)
    : { data: [] };
  const trustByUser = new Map(
    ((trustRowsRaw ?? []) as TrustRow[]).map((row) => [row.user_id, row])
  );

  const { data: trustEventsRaw } = senderIds.length
    ? await admin
        .from('trust_events')
        .select('id, user_id, kind, delta, created_at')
        .in('user_id', senderIds)
        .order('created_at', { ascending: false })
        .limit(500)
    : { data: [] };

  const trustEventsByUser = new Map<string, TrustEventRow[]>();
  for (const eventRow of (trustEventsRaw ?? []) as TrustEventRow[]) {
    const bucket = trustEventsByUser.get(eventRow.user_id) ?? [];
    if (bucket.length < 6) {
      bucket.push(eventRow);
      trustEventsByUser.set(eventRow.user_id, bucket);
    }
  }

  const items = caseRows.map((moderationCase) => {
    const report = reportsById.get(moderationCase.report_id) ?? null;
    const message = report ? messagesById.get(report.message_id) ?? null : null;
    const circle = message ? circleByConversationId.get(message.conversation_id) ?? null : null;

    return {
      caseId: moderationCase.id,
      status: moderationCase.status,
      assignedTo: moderationCase.assigned_to,
      resolution: moderationCase.resolution,
      createdAt: moderationCase.created_at,
      updatedAt: moderationCase.updated_at,
      report: report
        ? {
            reportId: report.id,
            reporterId: report.reporter_id,
            reason: report.reason,
            details: report.details,
            createdAt: report.created_at
          }
        : null,
      message: message
        ? {
            messageId: message.id,
            senderId: message.sender_id,
            conversationId: message.conversation_id,
            body: message.body,
            createdAt: message.created_at,
            deletedAt: message.deleted_at,
            moderation: senderModeration.get(message.sender_id) ?? { status: 'active', until: null },
            trust:
              trustByUser.get(message.sender_id) ?? {
                user_id: message.sender_id,
                score: 50,
                tier: 'new',
                forced_tier: null
              }
          }
        : null,
      trustEvents: message ? trustEventsByUser.get(message.sender_id) ?? [] : [],
      circle: circle
        ? {
            circleId: circle.id,
            name: circle.name,
            conversationId: circle.conversation_id
          }
        : null
    };
  });

  return json({ items }, { headers: MODERATION_CACHE_HEADERS });
};
