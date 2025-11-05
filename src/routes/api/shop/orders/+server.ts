import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json(
    {
      code: 'shop_disabled',
      message: 'Shop orders API has been disabled while the marketplace is rebuilt.'
    },
    { status: 410, headers: { 'cache-control': 'no-store' } }
  );
};
