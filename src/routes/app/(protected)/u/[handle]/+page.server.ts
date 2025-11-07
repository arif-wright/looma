import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const parentData = await event.parent();

  return {
    profile: parentData.profile,
    viewerId: parentData.viewerId ?? null,
    isOwner: parentData.isOwner ?? false
  };
};
