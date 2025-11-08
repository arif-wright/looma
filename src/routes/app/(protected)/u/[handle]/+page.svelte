<script lang="ts">
import { goto } from '$app/navigation';
import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
import ProfileSidebar from '$lib/components/profile/ProfileSidebar.svelte';
import ProfileAbout from '$lib/components/profile/ProfileAbout.svelte';
import ProfileHighlights from '$lib/components/profile/ProfileHighlights.svelte';
import ProfileFeed from '$lib/components/profile/ProfileFeed.svelte';
import SmartComposer from '$lib/components/profile/SmartComposer.svelte';
import type { PageData } from './$types';
import type { PostRow } from '$lib/social/types';

  export let data: PageData;

  const profile = data.profile;
  const stats = {
    level: profile.level ?? null,
    xp: profile.xp ?? null,
    xp_next: profile.xp_next ?? null
  };

  let feedRef: InstanceType<typeof ProfileFeed> | null = null;

  const handleEdit = () => {
    if (!data.isOwner) return;
    void goto('/app/profile/edit');
  };

  async function handleShare() {
    if (!data.shareUrl) return;
    try {
      if (typeof navigator !== 'undefined') {
        if (navigator.share) {
          await navigator.share({ title: `${profile.display_name ?? profile.handle} on Looma`, url: data.shareUrl });
          return;
        }
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(data.shareUrl);
          window?.alert?.('Profile link copied');
          return;
        }
      }
      window?.prompt?.('Copy this profile link:', data.shareUrl);
    } catch (err) {
      console.error('share failed', err);
    }
  }

  function onChooseCompanion() {
    // public view - no action
  }

  const handleComposerPosted = (event: CustomEvent<PostRow>) => {
    feedRef?.prepend(event.detail);
  };
</script>

<svelte:head>
  <title>{data.meta.title}</title>
  <meta property="og:title" content={data.meta.title} />
  <meta property="og:description" content={data.meta.description} />
  <meta property="og:url" content={data.meta.url} />
  <meta property="og:type" content="profile" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={data.meta.title} />
  <meta name="twitter:description" content={data.meta.description} />
  {#if data.meta.image}
    <meta property="og:image" content={data.meta.image} />
    <meta name="twitter:image" content={data.meta.image} />
  {/if}
</svelte:head>

<BackgroundStack class="profile-bg" />

<div class="relative z-10 min-h-screen safe-bottom pb-safe md:pb-8">
  <ProfileHeader
    profile={profile}
    coverUrl={profile.banner_url}
    avatarUrl={profile.avatar_url}
    canEdit={data.isOwner}
    canShare={!!data.shareUrl}
    on:edit={handleEdit}
    on:share={handleShare}
  />

  <main class="profile-grid mt-6">
    <div class="profile-cols">
      <ProfileSidebar
        profile={profile}
        stats={stats}
        shards={profile.shards ?? null}
        featuredCompanion={data.featuredCompanion}
        achievements={profile.achievements ?? []}
        isOwner={data.isOwner}
        on:chooseCompanion={onChooseCompanion}
      />

      <div class="space-y-4">
        {#if data.isOwner}
          <SmartComposer avatarUrl={profile.avatar_url} on:posted={handleComposerPosted} />
          <section class="panel">
            <div class="text-sm text-white/70">You’re viewing your public profile.</div>
          </section>
        {/if}

        {#if data.pinnedPost}
          <section class="panel">
            <div class="flex items-center justify-between">
              <h3 class="panel-title m-0">Pinned</h3>
              <span class="text-[10px] uppercase tracking-wide text-white/40">Public</span>
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
            emptyMessage="No public posts yet."
          />
        </section>
      </div>
    </div>
  </main>
</div>
