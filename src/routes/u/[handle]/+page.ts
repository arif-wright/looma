import { PUBLIC_APP_URL } from '$env/static/public';
import type { PageData } from './$types';

export const entries = (data: PageData) => {
  const { profile, gated, isFollowing, isOwnProfile } = data;
  const isGatedPublic = gated && !isFollowing && !isOwnProfile;
  const display = profile.display_name ?? profile.handle;
  const title = `${display} (@${profile.handle}) • Looma`;
  const desc = isGatedPublic
    ? 'This profile is private on Looma'
    : profile.bio?.trim()?.slice(0, 160) || 'View profile on Looma';
  const baseUrl = PUBLIC_APP_URL || data.shareUrl || '';
  const og = isGatedPublic
    ? `${baseUrl}/og/default-profile.png`
    : `${baseUrl}/api/og/profile?handle=${profile.handle}`;

  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      images: [og],
      url: `${baseUrl}/u/${profile.handle}`
    },
    twitter: { card: 'summary_large_image', images: [og] }
  };
};
