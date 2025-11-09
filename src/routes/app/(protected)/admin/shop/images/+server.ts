import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getAdminFlags } from '$lib/server/admin-guard';
import { listGameImages } from '$lib/server/shop-images';

export const GET: RequestHandler = async ({ locals }) => {
  const email = locals.session?.user?.email ?? locals.user?.email ?? null;
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;
  const flags = await getAdminFlags(email, userId);

  if (!flags.isAdmin) {
    return json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const images = await listGameImages();
  return json({ ok: true, images });
};
