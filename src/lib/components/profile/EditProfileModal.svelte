<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import EditProfileDetails from '$lib/components/profile/EditProfileDetails.svelte';
  import { normalizeHandle, validateHandle } from '$lib/utils/handle';
  import { currentProfile } from '$lib/stores/profile';

  export let open = false;
  export let onClose: () => void = () => {};
  export let profile: Record<string, any> | null = null;

  const dispatch = createEventDispatcher<{ profileUpdated: Record<string, any> }>();

  let handle = profile?.handle ?? '';
  let checking = false;
  let available: boolean | null = null;
  let msg = '';
  let dirty = false;
  let handleTimer: ReturnType<typeof setTimeout> | null = null;
  let handleSaving = false;
  let accountPrivate = false;
  let showLevel = true;
  let showShards = true;
  let showLocation = true;
  let showAchievements = true;
  let showFeed = true;
  let showJoined = true;
  let resetPending = false;
  let resetMessage = '';

  $: if (profile && !dirty) {
    handle = profile.handle ?? '';
  }

  $: if (profile) {
    accountPrivate = Boolean(profile.account_private ?? false);
    showLevel = profile.show_level ?? true;
    showShards = profile.show_shards ?? true;
    showLocation = profile.show_location ?? true;
    showAchievements = profile.show_achievements ?? true;
    showFeed = profile.show_feed ?? true;
    showJoined = profile.show_joined ?? true;
  }

  onDestroy(() => {
    if (handleTimer) clearTimeout(handleTimer);
  });

  $: {
    if (handleTimer) clearTimeout(handleTimer);
    if (!dirty || !handle || typeof window === 'undefined') {
      if (!dirty) {
        msg = '';
        available = null;
      }
    } else {
      handleTimer = window.setTimeout(async () => {
        checking = true;
        try {
          const normalized = normalizeHandle(handle);
          const res = await fetch(`/api/profile/handle/availability?q=${encodeURIComponent(normalized)}`);
          if (!res.ok) {
            available = null;
            msg = 'Unable to check';
            return;
          }
          const payload = await res.json();
          available = !!payload?.available;
          msg = available ? 'Available' : 'Not available';
        } catch (err) {
          console.error('handle check failed', err);
          available = null;
          msg = 'Unable to check';
        } finally {
          checking = false;
        }
      }, 350);
    }
  }

  function closeModal() {
    open = false;
    onClose?.();
  }

  function handleInput(value: string) {
    handle = value;
    dirty = handle !== (profile?.handle ?? '');
    available = null;
    msg = '';
  }

  function resetHandle() {
    handle = profile?.handle ?? '';
    dirty = false;
    msg = '';
    available = null;
  }

  async function saveHandle() {
    const validation = validateHandle(handle);
    if (!validation.ok || !validation.handle) {
      msg = validation.reason ?? 'Invalid handle';
      available = false;
      return;
    }
    handleSaving = true;
    try {
      const res = await fetch('/app/profile/handle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: validation.handle })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) {
        msg = payload?.reason ?? 'Could not update';
        available = false;
      } else {
        dirty = false;
        available = true;
        msg = 'Saved';
        handle = payload.handle;
        const patch = { handle: payload.handle };
        currentProfile.update((p) => (p ? { ...p, ...patch } : p));
        dispatch('profileUpdated', patch);
      }
    } catch (err) {
      console.error('handle update failed', err);
      msg = 'Error updating handle';
      available = false;
    } finally {
      handleSaving = false;
    }
  }

  function handleDetailsUpdated(event: CustomEvent<Record<string, any>>) {
    currentProfile.update((p) => (p ? { ...p, ...event.detail } : p));
    dispatch('profileUpdated', event.detail);
  }

  async function resetPersona() {
    if (resetPending) return;
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm('Reset personalization? Your companion stays, but traits will be cleared.');
    if (!confirmed) return;
    resetPending = true;
    resetMessage = '';
    try {
      const res = await fetch('/api/persona/reset', { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error ?? 'Unable to reset personalization');
      }
      resetMessage = 'Personalization reset. Retake the quiz whenever you are ready.';
      if (typeof window !== 'undefined') {
        window.localStorage?.removeItem('looma_bond_answers_v2');
      }
    } catch (err) {
      resetMessage =
        err instanceof Error ? err.message : 'Unable to reset personalization at this time.';
    } finally {
      resetPending = false;
    }
  }
