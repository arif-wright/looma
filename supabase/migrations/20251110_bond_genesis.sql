-- Phase 13.1 — Bond Genesis (personality → archetype → first companion)

-- ===============================================================
-- 1) Feature flag gate
-- ===============================================================
create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  note text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.feature_flags (key, enabled, note)
values ('bond_genesis', true, 'Enable personality onboarding → archetype matching')
on conflict (key) do nothing;

-- ===============================================================
-- 2) Player traits + persona profile
-- ===============================================================
create table if not exists public.player_traits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  raw jsonb,
  facets jsonb,
  archetype text,
  consent boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.player_traits enable row level security;

create policy "traits_owner_read" on public.player_traits
  for select to authenticated
  using (auth.uid() = user_id);

create policy "traits_owner_write" on public.player_traits
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "traits_owner_upd" on public.player_traits
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.persona_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  summary jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.persona_profiles enable row level security;

create policy "persona_owner_read" on public.persona_profiles
  for select to authenticated
  using (auth.uid() = user_id);

create policy "persona_owner_upd" on public.persona_profiles
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "persona_owner_mod" on public.persona_profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ===============================================================
-- 3) Archetype catalog
-- ===============================================================
create table if not exists public.companion_archetypes (
  key text primary key,
  name text not null,
  description text not null,
  color text not null,
  seed text not null,
  thresholds jsonb not null
);

alter table public.companion_archetypes enable row level security;

create policy "any_read_archetypes" on public.companion_archetypes
  for select to authenticated
  using (true);

insert into public.companion_archetypes (key, name, description, color, seed, thresholds) values
  ('lumina','Lumina','Empathic and nurturing, a gentle reflector that steadies you.','#f5a7b8','warm-encouraging','{"empathy":"high"}'),
  ('vexel','Vexel','Curious tinkerer with a quick wit and a love for puzzles.','#3ad7ff','clever-inquisitive','{"curiosity":"high"}'),
  ('aurex','Aurex','Loyal protector, confident and direct when stakes rise.','#ffba3a','direct-confident','{"structure":"high"}'),
  ('mirae','Mirae','Dreamy collaborator who turns moments into tiny stories.','#b38bff','poetic-soft','{"empathy":"medium|high","structure":"low|medium"}'),
  ('tova','Tova','Practical realist with dry humor and calm consistency.','#9ab27c','grounded-humor','{"structure":"medium","curiosity":"low|medium"}'),
  ('kynth','Kynth','Mischief and sparkle; keeps you playful and moving.','#ff4fb8','witty-playful','{"curiosity":"medium|high","structure":"low"}'),
  ('elar','Elar','Tranquil observer, centers your focus and breath.','#2ad1c9','tranquil-centered','{"empathy":"medium","structure":"medium","curiosity":"low"}'),
  ('nira','Nira','Driven motivator who nudges you toward momentum.','#ff5a5f','focused-motivating','{"structure":"high","curiosity":"medium"}')
on conflict (key) do nothing;

-- ===============================================================
-- 4) Facet scoring + persona summarization helpers
-- ===============================================================
create or replace function public.compute_facets(p_answers jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  e int := 0; i int := 0; n int := 0; s int := 0;
  t int := 0; f int := 0; j int := 0; p int := 0;
  empathy int := 0; curiosity int := 0; structure int := 0;
  item jsonb;
begin
  for item in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) loop
    if (item->>'axis') = 'EI' then
      if (item->>'choice') = 'A' then e := e + 1; else i := i + 1; end if;
    elsif (item->>'axis') = 'NS' then
      if (item->>'choice') = 'A' then n := n + 1; else s := s + 1; end if;
    elsif (item->>'axis') = 'TF' then
      if (item->>'choice') = 'A' then t := t + 1; else f := f + 1; end if;
    elsif (item->>'axis') = 'JP' then
      if (item->>'choice') = 'A' then j := j + 1; else p := p + 1; end if;
    end if;

    if (item->>'facet') = 'empathy' and (item->>'choice') = 'A' then
      empathy := empathy + 1;
    end if;
    if (item->>'facet') = 'curiosity' and (item->>'choice') = 'A' then
      curiosity := curiosity + 1;
    end if;
    if (item->>'facet') = 'structure' and (item->>'choice') = 'A' then
      structure := structure + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'E', e, 'I', i, 'N', n, 'S', s, 'T', t, 'F', f, 'J', j, 'P', p,
    'empathy', empathy, 'curiosity', curiosity, 'structure', structure
  );
end;
$$;

