import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

const adminClient = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

type PersonaSummary = Record<string, any> | null;

export async function getPersonaSummary(userId: string | null | undefined): Promise<PersonaSummary> {
  if (!userId) return null;

  const { data, error } = await adminClient
    .from('persona_profiles')
    .select('summary')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[persona] summary lookup failed', error);
    return null;
  }

  return (data?.summary as Record<string, any> | null) ?? null;
}