</script>

<Modal {open} title="Edit profile" onClose={closeModal}>
  <div class="edit-profile-modal space-y-6">
    <section class="panel-glass p-4 rounded-2xl space-y-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <label class="text-[0.7rem] tracking-[0.2em] uppercase" for="handle-input">Handle</label>
        <span class="text-xs text-white/70 min-h-[1rem]">
          {#if checking}
            Checking…
          {:else if dirty}
            {msg || ' '}
          {:else}
            &nbsp;
          {/if}
        </span>
      </div>
      <input
        id="handle-input"
        class="input input-md w-full"
        bind:value={handle}
        maxlength="32"
        placeholder="your-handle"
        on:input={(event) => handleInput((event.target as HTMLInputElement).value)}
      />
      <div class="flex flex-wrap items-center gap-2">
        <button
          class="btn btn-sm"
          type="button"
          on:click={saveHandle}
          disabled={!dirty || checking || available === false || handleSaving}
        >
          {handleSaving ? 'Saving…' : 'Save handle'}
        </button>
        <button class="btn btn-ghost btn-sm" type="button" on:click={resetHandle} disabled={!dirty}>
          Reset
        </button>
        {#if available !== null}
          <span class:status-available={available} class:status-unavailable={!available} class="text-sm">
            {available ? 'Available' : 'Not available'}
          </span>
        {/if}
      </div>
    </section>

    <EditProfileDetails
      {profile}
      account_private={accountPrivate}
      show_level={showLevel}
      show_shards={showShards}
      show_joined={showJoined}
      show_location={showLocation}
      show_achievements={showAchievements}
      show_feed={showFeed}
      on:updated={handleDetailsUpdated}
    />

    {#if profile}
      <section class="panel mt-6">
        <h3 class="panel-title">Privacy</h3>

        <label class="flex items-center justify-between py-2">
          <span>Account is private</span>
          <input type="checkbox" bind:checked={accountPrivate} />
        </label>

        <div class="mt-3 grid sm:grid-cols-2 gap-2">
          <label class="flex items-center justify-between py-2"
            ><span>Show level</span><input type="checkbox" bind:checked={showLevel} /></label
          >
          <label class="flex items-center justify-between py-2"
            ><span>Show shards</span><input type="checkbox" bind:checked={showShards} /></label
          >
          <label class="flex items-center justify-between py-2"
            ><span>Show location</span><input type="checkbox" bind:checked={showLocation} /></label
          >
          <label class="flex items-center justify-between py-2"
            ><span>Show achievements</span
            ><input type="checkbox" bind:checked={showAchievements} /></label
          >
          <label class="flex items-center justify-between py-2"
            ><span>Show feed</span><input type="checkbox" bind:checked={showFeed} /></label
          >
          <label class="flex items-center justify-between py-2"
            ><span>Show join date</span><input type="checkbox" bind:checked={showJoined} /></label
          >
        </div>

        <p class="text-xs text-white/60 mt-2">
          When your account is private, only approved followers can see items you hide here.
        </p>
      </section>

      <section class="panel mt-4 space-y-2">
        <div class="flex items-center justify-between gap-4">
          <h3 class="panel-title m-0">Persona</h3>
          <a
            class="btn-ghost text-xs"
            href="/app/onboarding/companion"
          >
            Retake personality quiz
          </a>
        </div>
        <p class="text-xs text-white/60">
          Refresh your archetype anytime. We only store a summarized profile for personalization—no raw answers are shared with AI.
        </p>
      </section>

      <section class="panel mt-4 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="panel-title m-0">Persona</h3>
            <p class="text-xs text-white/60">
              Retake or reset your personalization safely.
            </p>
          </div>
          <a class="btn-ghost text-xs" href="/app/onboarding/companion?retake=1">
            Retake quiz
          </a>
        </div>
        <button class="btn btn-sm" type="button" on:click={resetPersona} disabled={resetPending}>
          {resetPending ? 'Resetting…' : 'Reset personalization'}
        </button>
        {#if resetMessage}
          <p class="text-xs text-white/70">{resetMessage}</p>
        {/if}
      </section>
    {/if}
  </div>
</Modal>

<style>
  .edit-profile-modal :global(.btn-ghost) {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .status-available {
    color: #5ef2ff;
  }

  .status-unavailable {
    color: #ff4fd8;
  }
</style>
