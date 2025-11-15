import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { serviceClient } from '$lib/server/admin';
import { getAdminFlags } from '$lib/server/admin-guard';
import { getCompanionHealthSummary } from '$lib/server/admin/companions';

const FEATURE_FLAG_KEYS = ['messenger', 'games_hub', 'wallet_topups', 'creator_tools', 'events_feed'] as const;

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

const bucket14 = (rows: Array<{ created_at: string }> | null, kind: string) => {
  const tally: Record<string, number> = {};
  for (const row of rows ?? []) {
    if (!row?.created_at || (kind && (row as any).kind !== kind)) continue;
    const dayKey = new Date(row.created_at).toISOString().slice(0, 10);
    tally[dayKey] = (tally[dayKey] ?? 0) + 1;
  }

  return Array.from({ length: 14 }).map((_, idx) => {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - 13 + idx);
    const key = day.toISOString().slice(0, 10);
    return { date: key, count: tally[key] ?? 0 };
  });
};

const resolveAdminContext = async (locals: App.Locals) => {
  const email = locals.session?.user?.email ?? locals.user?.email ?? null;
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;
  const flags = await getAdminFlags(email, userId);
  return { flags, userId };
};

export const load: PageServerLoad = async ({ locals }) => {
  const { flags, userId } = await resolveAdminContext(locals);
  if (!flags.isAdmin) {
    throw redirect(302, '/app/home');
  }

  const admin = serviceClient();

  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since14d = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [profileCount, itemCount, reportOpenCount] = await Promise.all([
    countOrZero(admin.from('profiles').select('id', { count: 'exact', head: true })),
    countOrZero(admin.from('shop_items').select('id', { count: 'exact', head: true })),
    countOrZero(admin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'))
  ]);

  let totalShards30d = 0;
  let orders30d = 0;

  try {
    const { data, error } = await admin.rpc('sum_shop_orders_last_30d');
    if (error) {
      console.warn('[admin hub] sum_shop_orders_last_30d failed', error);
    } else if (Array.isArray(data) && data.length > 0) {
      totalShards30d = Number(data[0]?.total_shards ?? 0);
      orders30d = Number(data[0]?.order_count ?? 0);
    }
  } catch (err) {
    console.warn('[admin hub] revenue rpc threw', err);
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

  const [dauResult, mauResult, sparkResult] = await Promise.all([
    admin.rpc('count_distinct_event_users', { window_start: since24h }),
    admin.rpc('count_distinct_event_users', { window_start: since30d }),
    admin.from('events').select('created_at, kind').gte('created_at', since14d)
  ]);

  const dau = typeof dauResult.data === 'number' ? Number(dauResult.data) : 0;
  const mau = typeof mauResult.data === 'number' ? Number(mauResult.data) : 0;
  if (dauResult.error) console.error('[admin hub] dau rpc failed', dauResult.error);
  if (mauResult.error) console.error('[admin hub] mau rpc failed', mauResult.error);
  if (sparkResult.error) console.error('[admin hub] spark query failed', sparkResult.error);

  const loginSpark = bucket14(sparkResult.data ?? [], 'login');
  const viewSpark = bucket14(sparkResult.data ?? [], 'pageview');

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

  const stripeSummary = await admin.rpc('stripe_payments_summary', { window_start: since30d });
  if (stripeSummary.error) {
    console.error('[admin hub] stripe summary query failed', stripeSummary.error);
  }

  let totalCents30d = 0;
  let paymentCount30d = 0;
  const summaryRow = Array.isArray(stripeSummary.data) ? stripeSummary.data[0] : stripeSummary.data;
  if (summaryRow) {
    totalCents30d = Number(summaryRow.total_cents ?? 0);
    paymentCount30d = Number(summaryRow.payment_count ?? 0);
  }

  let recentPayments: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    brand: string | null;
    last4: string | null;
    created_at: string;
  }> = [];

  if (flags.isFinance) {
    const { data, error } = await admin
      .from('stripe_payments')
      .select('id, amount, currency, status, brand, last4, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) {
      console.error('[admin hub] stripe payments query failed', error);
    } else if (Array.isArray(data)) {
      recentPayments = data;
    }
  }

  const { data: featureFlagRows } = await admin
    .from('feature_flags')
    .select('key, enabled, note, updated_at')
    .order('key');
  const featureFlagMap = new Map(
    (featureFlagRows ?? []).map((row) => [row.key, row])
  );
  const knownFlags = FEATURE_FLAG_KEYS.map((key) => {
    const entry = featureFlagMap.get(key) ?? null;
    return {
      key,
      enabled: entry?.enabled ?? false,
      note: entry?.note ?? null,
      updated_at: entry?.updated_at ?? null
    };
  });
  const extraFlags = (featureFlagRows ?? []).filter((row) => !FEATURE_FLAG_KEYS.includes(row.key as any));

  let maintenanceRow: { id: number; enabled: boolean; message: string | null; updated_at: string | null } | null = null;
  try {
    const { data, error } = await admin
      .from('maintenance')
      .select('id, enabled, message, updated_at')
      .limit(1)
      .maybeSingle();
    if (error) {
      if (error.code !== 'PGRST205') {
        console.error('[admin hub] maintenance fetch failed', error);
      }
    } else {
      maintenanceRow = data as typeof maintenanceRow;
    }
  } catch (err) {
    console.error('[admin hub] maintenance query threw', err);
  }

  let dbOk = false;
  try {
    const { error } = await admin.from('profiles').select('id').limit(1);
    dbOk = !error;
    if (error) console.error('[admin hub] db heartbeat failed', error);
  } catch (err) {
    console.error('[admin hub] db heartbeat threw', err);
  }

  const { data: lastCharge } = await admin
    .from('stripe_payments')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const companionHealth = flags.isSuper ? await getCompanionHealthSummary(admin) : null;

  return {
    flags,
    userId,
    metrics: {
      profileCount,
      itemCount,
      reportOpenCount,
      totalShards30d,
      orders30d
    },
    analytics: {
      dau,
      mau,
      loginSpark,
      viewSpark
    },
    finance: {
      totalCents30d,
      paymentCount30d,
      recentPayments,
      canViewDetails: flags.isFinance
    },
    featureFlags: {
      known: knownFlags,
      extra: extraFlags
    },
    maintenance: maintenanceRow ?? { id: 1, enabled: false, message: null, updated_at: null },
    health: {
      dbOk,
      lastStripeAt: lastCharge?.created_at ?? null,
      pendingMigrations: 0,
      errorLogCount: null
    },
    companionHealth,
    recentOrders: recentOrders ?? [],
    recentReports: recentReports ?? []
  };
};

export const actions: Actions = {
  flags: async ({ request, locals }) => {
    const { flags, userId } = await resolveAdminContext(locals);
    if (!flags.isAdmin) {
      throw redirect(302, '/app/home');
    }

    const formData = await request.formData();
    const admin = serviceClient();
    const updates = FEATURE_FLAG_KEYS.map((key) => ({
      key,
      enabled: formData.has(`flag-${key}`),
      note: (() => {
        const value = formData.get(`note-${key}`);
        return value ? String(value).trim() || null : null;
      })(),
      updated_by: userId ?? null
    }));

    const { error } = await admin.from('feature_flags').upsert(
      updates.map((entry) => ({
        key: entry.key,
        enabled: entry.enabled,
        note: entry.note,
        updated_by: entry.updated_by
      }))
    );

    if (error) {
      console.error('[admin hub] failed to update feature flags', error);
      return fail(500, { message: 'Unable to update feature toggles' });
    }

    return { success: true };
  },
  maintenance: async ({ request, locals }) => {
    const { flags, userId } = await resolveAdminContext(locals);
    if (!flags.isAdmin) {
      throw redirect(302, '/app/home');
    }

    const formData = await request.formData();
    const enabled = formData.has('maintenance-enabled');
    const messageValue = formData.get('maintenance-message');
    const message = messageValue ? String(messageValue).trim() || null : null;

    const admin = serviceClient();
    const { error } = await admin.from('maintenance').upsert({
      id: 1,
      enabled,
      message,
      updated_by: userId ?? null
    });

    if (error) {
      console.error('[admin hub] failed to update maintenance state', error);
      return fail(500, { message: 'Unable to update maintenance mode' });
    }

    return { success: true };
  }
};
