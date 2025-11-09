<script lang="ts">
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
  import ProfileSidebar from '$lib/components/profile/ProfileSidebar.svelte';
  import ProfileAbout from '$lib/components/profile/ProfileAbout.svelte';
  import ProfileHighlights from '$lib/components/profile/ProfileHighlights.svelte';
  import ProfileFeed from '$lib/components/profile/ProfileFeed.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  const profile = data.profile;
  const stats = data.stats;
  const shareUrl = data.shareUrl ?? '';

  async function handleShare() {
    if (!shareUrl) return;
    try {
      if (typeof navigator !== 'undefined') {
        if (navigator.share) {
          await navigator.share({ title: `${profile.display_name ?? profile.handle} on Looma`, url: shareUrl });
          return;
        }
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(shareUrl);
          window?.alert?.('Profile link copied');
          return;
        }
      }
      window?.prompt?.('Copy this profile link:', shareUrl);
    } catch (err) {
      console.error('share failed', err);
    }
  }
</script>

<BackgroundStack class="profile-bg" />

<div class="relative z-10 min-h-screen safe-bottom pb-safe md:pb-8">
  <ProfileHeader
    profile={profile}
    coverUrl={profile.banner_url}
    avatarUrl={profile.avatar_url}
    canEdit={false}
    canShare={!!shareUrl}
    on:share={handleShare}
  />

  <main class="profile-grid mt-6">
    <div class="profile-cols">
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
