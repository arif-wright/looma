import type { PageLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';

export const load: PageLoad = async (event) => {
  const user = event.locals.user;
  if (!user) {
    const redirectTo = event.url.pathname + event.url.search;
    throw redirect(302, '/app/login?next=' + encodeURIComponent(redirectTo));
  }

  const supabase = event.locals.supabase ?? supabaseServer(event);
  const id = event.params.id;

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
