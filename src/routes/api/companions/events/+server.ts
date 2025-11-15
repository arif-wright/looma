import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { BOND_MILESTONES } from '$lib/companions/bond';

const MAX_LIMIT = 50;

const formatDelta = (value = 0) => (value >= 0 ? `+${value}` : `${value}`);

const milestoneMeta = new Map(BOND_MILESTONES.map((entry) => [entry.action, entry]));

const formatLabel = (action = 'care', affection = 0, trust = 0, energy = 0) => {
  const milestone = milestoneMeta.get(action);
  if (milestone) {
    return milestone.label;
  }
  const title = action ? `${action.charAt(0).toUpperCase()}${action.slice(1)}` : 'Care';
  return `${title} ${formatDelta(affection)} aff ${formatDelta(trust)} trust ${formatDelta(energy)} energy`;
};

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const companionId = event.url.searchParams.get('id');
  const limitParam = event.url.searchParams.get('limit');
  const limitCandidate = limitParam ? Number(limitParam) : 20;
  const limit = Number.isFinite(limitCandidate) && limitCandidate > 0 ? Math.min(Math.trunc(limitCandidate), MAX_LIMIT) : 20;

  if (!companionId) {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('companion_care_events')
    .select('id, action, affection_delta, trust_delta, energy_delta, created_at, note')
    .eq('owner_id', session.user.id)
    .eq('companion_id', companionId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return json({ error: error.message ?? 'events_failed' }, { status: 400 });
  }

  const events = (data ?? []).map((row) => {
    const action = (row.action ?? 'care').toLowerCase();
    const milestone = milestoneMeta.get(action);
    if (milestone) {
      return {
        ...row,
        kind: milestone.action,
        message: row.note ?? milestone.note('your companion'),
        label: milestone.label
      };
    }
    const kind = action === 'passive' || action === 'daily_bonus' ? action : 'care';
    return {
      ...row,
      kind,
      message: row.note ?? formatLabel(action, row.affection_delta ?? 0, row.trust_delta ?? 0, row.energy_delta ?? 0),
      label: formatLabel(action, row.affection_delta ?? 0, row.trust_delta ?? 0, row.energy_delta ?? 0)
    };
  });

  return json({ ok: true, events });
};
