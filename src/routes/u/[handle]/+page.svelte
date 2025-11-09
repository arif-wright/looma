<script lang="ts">
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
  import ProfileSidebar from '$lib/components/profile/ProfileSidebar.svelte';
  import ProfileAbout from '$lib/components/profile/ProfileAbout.svelte';
  import ProfileHighlights from '$lib/components/profile/ProfileHighlights.svelte';
  import ProfileFeed from '$lib/components/profile/ProfileFeed.svelte';
  import PeopleToFollow from '$lib/components/social/PeopleToFollow.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  const profile = data.profile;
  const stats = data.stats;
  const shareUrl = data.shareUrl ?? '';
  const ogImageUrl = data.ogImageUrl ?? `${shareUrl ? new URL('/api/og/profile?handle=' + profile.handle, shareUrl).toString() : ''}`;
  const metaTitle = `${profile.display_name ?? profile.handle} (@${profile.handle}) • Looma`;
  const metaDescription = data.metaDescription ?? profile.bio?.slice(0, 160) ?? 'View this explorer on Looma';
</script>

<svelte:head>
  <title>{metaTitle}</title>
  <meta name="description" content={metaDescription} />
  <meta property="og:title" content={metaTitle} />
  <meta property="og:description" content={metaDescription} />
  {#if shareUrl}
    <meta property="og:url" content={shareUrl} />
    <link rel="canonical" href={shareUrl} />
  {/if}
  {#if ogImageUrl}
    <meta property="og:image" content={ogImageUrl} />
    <meta name="twitter:image" content={ogImageUrl} />
  {/if}
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<BackgroundStack class="profile-bg" />

<div class="relative z-10 min-h-screen safe-bottom pb-safe md:pb-8">
  <ProfileHeader
    profile={profile}
    coverUrl={profile.banner_url}
    avatarUrl={profile.avatar_url}
    canEdit={false}
    canShare={!!shareUrl}
    shareUrl={shareUrl}
    isOwnProfile={data.isOwner}
    isFollowing={data.isFollowing ?? false}
    followCounts={data.followCounts ?? { followers: 0, following: 0 }}
    viewerCanFollow={Boolean(data.viewerId)}
  />

  <main class="profile-grid mt-6">
    <div class="profile-cols">
      <div class="flex flex-col gap-4">
        <ProfileSidebar
          profile={profile}
          stats={stats}
          shards={null}
          featuredCompanion={data.featuredCompanion}
          achievements={profile.achievements ?? []}
          isOwner={false}
          hideCompanionActions={true}
          hidePrivate={true}
        />
        <PeopleToFollow title="People you may know" />
      </div>

      <div class="space-y-4">
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
