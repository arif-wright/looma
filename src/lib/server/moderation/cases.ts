import type { SupabaseClient } from '@supabase/supabase-js';

export type ModerationCaseStatus = 'open' | 'under_review' | 'resolved' | 'dismissed';

export const parseCaseStatus = (value: unknown): ModerationCaseStatus | null => {
  if (value === 'open' || value === 'under_review' || value === 'resolved' || value === 'dismissed') {
    return value;
  }
  return null;
};

export const ensureCaseForReport = async (
  supabase: SupabaseClient,
  reportId: string
): Promise<string | null> => {
  const { data: existing } = await supabase
    .from('moderation_cases')
    .select('id')
    .eq('report_id', reportId)
    .maybeSingle<{ id: string }>();

  if (existing?.id) return existing.id;

  const { data: inserted } = await supabase
    .from('moderation_cases')
    .insert({ report_id: reportId, status: 'open' })
    .select('id')
    .maybeSingle<{ id: string }>();

  return inserted?.id ?? null;
};
