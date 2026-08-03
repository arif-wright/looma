import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('../../../supabase/migrations/20260803120000_world_moonberry_gather.sql', import.meta.url), 'utf8'
).toLowerCase();

describe('Stage 6 Moonberry migration contract', () => {
  it('uses unified inventory through a service-only atomic command', () => {
    expect(sql).toContain('insert into public.user_items');
    expect(sql).not.toMatch(/create table if not exists public\.(world_inventory|inventory_balance)/);
    expect(sql).toContain('create or replace function public.fn_world_gather_moonberry');
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = public');
    expect(sql).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(sql).toContain('grant execute on function public.fn_world_gather_moonberry');
  });

  it('derives the reward and prevents replay and concurrent grants', () => {
    expect(sql).toContain("v_item.item_key <> 'world-moonberry'");
    expect(sql).not.toMatch(/p_(reward|item)(_key|_id)?/);
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('unique (user_id, event_type, idempotency_key)');
    expect(sql).toContain('max_owned_quantity');
    expect(sql).toContain("raise exception 'node_out_of_range'");
    expect(sql).toContain("raise exception 'landmark_not_discovered'");
  });

  it('records a safe authored memory without an LLM or economy write', () => {
    expect(sql).toContain('insert into public.companion_journal_entries');
    expect(sql).toContain("'system', v_event_id");
    expect(sql).toContain('on conflict (owner_id, companion_id, source_type, source_id) do nothing');
    expect(sql).toContain("when 'muse'");
    expect(sql).toContain("when 'guardian'");
    expect(sql).not.toMatch(/openai|anthropic|llm/);
    expect(sql).not.toMatch(/insert into public\.(wallets|user_wallets|economy_transactions)/);
  });

  it('keeps direct durable writes out of browser roles', () => {
    expect(sql).toContain('alter table public.world_events enable row level security');
    expect(sql).toContain('world_events_owner_select');
    expect(sql).toContain('revoke insert, update, delete on public.world_events from anon, authenticated');
    expect(sql).toContain('from public, anon, authenticated');
  });
});
