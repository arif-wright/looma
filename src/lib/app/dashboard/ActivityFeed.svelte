<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import PanelFrame from '$lib/app/components/PanelFrame.svelte';

  type Row = { id: string; type: string; message: string; created_at: string };

  let loading = true;
  let error: string | null = null;
  let items: Row[] = [];
  let page = 0;
  const PAGE_SIZE = 10;
  let endReached = false;
  let userId: string | null = null;
  let channel: any;

  async function fetchPage(reset = false) {
    const supabase = supabaseBrowser();
    if (!userId) {
      const {
        data: { user },
        error: uerr
      } = await supabase.auth.getUser();
      if (uerr) throw uerr;
      if (!user) throw new Error('No session');
      userId = user.id;
    }
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error: err } = await supabase
      .from('events')
      .select('id, type, message, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (err) throw err;

    if (reset) items = (data as Row[]) ?? [];
    else items = [...items, ...((data as Row[]) ?? [])];

    if (!data || data.length < PAGE_SIZE) endReached = true;

    if (!channel) {
      channel = supabase
        .channel('events-rt')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'events', filter: `user_id=eq.${userId}` },
          (payload) => {
            const r = payload.new as Row;
            items = [r, ...items];
          }
        )
        .subscribe();
    }
  }

  async function loadInitial() {
    loading = true;
    error = null;
    items = [];
    page = 0;
    endReached = false;
    try {
      await fetchPage(true);
    } catch (e: any) {
      console.error(e);
      error = e?.message ?? 'Failed to load feed';
    }
    loading = false;
  }

  async function loadMore() {
    if (endReached) return;
    page += 1;
    try {
      await fetchPage();
    } catch (e: any) {
      console.error(e);
      error = e?.message ?? 'Failed to load feed';
    }
  }

  onMount(loadInitial);
  onDestroy(() => {
    try {
      channel?.unsubscribe?.();
    } catch {}
  });
</script>

<PanelFrame title="Activity" loading={loading}>
  {#if error}
    <div class="text-sm text-red-400 flex items-center gap-2">
      <span>{error}</span>
      <button class="underline" on:click={loadInitial}>Retry</button>
    </div>
  {:else if items.length === 0}
    <div class="opacity-70">No recent activity.</div>
  {:else}
    <ul class="space-y-3" aria-live="polite">
      {#each items as ev}
        <li class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="text-sm font-medium truncate">{ev.message}</div>
            <div class="text-xs opacity-75">{ev.type}</div>
          </div>
          <div class="text-xs opacity-60">{new Date(ev.created_at).toLocaleString()}</div>
        </li>
      {/each}
    </ul>
    {#if !endReached}
      <div class="mt-3 flex justify-center">
        <button class="text-sm underline" on:click={loadMore}>Load more</button>
      </div>
    {/if}
  {/if}

  <svelte:fragment slot="skeleton">
    <div class="animate-pulse space-y-3">
      <div class="h-8 w-full rounded-xl bg-white/5"></div>
      <div class="h-8 w-full rounded-xl bg-white/5"></div>
      <div class="h-8 w-full rounded-xl bg-white/5"></div>
    </div>
  </svelte:fragment>
</PanelFrame>
