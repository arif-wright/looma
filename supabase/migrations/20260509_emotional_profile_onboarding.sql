-- Emotional profile onboarding v1
-- Keeps legacy player_traits fields while adding structured emotional profile outputs.

alter table if exists public.player_traits
  add column if not exists emotional_profile jsonb,
  add column if not exists primary_archetype text,
  add column if not exists secondary_archetype text,
  add column if not exists companion_seed text,
  add column if not exists archetype_scores jsonb,
  add column if not exists onboarding_quiz_version text;

update public.player_traits
   set primary_archetype = case
         when primary_archetype is not null then primary_archetype
         when archetype in ('harmonizer', 'lumina', 'mirae', 'muse', 'looma') then 'muse'
         when archetype in ('sentinel', 'tova', 'guardian') then 'guardian'
         when archetype in ('aurex', 'vexel', 'spark') then 'spark'
         when archetype in ('kynth', 'elar', 'root') then 'root'
         when archetype in ('nira', 'echo') then 'echo'
         else archetype
       end,
       companion_seed = case
         when companion_seed is not null then companion_seed
         when archetype in ('harmonizer', 'lumina', 'mirae', 'muse', 'looma') then 'mirae'
         when archetype in ('sentinel', 'tova', 'guardian') then 'tova'
         when archetype in ('aurex', 'vexel', 'spark') then 'aurex'
         when archetype in ('kynth', 'elar', 'root') then 'kynth'
         when archetype in ('nira', 'echo') then 'nira'
         else null
       end,
       onboarding_quiz_version = coalesce(onboarding_quiz_version, 'legacy')
 where primary_archetype is null
    or companion_seed is null
    or onboarding_quiz_version is null;
