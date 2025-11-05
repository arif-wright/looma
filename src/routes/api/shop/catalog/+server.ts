import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
  return json(
    {
      code: 'shop_disabled',
      message: 'Shop catalog API has been disabled while the marketplace is rebuilt.'
    },
    { status: 410, headers: { 'cache-control': 'no-store' } }
  );
};
