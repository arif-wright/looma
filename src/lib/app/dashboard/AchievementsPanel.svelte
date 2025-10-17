<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import PanelFrame from '$lib/app/components/PanelFrame.svelte';
  import StatBadge from '$lib/app/components/StatBadge.svelte';

  type Earned = {
    earned_at: string;
    achievement: { title: string; tier: string } | null;
  };

  let loading = true;
  let error: string | null = null;
  let earned: Earned[] = [];
  let lockedCount = 0;
  let channel: any;

  async function loadData() {
    loading = true;
    error = null;
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
        error: uerr
      } = await supabase.auth.getUser();
      if (uerr) throw uerr;
      if (!user) throw new Error('No session');

      // total achievements (head count)
      const { count: total, error: tErr } = await supabase
        .from('achievements')
        .select('id', { count: 'exact', head: true });
      if (tErr) throw tErr;

      // earned list (join via foreign key)
      const { data, error: eErr } = await supabase
        .from('user_achievements')
        .select('earned_at, achievement:achievement_id ( title, tier )')
        .eq('user_id', user.id)
        .order('earned_at', { ascending: false })
        .limit(10);

      if (eErr) throw eErr;
      earned = (data as Earned[]) ?? [];
      lockedCount = Math.max(0, (total ?? 0) - earned.length);

      // realtime: new achievements
      channel?.unsubscribe?.();
      channel = supabase
        .channel('achievements-rt')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'user_achievements', filter: `user_id=eq.${user.id}` },
          async () => {
            await loadData();
          }
        )
        .subscribe();
    } catch (e: any) {
      console.error(e);
      error = e?.message ?? 'Failed to load achievements';
    } finally {
      loading = false;
    }
  }

  onMount(loadData);
  onDestroy(() => {
    try {
      channel?.unsubscribe?.();
    } catch {}
  });
</script>

<PanelFrame title="Achievements" loading={loading}>
  {#if error}
    <div class="text-sm text-red-400 flex items-center gap-2">
      <span>{error}</span>
      <button class="underline" on:click={loadData}>Retry</button>
    </div>
  {:else}
    <div class="flex items-center justify-between mb-3">
      <div class="text-sm opacity-80">Recent unlocks</div>
      <StatBadge label="Locked" value={lockedCount} />
    </div>

    {#if earned.length === 0}
      <div class="opacity-70">No achievements yet.</div>
    {:else}
      <ul class="space-y-2" aria-live="polite">
        {#each earned as e}
          <li class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm font-medium truncate">{e.achievement?.title ?? 'Achievement'}</div>
              <div class="text-xs opacity-75 truncate">{e.achievement?.tier ?? ''}</div>
            </div>
            <div class="text-xs opacity-60">{new Date(e.earned_at).toLocaleDateString()}</div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  <svelte:fragment slot="skeleton">
    <div class="animate-pulse space-y-2">
      <div class="h-8 rounded-xl bg-white/5"></div>
      <div class="h-8 rounded-xl bg-white/5"></div>
      <div class="h-8 rounded-xl bg-white/5"></div>
    </div>
  </svelte:fragment>
</PanelFrame>
