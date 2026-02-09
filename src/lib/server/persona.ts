import { createClient } from '@supabase/supabase-js';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';

const getAdminClient = () => {
  const url = publicEnv.PUBLIC_SUPABASE_URL;
  const key = privateEnv.SUPABASE_SERVICE_ROLE_KEY ?? privateEnv.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    throw new Error('Supabase service client is not configured');
  }
  return createClient(url, key, {
    auth: { persistSession: false }
  });
};

type PersonaSummary = Record<string, any> | null;

export async function getPersonaSummary(userId: string | null | undefined): Promise<PersonaSummary> {
  if (!userId) return null;

  const adminClient = getAdminClient();
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
