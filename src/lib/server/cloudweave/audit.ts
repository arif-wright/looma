import type { SupabaseClient } from '@supabase/supabase-js';
import { hashSignature } from '$lib/server/cloudweave/sign';

export type CloudWeaveAuditAction =
  | 'export'
  | 'import_attempt'
  | 'import_applied'
  | 'import_rejected'
  | 'clear_state'
  | 'consent_change';

export const writeCloudWeaveAuditLog = async (args: {
  supabase: SupabaseClient;
  userId: string;
  companionId: string;
  action: CloudWeaveAuditAction;
  exportVersion: string;
  signature?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  const signature = typeof args.signature === 'string' ? args.signature : null;
  const metadata = {
    ...(args.metadata ?? {}),
    ...(signature ? { signatureHash: hashSignature(signature) } : {})
  };
  const { error } = await args.supabase.from('cloudweave_audit_log').insert({
    user_id: args.userId,
    companion_id: args.companionId,
    action: args.action,
    export_version: args.exportVersion,
    signature_prefix: signature ? signature.slice(0, 12) : null,
    metadata_json: metadata
  });
  if (error) {
    console.error('[cloudweave] audit log insert failed', {
      action: args.action,
      userId: args.userId,
      companionId: args.companionId,
      error
    });
  }
};
