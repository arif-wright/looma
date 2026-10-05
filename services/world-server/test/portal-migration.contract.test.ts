import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORLD_AREAS } from '../src/world/portals.js';
const sql = readFileSync(new URL('../../../supabase/migrations/20261005052000_connected_wilds_portals.sql', import.meta.url), 'utf8');

describe('proposed connected-area migration contract', () => {
  it('keeps service-only authority, serialized first loads and expected-version travel', () => {
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('world-load:' || p_user::text, 0))");
    expect(sql).toContain('for update');
    expect(sql.match(/security definer/g)).toHaveLength(2);
    expect(sql.match(/set search_path = public/g)).toHaveLength(2);
    expect(sql.match(/world_service_only/g)).toHaveLength(2);
    expect(sql).toContain('where user_id = p_user and map_id = p_map_id and map_version = p_map_version');
    expect(sql).toContain('and state_version = p_expected_state_version');
    expect(sql).toContain('from public, anon, authenticated');
    expect(sql).not.toMatch(/insert into public\.(user_items|wallets|economy_transactions)|fn_economy|grant .*authenticated;/);
  });
  it('matches both canonical manifest endpoints without caller-controlled destination coordinates', () => {
    for (const area of Object.values(WORLD_AREAS)) {
      expect(sql).toContain(`p_map_id = '${area.id}' and p_portal_id = '${area.portal.id}'`);
      expect(sql).toContain(`v_target := '${area.portal.targetMapId}'; v_portal_x := ${area.portal.x}; v_arrival_x := ${area.portal.arrival.x}`);
      expect(area.portal.y).toBe(270); expect(area.portal.arrival.y).toBe(270); expect(area.portal.radius).toBe(54);
    }
    expect(sql).not.toMatch(/p_destination|p_arrival|p_target/);
  });
});
