import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('../../../supabase/migrations/20260802210000_world_persistence.sql', import.meta.url),
  'utf8'
).toLowerCase();

describe('Stage 5 migration contract', () => {
  it('enables RLS and permits owner reads without direct client writes', () => {
    for (const table of ['world_maps', 'world_landmarks', 'player_world_state', 'world_landmark_discoveries']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain('player_world_state_owner_select');
    expect(sql).toContain('world_discoveries_owner_select');
    expect(sql).toContain('revoke insert, update, delete on public.player_world_state from anon, authenticated');
  });

  it('restricts fixed-search-path RPCs to the backend service role', () => {
    for (const fn of ['fn_world_load_state', 'fn_world_save_state', 'fn_world_record_landmark']) {
      expect(sql).toContain(`create or replace function public.${fn}`);
      expect(sql).toContain(`grant execute on function public.${fn}`);
    }
    expect(sql.match(/security definer/g)?.length).toBe(3);
    expect(sql.match(/set search_path = public/g)?.length).toBeGreaterThanOrEqual(4);
    expect(sql.match(/world_service_only/g)?.length).toBe(3);
  });

  it('contains coordinate, map-version, and discovery idempotency guards', () => {
    expect(sql).toContain("raise exception 'invalid_coordinates'");
    expect(sql).toContain("raise exception 'invalid_or_obsolete_map'");
    expect(sql).toContain('unique (user_id, idempotency_key)');
    expect(sql).toContain('on conflict do nothing');
    expect(sql).not.toMatch(/insert into public\.(user_items|wallets|economy_transactions)/);
  });
});
