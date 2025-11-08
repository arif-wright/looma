<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
  import ProfileStats from '$lib/components/profile/ProfileStats.svelte';
  import ProfileAbout from '$lib/components/profile/ProfileAbout.svelte';
  import FeaturedCompanionCard from '$lib/components/profile/FeaturedCompanionCard.svelte';
  import ProfileHighlights from '$lib/components/profile/ProfileHighlights.svelte';
  import ProfileFeed from '$lib/components/profile/ProfileFeed.svelte';
  import ProfileComposer from '$lib/components/profile/ProfileComposer.svelte';
  import CompanionPickerModal from '$lib/components/profile/CompanionPickerModal.svelte';
  import EditProfileModal from '$lib/components/profile/EditProfileModal.svelte';
  import type { PageData } from './$types';
  import type { PostRow } from '$lib/social/types';
  import { currentProfile } from '$lib/stores/profile';

  export let data: PageData;

  let profile = { ...data.profile };
  const stats = data.stats;

  let pickerOpen = false;
  let pickerBusy = false;
  let feedRef: InstanceType<typeof ProfileFeed> | null = null;
  let editOpen = false;
  const appUrl = import.meta.env.PUBLIC_APP_URL || '';
  const legacyShareMatch = data.shareUrl?.match(/^(.*)\/app\/u\/[^/]+$/);
  const legacyShareBase = legacyShareMatch ? legacyShareMatch[1] : data.shareUrl ?? '';

  $: shareUrl = (() => {
    const identifier = profile.handle || data.user?.id;
    if (!identifier) return '';
    if (appUrl) return `${appUrl}/u/${identifier}`;
    if (legacyShareBase) return `${legacyShareBase}/app/u/${identifier}`;
    return '';
  })();

  const handleEdit = () => {
    if (!data.isOwner) return;
    editOpen = true;
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

  function onProfileUpdated(event: CustomEvent<Record<string, any>>) {
    const patch = event.detail ?? {};
    if (!Object.keys(patch).length) return;
    profile = { ...profile, ...patch };
    data.profile = { ...data.profile, ...patch };
    currentProfile.update((p) => (p ? { ...p, ...patch } : p));
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
      showJoined={true}
      shareUrl={shareUrl}
      shareTitle={`Check out @${profile.handle} on Looma`}
      on:edit={handleEdit}
      on:avatarChange={(event) => (profile = { ...profile, avatar_url: event.detail.url })}
      on:bannerChange={(event) => (profile = { ...profile, banner_url: event.detail.url })}
    />

    {#if data.isOwner}
      <EditProfileModal bind:open={editOpen} {profile} on:profileUpdated={onProfileUpdated} onClose={() => (editOpen = false)} />
    {/if}

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
      showLevel={true}
      showShards={true}
    />

    <ProfileAbout bio={profile.bio} links={profile.links} pronouns={profile.pronouns} location={profile.location} />

    <ProfileHighlights
      pinnedPost={data.pinnedPost}
      companion={data.featuredCompanion ? { name: data.featuredCompanion.name, mood: data.featuredCompanion.mood } : null}
      profileHandle={profile.handle}
    />

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

</style>
