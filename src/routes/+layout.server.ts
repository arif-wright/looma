import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  const user = locals.user;
  let profile: { id: string; display_name: string | null; handle: string | null; avatar_url: string | null } | null =
    null;

  if (user && locals.supabase) {
    const { data } = await locals.supabase
      .from('profiles')
      .select('id, display_name, handle, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    profile = (data as typeof profile) ?? null;
  }

  return { user, profile };
};
