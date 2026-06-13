drop index if exists public.companion_journal_entries_source_unique_idx;

create unique index companion_journal_entries_source_unique_idx
  on public.companion_journal_entries (owner_id, companion_id, source_type, source_id);
