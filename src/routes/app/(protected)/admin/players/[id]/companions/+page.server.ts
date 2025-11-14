import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { assertSuperAdmin, getAdminServiceClient } from '$lib/server/admin';

export const load: PageServerLoad = async (event) => {
  const playerId = event.params.id;
  const { supabase, session } = await getAdminServiceClient(event);
  await assertSuperAdmin(event, session);

  if (!playerId) {
    throw error(400, 'Missing player id');
  }

  const [{ data: userResult }, { data: companions, error: compError }] = await Promise.all([
    supabase.auth.admin.getUserById(playerId),
    supabase
      .from('companions')
      .select(
        'id,name,species,rarity,affection,trust,energy,state,is_active,slot_index,created_at,updated_at'
      )
      .eq('owner_id', playerId)
      .order('slot_index', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
  ]);

  if (compError) {
    console.error('[admin players] companions query failed', compError);
    throw error(500, 'Unable to load companions');
  }

  return {
    playerId,
    user: userResult?.user ?? null,
    companions: companions ?? []
  };
};
