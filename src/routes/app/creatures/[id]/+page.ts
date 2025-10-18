import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';

export const load: PageLoad = async (event) => {
  const supabase = supabaseServer(event);
  const id = event.params.id;

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw error(302, {
      message: 'Redirect',
      location: '/login?next=' + encodeURIComponent(event.url.pathname)
    });
  }

  const { data, error: err } = await supabase
    .from('creatures')
    .select('id, name, bonded, alignment, traits, created_at, species:species_id ( id, key, name, description )')
    .eq('id', id)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (err) throw error(500, err.message);
  if (!data) throw error(404, 'Creature not found');

  return { creature: data };
};
