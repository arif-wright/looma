import { supabaseAdmin } from '$lib/server/supabase';

type AuditEvent = 'start' | 'complete' | 'reject' | 'share_reject' | 'econ_reject' | 'shop_reject';

type AuditPayload = {
  userId: string;
  sessionId: string | null;
  event: AuditEvent;
  ip?: string | null;
  details?: Record<string, unknown>;
};

export const logGameAudit = async ({ userId, sessionId, event, ip, details }: AuditPayload) => {
  try {
    await supabaseAdmin.from('game_audit').insert({
      user_id: userId,
      session_id: sessionId,
      event,
      ip: ip ?? null,
      details: details ?? {}
    });
  } catch (err) {
    console.error('[games:audit] failed to persist audit entry', err);
  }
};
