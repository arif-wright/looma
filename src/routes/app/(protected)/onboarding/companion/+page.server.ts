import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { canSpawnCompanion } from '$lib/launch/proofIntegrity';

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

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    throw redirect(302, '/app/auth');
  }

  const adminClient = getAdminClient();
  const retake = url.searchParams.get('retake') === '1';
  const userId = locals.user.id;

  const [{ data: traits }, { count: companionCount, error: companionError }] = await Promise.all([
    adminClient
      .from('player_traits')
      .select('consent')
      .eq('user_id', userId)
      .maybeSingle(),
    adminClient
      .from('companions')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId)
  ]);

  if (companionError) {
    console.error('[bond-genesis] companion count lookup failed', companionError);
  }

  return {
    consentDefault: traits?.consent ?? true,
    hasCompanion: !companionError && (companionCount ?? 0) > 0,
    spawnEligible: canSpawnCompanion(companionCount, Boolean(companionError)),
    spawnEligibilityUnknown: Boolean(companionError),
    retake
  };
};
