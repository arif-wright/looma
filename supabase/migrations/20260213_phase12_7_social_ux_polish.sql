create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji),
  constraint message_reactions_emoji_check check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🔥'))
);

create index if not exists message_reactions_message_idx
  on public.message_reactions(message_id);

alter table public.message_reactions enable row level security;

drop policy if exists message_reactions_member_select on public.message_reactions;
create policy message_reactions_member_select
  on public.message_reactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id
      where m.id = message_reactions.message_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists message_reactions_member_insert on public.message_reactions;
create policy message_reactions_member_insert
  on public.message_reactions
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id
      where m.id = message_reactions.message_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists message_reactions_member_delete on public.message_reactions;
create policy message_reactions_member_delete
  on public.message_reactions
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id
      where m.id = message_reactions.message_id
        and cm.user_id = auth.uid()
    )
  );

alter table if exists public.message_reactions replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'message_reactions'
    ) then
      execute 'alter publication supabase_realtime add table public.message_reactions';
    end if;
  else
    create publication supabase_realtime for table public.message_reactions;
  end if;
end;
$$;
