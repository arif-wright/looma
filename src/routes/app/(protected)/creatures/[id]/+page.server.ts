import { error, redirect } from '@sveltejs/kit';

export const load = async (event: any) => {
  const user = event.locals.user;
  if (!user) {
    const redirectTo = event.url.pathname + event.url.search;
    throw redirect(302, '/app/auth?next=' + encodeURIComponent(redirectTo));
  }

  const supabase = event.locals.supabase;
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
