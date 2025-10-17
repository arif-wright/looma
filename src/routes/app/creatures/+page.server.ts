import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { CreatureView, Species } from '$lib/types/creatures';

export const load: PageServerLoad = async ({ fetch, locals }) => {
  const session = locals.session;
  if (!session) {
    return { creatures: [] as CreatureView[], species: [] as Species[] };
  }

  const response = await fetch('/api/creatures');
  if (!response.ok) {
    throw error(response.status, 'Failed to load creatures');
  }

  const { creatures } = (await response.json()) as { creatures: CreatureView[] };

  const { data: speciesData, error: speciesError } = await locals.supabase
    .from('creatures_species')
    .select('id, name, rarity, created_at')
    .order('name', { ascending: true });

  if (speciesError) {
    throw error(500, speciesError.message);
  }

  return {
    creatures,
    species: (speciesData ?? []) as Species[]
  };
};
