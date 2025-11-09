import { PUBLIC_APP_URL } from '$env/static/public';
import type { PageData } from './$types';

const formatImages = (url?: string) => (url ? [{ url }] as const : []);

export const entries = (data?: PageData) => {
  const profile = data?.profile;
  if (!profile) {
    return {
      title: 'Profile • Looma',
      description: 'Explore profiles on Looma',
      openGraph: {
        title: 'Profile • Looma',
        description: 'Explore profiles on Looma',
        images: []
      },
      twitter: { card: 'summary_large_image', images: [] }
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

  const base = (PUBLIC_APP_URL || data?.shareUrl || '').replace(/\/?$/, '');
  const og = base
    ? `${base}${isGatedPublic ? '/og/default-profile.png' : `/api/og/profile?handle=${profile.handle}`}`
    : undefined;
  const url = base ? `${base}/u/${profile.handle}` : undefined;
  const images = formatImages(og);

  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      images,
      ...(url ? { url } : {})
    },
    twitter: { card: 'summary_large_image', images }
  };
};
