-- Server-admin acquisition path only. No new gameplay-table privileges or backfill.
create function public.unlock_care_moss_seat(p_owner_id uuid, p_companion_id uuid, p_care_event_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  comp public.companions%rowtype;
  item public.item_catalog%rowtype;
  owned_id uuid;
  evidence jsonb;
  provenance jsonb;
begin
  -- Serialize award attempts for one owner/companion; the existing unique key
  -- remains the final arbiter if another acquisition writer bypasses this lock.
  select * into comp from public.companions c
    where c.id=p_companion_id and c.owner_id=p_owner_id for no key update;
  if not found then return null; end if;
  -- A successful persisted direct-care event is required even when older events qualify.
  if not exists (select 1 from public.companion_care_events e
    where e.id=p_care_event_id and e.owner_id=p_owner_id and e.companion_id=p_companion_id
      and e.action in ('feed','play','groom')) then return null; end if;

  select * into item from public.item_catalog where item_key='care-moss-seat';
  if not found then return null; end if;
  -- Never rewrite/backfill a legacy award or claim evidence we do not know.
  if exists (select 1 from public.user_items u where u.owner_id=p_owner_id
    and u.companion_id=p_companion_id and u.item_id=item.id
    and u.source_type='care_milestone' and u.source_key='care_3') then return null; end if;

  select jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'createdAt',e.created_at)
    order by e.created_at,e.id) into evidence
  from (select id,action,created_at from public.companion_care_events
    where owner_id=p_owner_id and companion_id=p_companion_id and action in ('feed','play','groom')
    order by created_at,id limit 3) e;
  if coalesce(jsonb_array_length(evidence),0) < 3 then return null; end if;
  provenance := jsonb_build_object('careMoments',3,'companionName',comp.name,
    'reason','Earned after three moments of care.','ruleVersion','direct-care-3-v1','careEvents',evidence);
  insert into public.user_items(owner_id,companion_id,item_id,source_type,source_key,provenance_json)
    values(p_owner_id,p_companion_id,item.id,'care_milestone','care_3',provenance)
    on conflict(owner_id,companion_id,item_id,source_type,source_key) do nothing
    returning id into owned_id;
  if owned_id is null then return null; end if;

  -- No exception swallowing: a failed memory insert rolls back this new award.
  insert into public.companion_journal_entries(owner_id,companion_id,source_type,source_id,title,body,meta_json)
    values(p_owner_id,p_companion_id,'system',owned_id,comp.name || ' found a Moss Seat',
      'After three moments of care, ' || comp.name || ' found a soft place that now belongs in your shared sanctuary.',
      jsonb_build_object('category','item_unlock','itemKey',item.item_key,
        'sourceType','care_milestone','sourceKey','care_3','userItemId',owned_id,
        'ruleVersion','direct-care-3-v1','careEvents',evidence));
  return jsonb_build_object('id',owned_id,'itemKey',item.item_key,'title',item.title,'description',item.description);
end;
$$;
revoke all on function public.unlock_care_moss_seat(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.unlock_care_moss_seat(uuid,uuid,uuid) to service_role;