create or replace function public.persona_summary(p_facets jsonb, p_arch text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'archetype', coalesce(p_arch, 'Neutral'),
    'traits', jsonb_build_object(
      'empathy', coalesce((p_facets->>'empathy')::int, 0),
      'curiosity', coalesce((p_facets->>'curiosity')::int, 0),
      'structure', coalesce((p_facets->>'structure')::int, 0)
    ),
    'pacing', jsonb_build_object(
      'explanations', case when coalesce((p_facets->>'structure')::int, 0) >= 3 then 'short' else 'gentle' end,
      'choices', case when coalesce((p_facets->>'curiosity')::int, 0) >= 3 then 2 else 1 end
    )
  );
$$;

-- ===============================================================
-- 5) Match archetype by thresholds
-- ===============================================================
create or replace function public.choose_archetype(p_facets jsonb)
returns text
language plpgsql
stable
as $$
declare
  a record;
  best_key text := 'mirae';
  best_score int := -9999;
  score int;
  want text;
  val int;
  slot text;
  wants text[];
  w text;
begin
  for a in select * from public.companion_archetypes loop
    score := 0;
    for slot, want in select * from jsonb_each_text(a.thresholds) loop
      val := coalesce((p_facets->>slot)::int, 0);
      wants := string_to_array(want, '|');
      for w in select unnest(wants) loop
        if w = 'high' and val >= 4 then
          score := score + 2;
        elsif w = 'medium' and val between 2 and 3 then
          score := score + 1;
        elsif w = 'low' and val <= 1 then
          score := score + 1;
        elsif left(w, 2) = '>=' then
          if val >= (right(w, length(w) - 2))::int then
            score := score + 1;
          end if;
        end if;
      end loop;
    end loop;

    if score > best_score then
      best_score := score;
      best_key := a.key;
    end if;
  end loop;

  return best_key;
end;
$$;

-- ===============================================================
-- 6) RPC: save quiz → facets → archetype → persona summary
-- ===============================================================
create or replace function public.save_traits_and_match(p_raw jsonb)
returns table(archetype text, summary jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  flag_enabled boolean;
  f jsonb;
  a text;
  s jsonb;
begin
  if u is null then
    raise exception 'unauthorized';
  end if;

  select enabled into flag_enabled
  from public.feature_flags
  where key = 'bond_genesis';

  if flag_enabled is not true then
    raise exception 'disabled';
  end if;

  f := public.compute_facets(p_raw);
  a := public.choose_archetype(f);
  s := public.persona_summary(f, a);

  insert into public.player_traits (user_id, raw, facets, archetype, updated_at)
  values (u, p_raw, f, a, now())
  on conflict (user_id) do update
    set raw = excluded.raw,
        facets = excluded.facets,
        archetype = excluded.archetype,
        updated_at = now();

  insert into public.persona_profiles (user_id, summary, updated_at)
  values (u, s, now())
  on conflict (user_id) do update
    set summary = excluded.summary,
        updated_at = now();

  return query select a, s;
end;
$$;

grant execute on function public.save_traits_and_match(jsonb) to authenticated;

-- ===============================================================
-- 7) RPC: spawn companion from archetype
-- ===============================================================
create or replace function public.match_companion()
returns table(companion_id uuid, archetype text)
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  flag_enabled boolean;
  a text;
  seed text;
  color text;
  c uuid;
  has_companion boolean;
begin
  if u is null then
    raise exception 'unauthorized';
  end if;

  select enabled into flag_enabled
  from public.feature_flags
  where key = 'bond_genesis';

  if flag_enabled is not true then
    raise exception 'disabled';
  end if;

  select exists(select 1 from public.companions where owner_id = u) into has_companion;
  if has_companion then
    raise exception 'already_has_companion';
  end if;

  select archetype into a
  from public.player_traits
  where user_id = u;

  if a is null then
    raise exception 'no_archetype';
  end if;

  select seed, color
    into seed, color
  from public.companion_archetypes
  where key = a;

  if not found then
    raise exception 'archetype_missing';
  end if;

  insert into public.companions (owner_id, name, species, rarity, level, xp, affection, trust, energy, mood, avatar_url)
  values (u, initcap(a), 'looma', 'common', 1, 0, 20, 15, 100, 'neutral', null)
  returning id into c;

  insert into public.events (user_id, kind, meta)
  values (u, 'companion_spawn', jsonb_build_object('archetype', a, 'color', color, 'seed', seed));

  return query select c, a;
end;
$$;

grant execute on function public.match_companion() to authenticated;
