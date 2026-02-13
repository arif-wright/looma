create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  kind text not null,
  url text not null,
  storage_path text,
  mime_type text,
  width int,
  height int,
  bytes int,
  alt_text text,
  created_at timestamptz not null default now(),
  constraint message_attachments_kind_check check (kind in ('image', 'gif', 'file', 'link'))
);

create index if not exists message_attachments_message_idx
  on public.message_attachments(message_id);

alter table if exists public.messages
  add column if not exists has_attachments boolean not null default false,
  add column if not exists preview_kind text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_preview_kind_check'
  ) then
    alter table public.messages
      add constraint messages_preview_kind_check
      check (preview_kind is null or preview_kind in ('image', 'gif', 'text'));
  end if;
end;
$$;

alter table if exists public.messages
  drop constraint if exists messages_body_check;

alter table if exists public.messages
  add constraint messages_body_check
  check (char_length(trim(body)) > 0 or has_attachments = true);

alter table public.message_attachments enable row level security;

drop policy if exists message_attachments_member_select on public.message_attachments;
create policy message_attachments_member_select
  on public.message_attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id
      where m.id = message_attachments.message_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists message_attachments_sender_insert on public.message_attachments;
create policy message_attachments_sender_insert
  on public.message_attachments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.messages m
      where m.id = message_attachments.message_id
        and m.sender_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select
  'messenger_uploads',
  'messenger_uploads',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
where not exists (
  select 1 from storage.buckets where id = 'messenger_uploads'
);
