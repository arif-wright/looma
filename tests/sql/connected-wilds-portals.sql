-- Execute after the disposable fixture, base world persistence, and candidate portal migration.
select set_config('request.jwt.claim.role', 'service_role', false);
do $$
declare
  u uuid := '11111111-1111-4111-8111-111111111111';
  other_user uuid := '22222222-2222-4222-8222-222222222222';
  result jsonb;
  before_state jsonb;
  actual jsonb;
begin
  result := public.fn_world_load_state(u, 'wilds-exploration');
  assert result->>'mapId' = 'wilds-exploration' and (result->>'stateVersion')::int = 1, 'initial source spawn';
  select to_jsonb(s) into before_state from public.player_world_state s where user_id = u;
  begin
    perform public.fn_world_travel_portal(u, 'wilds-exploration', 1, 'grove-to-hollow', 120,120,1);
    raise exception 'expected_range_rejection';
  exception when others then assert sqlerrm = 'portal_out_of_range', 'far portal rejected'; end;
  begin
    perform public.fn_world_travel_portal(u, 'wilds-exploration', 1, 'grove-to-hollow', 'NaN'::numeric,270,1);
    raise exception 'expected_nan_rejection';
  exception when others then assert sqlerrm = 'portal_out_of_range', 'nonfinite rejected'; end;
  begin
    perform public.fn_world_travel_portal(u, 'wilds-exploration', 1, 'hollow-to-grove', 880,270,1);
    raise exception 'expected_source_rejection';
  exception when others then assert sqlerrm = 'invalid_portal', 'wrong source portal rejected'; end;
  begin
    perform public.fn_world_travel_portal(u, 'wilds-exploration', 99, 'grove-to-hollow', 880,270,1);
    raise exception 'expected_version_rejection';
  exception when others then assert sqlerrm = 'invalid_or_obsolete_map', 'obsolete source rejected'; end;
  begin
    perform public.fn_world_travel_portal(u,'wilds-exploration',1,'grove-to-hollow',880,324.01,1);
    raise exception 'expected_range_rejection';
  exception when others then assert sqlerrm = 'portal_out_of_range', 'outside radius rejected'; end;
  begin
    perform public.fn_world_travel_portal(u,'wilds-exploration',1,'grove-to-hollow',null,270,1);
    raise exception 'expected_null_rejection';
  exception when others then assert sqlerrm = 'portal_out_of_range', 'null rejected'; end;
  begin
    perform public.fn_world_travel_portal(u,'wilds-exploration',1,'grove-to-hollow','Infinity'::numeric,270,1);
    raise exception 'expected_infinity_rejection';
  exception when others then assert sqlerrm = 'portal_out_of_range', 'infinity rejected'; end;
  result := public.fn_world_travel_portal(other_user, 'wilds-exploration',1,'grove-to-hollow',880,270,1);
  assert result->>'ok' = 'false', 'cannot transition a missing owner checkpoint';
  result := public.fn_world_travel_portal(u,'wilds-exploration',1,'grove-to-hollow',880,270,9);
  assert result->>'ok' = 'false', 'stale checkpoint rejected';
  select to_jsonb(s) into actual from public.player_world_state s where user_id = u;
  assert actual = before_state, 'failed transitions are mutation-free';

  result := public.fn_world_travel_portal(u,'wilds-exploration',1,'grove-to-hollow',880,324,1);
  assert result->>'ok' = 'true' and (result->>'stateVersion')::int = 2, 'exact radius accepted';
  result := public.fn_world_load_state(u,'wilds-exploration');
  assert result->>'mapId' = 'wilds-town' and (result->>'x')::numeric = 160 and (result->>'y')::numeric = 270 and (result->>'stateVersion')::int = 2, 'fresh join preserves destination';
  result := public.fn_world_save_state(u,'wilds-exploration',1,880,270,1);
  assert result->>'ok' = 'false', 'old map save cannot overwrite travel';
  result := public.fn_world_travel_portal(u,'wilds-exploration',1,'grove-to-hollow',880,270,1);
  assert result->>'ok' = 'false', 'replayed travel cannot change area twice';
  result := public.fn_world_save_state(u,'wilds-town',1,260,270,2);
  assert result->>'ok' = 'true' and (result->>'stateVersion')::int = 3, 'destination checkpoint saves normally';
  update public.world_maps set is_active = false where id = 'wilds-exploration';
  begin
    perform public.fn_world_travel_portal(u,'wilds-town',1,'hollow-to-grove',80,270,3);
    raise exception 'expected_disabled_rejection';
  exception when others then assert sqlerrm = 'destination_unavailable', 'disabled destination rejected'; end;
  update public.world_maps set is_active = true where id = 'wilds-exploration';
  result := public.fn_world_travel_portal(u,'wilds-town',1,'hollow-to-grove',80,270,3);
  assert result->>'ok' = 'true' and (result->>'stateVersion')::int = 4, 'return portal committed';
  result := public.fn_world_load_state(u,'wilds-town');
  assert result->>'mapId' = 'wilds-exploration' and (result->>'x')::numeric = 804 and (result->>'stateVersion')::int = 4, 'fresh join retains return destination';
  update public.player_world_state set map_version = 99 where user_id = u;
  result := public.fn_world_load_state(u, 'wilds-exploration');
  assert result->>'mapId' = 'wilds-exploration' and (result->>'x')::numeric = 120 and (result->>'stateVersion')::int = 5, 'obsolete checkpoint uses safe spawn';
  update public.player_world_state set x = 2000 where user_id = u;
  result := public.fn_world_load_state(u, 'wilds-exploration');
  assert (result->>'x')::numeric = 120 and (result->>'stateVersion')::int = 6, 'invalid checkpoint uses safe spawn';
  assert not has_function_privilege('anon','public.fn_world_travel_portal(uuid,text,integer,text,numeric,numeric,bigint)','execute'), 'anon cannot travel';
  assert not has_function_privilege('authenticated','public.fn_world_travel_portal(uuid,text,integer,text,numeric,numeric,bigint)','execute'), 'authenticated cannot travel directly';
  assert has_function_privilege('service_role','public.fn_world_travel_portal(uuid,text,integer,text,numeric,numeric,bigint)','execute'), 'service can travel';
end;
$$;
select set_config('request.jwt.claim.role', 'authenticated', false);
do $$
begin
  begin
    perform public.fn_world_travel_portal('11111111-1111-4111-8111-111111111111','wilds-exploration',1,'grove-to-hollow',880,270,4);
    raise exception 'expected_role_rejection';
  exception when insufficient_privilege then null; end;
end;
$$;
select 'Connected Wilds sequential SQL and ACL checks passed' as verification;
