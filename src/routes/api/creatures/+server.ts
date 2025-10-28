import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { CreatureView, Rarity } from '$lib/types/creatures';
import { updateUserContext } from '$lib/server/userContext';
import { recordAnalyticsEvent } from '$lib/server/analytics';

type CreatureRow = {
  id: string;
  owner_id: string;
  species_id: string;
  nickname: string | null;
  bond_level: number;
  created_at: string;
  species: { name: string; rarity: Rarity } | null;
};

const jsonError = (status: number, message: string) =>
  json({ ok: false, error: message }, { status });

export const GET: RequestHandler = async ({ locals }) => {
  const session = locals.session;
  if (!session) {
    return jsonError(401, 'Not authenticated');
  }

  const { data, error } = await locals.supabase
    .from('creatures')
    .select(
      'id, owner_id, species_id, nickname, bond_level, created_at, species:creatures_species(name, rarity)'
    )
    .order('created_at', { ascending: false });

  if (error) {
    return jsonError(500, error.message);
  }

  const creatures: CreatureView[] = ((data ?? []) as CreatureRow[]).map((item) => ({
    id: item.id,
    owner_id: item.owner_id,
    species_id: item.species_id,
    nickname: item.nickname,
    bond_level: item.bond_level,
    created_at: item.created_at,
    species_name: item.species?.name ?? 'Unknown',
    species_rarity: (item.species?.rarity ?? 'common') as Rarity
  }));

  return json({ ok: true, creatures });
};

export const POST: RequestHandler = async (event) => {
  const { locals, request } = event;
  const session = locals.session;
  if (!session) {
    return jsonError(401, 'Not authenticated');
  }

  let payload: { species_id?: unknown; nickname?: unknown };
  try {
    payload = await request.json();
  } catch (cause) {
    return jsonError(400, 'Invalid JSON body');
  }

  const species_id = typeof payload.species_id === 'string' ? payload.species_id.trim() : '';
  const nickname = typeof payload.nickname === 'string' ? payload.nickname.trim() : '';

  if (!species_id) {
    return jsonError(400, 'species_id is required');
  }

  const { data: species, error: speciesError } = await locals.supabase
    .from('creatures_species')
    .select('id, name, rarity')
    .eq('id', species_id)
    .single();

  if (speciesError || !species) {
    return jsonError(400, 'Unknown species');
  }

  const insert = {
    owner_id: session.user.id,
    species_id,
    nickname: nickname || null
  };

  const { data, error: insertError } = await locals.supabase
    .from('creatures')
    .insert(insert)
    .select(
      'id, owner_id, species_id, nickname, bond_level, created_at, species:creatures_species(name, rarity)'
    )
    .single();

  if (insertError || !data) {
    return jsonError(500, insertError?.message ?? 'Failed to create creature');
  }

  const creature: CreatureView = {
    id: data.id,
    owner_id: data.owner_id,
    species_id: data.species_id,
    nickname: data.nickname,
    bond_level: data.bond_level,
    created_at: data.created_at,
    species_name: data.species?.name ?? species.name,
    species_rarity: (data.species?.rarity ?? species.rarity) as Rarity
  };

  await updateUserContext(
    event,
    'creature',
    {
      creatureId: creature.id,
      interaction: 'adopt'
    },
    'care'
  );

  await recordAnalyticsEvent(locals.supabase, session.user.id, 'pet_interaction', {
    surface: 'creatures',
    payload: {
      creatureId: creature.id,
      action: 'adopt'
    }
  });

  return json({ ok: true, creature });
};
