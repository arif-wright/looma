<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
  import ProfileStats from '$lib/components/profile/ProfileStats.svelte';
  import ProfileAbout from '$lib/components/profile/ProfileAbout.svelte';
  import FeaturedCompanionCard from '$lib/components/profile/FeaturedCompanionCard.svelte';
  import ProfileHighlights from '$lib/components/profile/ProfileHighlights.svelte';
  import ProfileFeed from '$lib/components/profile/ProfileFeed.svelte';
  import ProfileComposer from '$lib/components/profile/ProfileComposer.svelte';
  import CompanionPickerModal from '$lib/components/profile/CompanionPickerModal.svelte';
  import type { PageData } from './$types';
  import type { PostRow } from '$lib/social/types';
  import { validateHandle, normalizeHandle } from '$lib/utils/handle';
  import { currentProfile } from '$lib/stores/profile';

  export let data: PageData;

  let profile = { ...data.profile };
  const stats = data.stats;

  let pickerOpen = false;
  let pickerBusy = false;
  let feedRef: InstanceType<typeof ProfileFeed> | null = null;
  let handleInput = profile.handle ?? '';
  let handleStatus: 'idle' | 'checking' | 'available' | 'unavailable' = 'idle';
  let handleMessage = '';
  let handleDebounce: ReturnType<typeof setTimeout> | null = null;
  let handleSaving = false;

  const handleEdit = () => {
    void goto('/app/profile/edit');
  };

  const handleSwap = () => {
    pickerOpen = true;
  };

  const handleComposerPosted = (event: CustomEvent<PostRow>) => {
    feedRef?.prepend(event.detail);
  };

  const handlePickerClose = () => {
    if (pickerBusy) return;
    pickerOpen = false;
  };

  const handlePickerSelect = async (event: CustomEvent<{ id: string }>) => {
    const id = event.detail?.id;
    if (!id) return;
    pickerBusy = true;
    try {
      const res = await fetch('/app/profile/featured-companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionId: id })
      });
      if (!res.ok) {
        console.error('failed to update featured companion', await res.text());
      } else {
        await invalidateAll();
      }
    } catch (err) {
      console.error('picker error', err);
    } finally {
      pickerBusy = false;
      pickerOpen = false;
    }
  };

  const clearHandleDebounce = () => {
    if (handleDebounce) {
      clearTimeout(handleDebounce);
      handleDebounce = null;
    }
  };

  onDestroy(clearHandleDebounce);

  async function checkHandleAvailability(value: string) {
    const normalized = normalizeHandle(value);
    if (!normalized || normalized.length < 3) {
      handleStatus = 'unavailable';
      handleMessage = 'At least 3 characters';
      return;
    }
    try {
      const res = await fetch(`/api/profile/handle/availability?q=${encodeURIComponent(normalized)}`);
      if (!res.ok) {
        handleStatus = 'unavailable';
        handleMessage = 'Unable to check';
        return;
      }
      const payload = await res.json();
      handleStatus = payload.available ? 'available' : 'unavailable';
      handleMessage = payload.available ? 'Available' : 'Not available';
    } catch {
      handleStatus = 'unavailable';
      handleMessage = 'Unable to check';
    }
  }

  $: {
    clearHandleDebounce();
    if (!data.isOwner) {
      handleStatus = 'idle';
      handleMessage = '';
    } else if (handleInput === profile.handle) {
      handleStatus = 'idle';
      handleMessage = '';
    } else {
      const normalized = normalizeHandle(handleInput);
      if (!normalized || normalized.length < 3) {
        handleStatus = 'unavailable';
        handleMessage = 'At least 3 characters';
      } else {
        handleStatus = 'checking';
        handleMessage = 'Checking…';
        handleDebounce = setTimeout(() => checkHandleAvailability(handleInput), 400);
      }
    }
  }

  async function saveHandle() {
    const validation = validateHandle(handleInput);
    if (!validation.ok || !validation.handle) {
      handleStatus = 'unavailable';
      handleMessage = validation.reason ?? 'Invalid handle';
      return;
    }
    if (validation.handle === profile.handle) {
      handleStatus = 'idle';
      handleMessage = '';
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
        handleStatus = 'unavailable';
        handleMessage = payload?.reason ?? 'Could not update';
      } else {
        profile = { ...profile, handle: payload.handle };
        handleInput = payload.handle;
        handleStatus = 'idle';
        handleMessage = 'Updated';
        currentProfile.update((p) => (p ? { ...p, handle: payload.handle } : p));
      }
    } catch (err) {
      console.error('handle update failed', err);
      handleStatus = 'unavailable';
      handleMessage = 'Error updating handle';
    } finally {
      handleSaving = false;
    }
  }
