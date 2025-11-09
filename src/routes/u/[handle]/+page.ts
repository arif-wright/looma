import { PUBLIC_APP_URL } from '$env/static/public';
import type { PageData } from './$types';

const DEFAULT_META = {
  title: 'Profile • Looma',
  description: 'Explore profiles on Looma'
};

const withBase = (url?: string | null) => (url ?? '').replace(/\/?$/, '');

export const entries = (data?: PageData) => {
  const profile = data?.profile;
  if (!profile) {
    return {
      ...DEFAULT_META,
      openGraph: {
        title: DEFAULT_META.title,
        description: DEFAULT_META.description
      },
      twitter: { card: 'summary_large_image' }
    };
  }

  const gated = data?.gated ?? false;
  const isFollowing = data?.isFollowing ?? false;
  const isOwnProfile = data?.isOwnProfile ?? false;
  const isGatedPublic = gated && !isFollowing && !isOwnProfile;
  const display = profile.display_name ?? profile.handle;
  const title = `${display} (@${profile.handle}) • Looma`;
  const desc = isGatedPublic
    ? 'This profile is private on Looma'
    : profile.bio?.trim()?.slice(0, 160) || 'View profile on Looma';
  const base = withBase(PUBLIC_APP_URL || data?.shareUrl || null);
  const og = base
    ? `${base}${isGatedPublic ? '/og/default-profile.png' : `/api/og/profile?handle=${profile.handle}`}`
    : undefined;
  const url = base ? `${base}/u/${profile.handle}` : undefined;

  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      ...(og ? { images: [og] } : {}),
      ...(url ? { url } : {})
    },
    twitter: { card: 'summary_large_image', ...(og ? { images: [og] } : {}) }
  };
};
