import { supabaseBrowser } from '$lib/supabaseClient';

export type CreatureRow = {
  id: string;
  name: string | null;
  bonded: boolean;
  alignment?: string | null;
  traits?: any;
  created_at?: string;
  species: { id: string; key: string; name: string; description?: string | null } | null;
};

export async function fetchCreatureById(id: string): Promise<CreatureRow | null> {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase
    .from('creatures')
    .select(`
      id, name, bonded, alignment, traits, created_at,
      species:species_id ( id, key, name, description )
    `)
    .eq('id', id)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as CreatureRow | null;
}
