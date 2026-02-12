import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import type { SignedCloudWeaveBundle } from '$lib/server/cloudweave/sign';
import { hashSignature, verifyExport } from '$lib/server/cloudweave/sign';
import { getCloudWeaveConfig } from '$lib/server/cloudweave/config';
import { writeCloudWeaveAuditLog } from '$lib/server/cloudweave/audit';
import { enforceCloudWeaveRateLimit } from '$lib/server/cloudweave/rate';
import { getConsentFlags } from '$lib/server/consent';

type CloudWeaveImportPayload = {
  version?: string;
  userId?: string;
  companionId?: string;
  emotionalState?: {
    mood?: string;
    trust?: number;
    bond?: number;
    streakMomentum?: number;
    volatility?: number;
    recentTone?: string | null;
    lastMilestoneAt?: string | null;
  };
  memorySummary?: {
    summaryText?: string;
    highlights?: string[];
  };
};

const clamp01 = (value: unknown, fallback = 0) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
};

const moodOrDefault = (value: unknown) => (value === 'luminous' || value === 'dim' || value === 'steady' ? value : 'steady');

const safeHighlights = (input: unknown) => {
  if (!Array.isArray(input)) return [];
  return input.filter((entry): entry is string => typeof entry === 'string').slice(0, 7);
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) return json({ error: 'unauthorized' }, { status: 401 });

  const rate = enforceCloudWeaveRateLimit(
    'import',
    session.user.id,
    typeof event.getClientAddress === 'function' ? event.getClientAddress() : null
  );
  if (!rate.ok) {
    return json({ error: rate.code, message: rate.message, retryAfter: rate.retryAfter }, { status: rate.status });
  }

  const config = getCloudWeaveConfig();
  const bundle = (await event.request.json().catch(() => null)) as SignedCloudWeaveBundle<CloudWeaveImportPayload> | null;
  const bundleSignature = typeof bundle?.signature === 'string' ? bundle.signature : null;
  const payload = bundle?.payload ?? null;
  const companionId = typeof payload?.companionId === 'string' ? payload.companionId : 'unknown';
  const version = typeof payload?.version === 'string' ? payload.version : config.exportVersion;

  await writeCloudWeaveAuditLog({
    supabase,
    userId: session.user.id,
    companionId,
    action: 'import_attempt',
    exportVersion: version,
    signature: bundleSignature,
    metadata: { signedAt: bundle?.signedAt ?? null }
  });

  if (!config.importEnabled) {
    await writeCloudWeaveAuditLog({
      supabase,
      userId: session.user.id,
      companionId,
      action: 'import_rejected',
      exportVersion: version,
      signature: bundleSignature,
      metadata: { reason: 'import_disabled' }
    });
    return json(
      {
        error: 'cloudweave_import_disabled',
        message: 'CloudWeave import is disabled in this environment.'
      },
      { status: 403 }
    );
  }

  const signatureCheck = verifyExport(bundle);
  if (!signatureCheck.ok) {
    await writeCloudWeaveAuditLog({
      supabase,
      userId: session.user.id,
      companionId,
      action: 'import_rejected',
      exportVersion: version,
      signature: bundleSignature,
      metadata: { reason: signatureCheck.reason }
    });
    return json({ error: 'invalid_signature', message: 'Bundle signature verification failed.' }, { status: 400 });
  }
  if (!bundle || !bundleSignature) {
    return json({ error: 'invalid_bundle', message: 'Signed bundle is required.' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object') {
    return json({ error: 'invalid_payload', message: 'Import payload is missing.' }, { status: 400 });
  }
  if (payload.version !== config.exportVersion) {
    await writeCloudWeaveAuditLog({
      supabase,
      userId: session.user.id,
      companionId,
      action: 'import_rejected',
      exportVersion: version,
      signature: bundleSignature,
      metadata: { reason: 'version_mismatch', expected: config.exportVersion, received: payload.version ?? null }
    });
    return json({ error: 'version_mismatch', message: 'Export version is not supported.' }, { status: 400 });
  }
  if (payload.userId !== session.user.id) {
    await writeCloudWeaveAuditLog({
      supabase,
      userId: session.user.id,
      companionId,
      action: 'import_rejected',
      exportVersion: version,
      signature: bundleSignature,
      metadata: { reason: 'user_mismatch' }
    });
    return json({ error: 'user_mismatch', message: 'Bundle user does not match the current account.' }, { status: 403 });
  }
  if (!payload.companionId || payload.companionId.trim().length === 0) {
    return json({ error: 'companion_required', message: 'Companion id is required.' }, { status: 400 });
  }

  const consent = await getConsentFlags(event, supabase);
  if (!consent.crossAppContinuity) {
    await writeCloudWeaveAuditLog({
      supabase,
      userId: session.user.id,
      companionId: payload.companionId,
      action: 'import_rejected',
      exportVersion: version,
      signature: bundleSignature,
      metadata: { reason: 'consent_cross_app_continuity_off' }
    });
    return json(
      { error: 'cross_app_consent_required', message: 'Enable cross-app continuity consent before importing.' },
      { status: 403 }
    );
  }

  const windowStartIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const signatureHash = hashSignature(bundleSignature);
  const replayCheck = await supabase
    .from('cloudweave_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.user.id)
    .in('action', ['import_attempt', 'import_applied'])
    .contains('metadata_json', { signatureHash })
    .gte('created_at', windowStartIso);

  if (replayCheck.error) {
    console.error('[cloudweave/import] replay check failed', replayCheck.error);
    return json({ error: 'replay_check_failed', message: 'Unable to verify import replay status.' }, { status: 500 });
  }

  if ((replayCheck.count ?? 0) > 1) {
    await writeCloudWeaveAuditLog({
      supabase,
      userId: session.user.id,
      companionId: payload.companionId,
      action: 'import_rejected',
      exportVersion: version,
      signature: bundleSignature,
      metadata: { reason: 'replay_blocked_24h' }
    });
    return json({ error: 'import_replayed', message: 'This signed import bundle was already used recently.' }, { status: 409 });
  }

  const emotional = payload.emotionalState ?? {};
  const summary = payload.memorySummary ?? {};
  const highlights = safeHighlights(summary.highlights);

  const [emotionalUpsert, summaryUpsert] = await Promise.all([
    supabase.from('companion_emotional_state').upsert(
      {
        user_id: session.user.id,
        companion_id: payload.companionId,
        mood: moodOrDefault(emotional.mood),
        trust: clamp01(emotional.trust, 0),
        bond: clamp01(emotional.bond, 0),
        streak_momentum: clamp01(emotional.streakMomentum, 0),
        volatility: clamp01(emotional.volatility, 0),
        recent_tone: typeof emotional.recentTone === 'string' ? emotional.recentTone.slice(0, 80) : null,
        last_milestone_at: typeof emotional.lastMilestoneAt === 'string' ? emotional.lastMilestoneAt : null
      },
      { onConflict: 'user_id,companion_id', ignoreDuplicates: false }
    ),
    supabase.from('companion_memory_summary').upsert(
      {
        user_id: session.user.id,
        companion_id: payload.companionId,
        summary_text: typeof summary.summaryText === 'string' ? summary.summaryText.slice(0, 1200) : '',
        highlights_json: highlights,
        last_built_at: new Date().toISOString()
      },
      { onConflict: 'user_id,companion_id', ignoreDuplicates: false }
    )
  ]);

  if (emotionalUpsert.error || summaryUpsert.error) {
    console.error('[cloudweave/import] import apply failed', {
      emotionalError: emotionalUpsert.error,
      summaryError: summaryUpsert.error
    });
    return json({ error: 'import_apply_failed', message: 'Could not apply imported state.' }, { status: 500 });
  }

  await writeCloudWeaveAuditLog({
    supabase,
    userId: session.user.id,
    companionId: payload.companionId,
    action: 'import_applied',
    exportVersion: version,
    signature: bundleSignature,
    metadata: {
      importedFields: ['emotional_state', 'memory_summary']
    }
  });

  return json({
    ok: true,
    companionId: payload.companionId,
    importedFields: ['emotional_state', 'memory_summary']
  });
};
