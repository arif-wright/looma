import { resolveCanonicalActiveCompanion } from '$lib/companions/activeCompanion';
import { seedToArchetype } from '$lib/onboarding/archetypes';

export type WorldCompanionRow = {
  id: string;
  owner_id: string;
  name: string | null;
  species: string | null;
  is_active: boolean | null;
  slot_index?: number | null;
};

export type PublicWorldCompanion = {
  present: boolean;
  name: string;
  kind: string;
  availability: 'available' | 'unavailable';
};

const safeName = (value: string | null) => value?.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 32) || 'Companion';
const safeKind = (value: string | null) => {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) ?? '';
  return seedToArchetype[normalized] ?? (normalized || 'muse');
};

export const unavailableWorldCompanion = (): PublicWorldCompanion => ({
  present: false, name: '', kind: '', availability: 'unavailable'
});

export const resolveWorldCompanionProjection = (
  userId: string,
  rows: WorldCompanionRow[] | null | undefined,
  queryAvailable = true
): PublicWorldCompanion => {
  if (!queryAvailable) return unavailableWorldCompanion();
  const owned = (rows ?? []).filter((row) => row.owner_id === userId);
  const selected = resolveCanonicalActiveCompanion(null, owned);
  if (!selected) return unavailableWorldCompanion();
  return {
    present: true,
    name: safeName(selected.name),
    kind: safeKind(selected.species),
    availability: 'available'
  };
};
