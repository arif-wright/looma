import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { isAdminEmail, serviceClient } from '$lib/server/admin';

const countOrZero = async <T>(promise: Promise<{ count: number | null; error: unknown }>): Promise<number> => {
  try {
    const { count, error } = await promise;
    if (error) {
      console.error('[admin hub] count query failed', error);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.error('[admin hub] count query threw', err);
    return 0;
  }
};

export const load: PageServerLoad = async ({ locals }) => {
  const email = locals.user?.email ?? null;
  if (!isAdminEmail(email)) {
    throw redirect(302, '/app/home');
  }

  const admin = serviceClient();

  const [profileCount, itemCount, reportOpenCount] = await Promise.all([
    countOrZero(admin.from('profiles').select('*', { count: 'exact', head: true })),
    countOrZero(admin.from('shop_items').select('*', { count: 'exact', head: true })),
    countOrZero(admin.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'open'))
  ]);

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [dau, mau] = await Promise.all([
    countOrZero(admin.from('profiles').select('*', { count: 'exact', head: true }).gte('updated_at', since24h)),
    countOrZero(admin.from('profiles').select('*', { count: 'exact', head: true }).gte('updated_at', since30d))
  ]);

  let totalShards30d = 0;
  let orders30d = 0;

  try {
    const { data, error } = await admin.rpc('sum_shop_orders_last_30d');
    if (error) {
      console.warn('[admin hub] revenue rpc failed, falling back', error);
    } else if (Array.isArray(data) && data.length > 0) {
      totalShards30d = Number(data[0]?.total_shards ?? 0);
      orders30d = Number(data[0]?.order_count ?? 0);
    } else if (data && typeof data === 'object') {
      totalShards30d = Number((data as Record<string, unknown>).total_shards ?? 0);
      orders30d = Number((data as Record<string, unknown>).order_count ?? 0);
    }
  } catch (err) {
    console.warn('[admin hub] revenue rpc threw, falling back', err);
  }

  if (!orders30d && !totalShards30d) {
    try {
      const { data } = await admin
        .from('shop_orders')
        .select('price_shards, created_at')
        .gte('created_at', since30d);
      if (Array.isArray(data)) {
        orders30d = data.length;
        totalShards30d = data.reduce((sum, row) => sum + Number(row?.price_shards ?? 0), 0);
      }
    } catch (err) {
      console.error('[admin hub] fallback orders query failed', err);
    }
  }

  const [{ data: recentOrders, error: ordersError }, { data: recentReports, error: reportsError }] =
    await Promise.all([
      admin
        .from('shop_orders')
        .select('id, price_shards, created_at, user_id, slug')
        .order('created_at', { ascending: false })
        .limit(5),
      admin
        .from('reports')
        .select('id, target_kind, reason, status, created_at, reporter_id')
        .order('created_at', { ascending: false })
        .limit(5)
    ]);

  if (ordersError) {
    console.error('[admin hub] recent orders query failed', ordersError);
  }
  if (reportsError) {
    console.error('[admin hub] recent reports query failed', reportsError);
  }

  return {
    isAdmin: true,
    metrics: {
      profileCount,
      itemCount,
      reportOpenCount,
      dau,
      mau,
      totalShards30d,
      orders30d
    },
    recentOrders: recentOrders ?? [],
    recentReports: recentReports ?? []
  };
};
