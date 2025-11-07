import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { isAdminEmail } from '$lib/server/admin';
import { listGameImages } from '$lib/server/shop-images';

export const GET: RequestHandler = async ({ locals }) => {
  const user = (locals as any)?.user;
  if (!isAdminEmail(user?.email)) {
    return json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const images = await listGameImages();
  return json({ ok: true, images });
};