</script>

<BackgroundStack class="profile-bg" />

<div class="relative z-10 min-h-screen safe-bottom pb-safe md:pb-8">
  <main class="profile-page">
    <ProfileHeader
      displayName={profile.display_name}
      handle={profile.handle}
      avatarUrl={profile.avatar_url}
      bannerUrl={profile.banner_url}
      joinedAt={profile.joined_at}
      isOwner={data.isOwner}
      isPrivate={profile.is_private}
      level={stats?.level ?? null}
      on:edit={handleEdit}
      on:avatarChange={(event) => (profile = { ...profile, avatar_url: event.detail.url })}
      on:bannerChange={(event) => (profile = { ...profile, banner_url: event.detail.url })}
    />

    <FeaturedCompanionCard
      companion={data.featuredCompanion}
      isOwner={data.isOwner}
      busy={pickerBusy}
      on:swap={handleSwap}
    />

    <ProfileStats
      level={stats?.level ?? null}
      xp={stats?.xp ?? null}
      xpNext={stats?.xp_next ?? null}
      energy={stats?.energy ?? null}
      energyMax={stats?.energy_max ?? null}
      shards={data.walletShards}
    />

    <ProfileAbout bio={profile.bio} links={profile.links} />

    <ProfileHighlights
      pinnedPost={data.pinnedPost}
      companion={data.featuredCompanion ? { name: data.featuredCompanion.name, mood: data.featuredCompanion.mood } : null}
      profileHandle={profile.handle}
    />

    {#if data.isOwner}
      <section class="handle-editor panel-glass">
        <div class="handle-fields">
          <label for="handle-input">Handle</label>
          <input
            id="handle-input"
            class="handle-input"
            maxlength="32"
            bind:value={handleInput}
            placeholder="yourhandle"
          />
        </div>
        <div class="handle-meta">
          <span class={`status ${handleStatus}`}>{handleMessage}</span>
          <button
            type="button"
            class="save-btn"
            on:click={saveHandle}
            disabled={
              handleSaving ||
              handleInput === profile.handle ||
              handleStatus !== 'available'
            }
          >
            {handleSaving ? 'Saving…' : 'Save handle'}
          </button>
        </div>
      </section>
    {/if}

    <ProfileComposer on:posted={handleComposerPosted} />

    <ProfileFeed
      bind:this={feedRef}
      authorIdentifier={profile.handle || profile.id}
      initialItems={data.posts ?? []}
      initialCursor={data.nextCursor}
    />
  </main>
</div>

<CompanionPickerModal
  open={pickerOpen}
  companions={data.companionOptions ?? []}
  busy={pickerBusy}
  on:close={handlePickerClose}
  on:select={handlePickerSelect}
/>

<style>
  .profile-page {
    width: 100%;
    max-width: 960px;
    margin: 0 auto;
    padding: calc(env(safe-area-inset-top, 0px) + 20px) clamp(1rem, 4vw, 2rem) 64px;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  @media (max-width: 720px) {
    .profile-page {
      padding-bottom: 96px;
    }
  }

  .handle-editor {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    padding: 1rem;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(4, 6, 18, 0.65);
  }

  .handle-fields {
    flex: 1;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .handle-fields label {
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
  }

  .handle-input {
    padding: 0.55rem 0.85rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
  }

  .handle-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .status {
    font-size: 0.85rem;
    min-width: 90px;
  }

  .status.available {
    color: #5ef2ff;
  }

  .status.unavailable {
    color: #ff4fd8;
  }

  .status.checking {
    color: rgba(255, 255, 255, 0.7);
  }

  .save-btn {
    padding: 0.45rem 1.4rem;
    border-radius: 999px;
    border: 1px solid rgba(94, 242, 255, 0.4);
    background: linear-gradient(120deg, rgba(94, 242, 255, 0.2), rgba(155, 92, 255, 0.2));
    color: inherit;
    cursor: pointer;
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
