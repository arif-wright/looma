<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
  import ProfileSidebar from '$lib/components/profile/ProfileSidebar.svelte';
  import ProfileAbout from '$lib/components/profile/ProfileAbout.svelte';
  import ProfileHighlights from '$lib/components/profile/ProfileHighlights.svelte';
  import ProfileFeed from '$lib/components/profile/ProfileFeed.svelte';
  import SmartComposer from '$lib/components/profile/SmartComposer.svelte';
  import CompanionPickerModal from '$lib/components/profile/CompanionPickerModal.svelte';
  import EditProfileModal from '$lib/components/profile/EditProfileModal.svelte';
  import type { PageData } from './$types';
  import type { PostRow } from '$lib/social/types';
  import { currentProfile } from '$lib/stores/profile';

  export let data: PageData;

  type LooseRecord = Record<string, any>;

  let profile: LooseRecord = { ...data.profile };
  const stats = data.stats;

  let pickerOpen = false;
  let pickerBusy = false;
  let feedRef: InstanceType<typeof ProfileFeed> | null = null;
  let editOpen = false;
  const appUrl = import.meta.env.PUBLIC_APP_URL || '';
  const legacyShareMatch = data.shareUrl?.match(/^(.*)\/app\/u\/[^/]+$/);
  const legacyShareBase = legacyShareMatch ? legacyShareMatch[1] : data.shareUrl ?? '';

  $: sidebarAchievements = (profile?.achievements as LooseRecord[]) ?? [];

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
  <ProfileHeader
    profile={profile}
    coverUrl={profile.banner_url}
    avatarUrl={profile.avatar_url}
    canEdit={data.isOwner}
    canShare={!!shareUrl}
    shareUrl={shareUrl}
    on:edit={handleEdit}
  />

  <main class="profile-grid mt-6">
    <div class="profile-cols">
      <ProfileSidebar
        profile={profile}
        stats={stats}
        shards={data.walletShards ?? null}
        featuredCompanion={data.featuredCompanion}
        achievements={sidebarAchievements}
        isOwner={data.isOwner}
        on:chooseCompanion={handleSwap}
      />

      <div class="space-y-4">
        <SmartComposer avatarUrl={profile.avatar_url} on:posted={handleComposerPosted} />

        {#if data.pinnedPost}
          <section class="panel" aria-labelledby="pinned-heading">
            <div class="flex items-center justify-between">
              <h3 id="pinned-heading" class="panel-title m-0">Pinned</h3>
              <span class="text-[10px] uppercase tracking-wide text-white/40">Profile</span>
            </div>
            <p class="mt-2 text-white/80 leading-relaxed">{data.pinnedPost?.body}</p>
          </section>
        {/if}

        <section class="panel" id="overview">
          <ProfileAbout bio={profile.bio} links={profile.links} pronouns={profile.pronouns} location={profile.location} />
        </section>

        <section class="panel" id="companions">
          <ProfileHighlights
            pinnedPost={data.pinnedPost}
            companion={data.featuredCompanion ? { name: data.featuredCompanion.name, mood: data.featuredCompanion.mood } : null}
            profileHandle={profile.handle}
          />
        </section>

        <section id="activity" class="space-y-4">
          <ProfileFeed
            bind:this={feedRef}
            authorIdentifier={profile.handle || profile.id}
            initialItems={data.posts ?? []}
            initialCursor={data.nextCursor}
          />
        </section>
      </div>
    </div>
  </main>

  {#if data.isOwner}
    <EditProfileModal bind:open={editOpen} {profile} on:profileUpdated={onProfileUpdated} onClose={() => (editOpen = false)} />
  {/if}
</div>

<CompanionPickerModal
  open={pickerOpen}
  companions={data.companionOptions ?? []}
  busy={pickerBusy}
  on:close={handlePickerClose}
  on:select={handlePickerSelect}
/>
