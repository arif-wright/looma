<script lang="ts">
  export let items: Array<{
    requester_id: string;
    display_name?: string | null;
    handle?: string | null;
    avatar_url?: string | null;
  }> = [];

  async function approve(id: string) {
    if (!id) return;
    const res = await fetch('/api/privacy/follow-approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterId: id })
    });
    if (res.ok) {
      items = items.filter((entry) => entry.requester_id !== id);
    }
  }

  async function deny(id: string) {
    if (!id) return;
    const res = await fetch('/api/privacy/follow-deny', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterId: id })
    });
    if (res.ok) {
      items = items.filter((entry) => entry.requester_id !== id);
    }
  }
</script>

<section class="panel">
  <h3 class="panel-title">Follow Requests</h3>
  {#if items.length}
    <ul class="mt-3 space-y-2">
      {#each items as it (it.requester_id)}
        <li class="flex items-center gap-3">
          <img
            src={it.avatar_url ?? '/avatar-fallback.png'}
            alt=""
            class="h-8 w-8 rounded-full object-cover ring-1 ring-white/10"
            loading="lazy"
          />
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium truncate">{it.display_name ?? 'Explorer'}</div>
            <div class="text-xs text-white/60 truncate">@{it.handle ?? 'player'}</div>
          </div>
          <div class="flex gap-2">
            <button class="px-3 py-1 rounded-full bg-white/10 hover:bg-white/15 ring-1 ring-white/15 text-sm" type="button" on:click={() => approve(it.requester_id)}>
              Approve
            </button>
            <button class="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-sm" type="button" on:click={() => deny(it.requester_id)}>
              Deny
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="text-sm text-white/60">No pending requests.</p>
  {/if}
</section>
