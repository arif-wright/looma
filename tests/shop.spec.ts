import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { runSeed } from './fixtures/env';
import { createAuthedRequest, loginAs, VIEWER_CREDENTIALS } from './fixtures/auth';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

test.describe.serial('Shop core', () => {
  let viewerId: string;
  let viewerCtx: Awaited<ReturnType<typeof createAuthedRequest>>;

  test.beforeAll(async () => {
    const seed = await runSeed();
    viewerId = seed.viewer.id;
    viewerCtx = await createAuthedRequest(VIEWER_CREDENTIALS);

    await admin.from('user_points').upsert({ user_id: viewerId, points: 720 });
    await admin.rpc('fn_wallet_grant', {
      p_user: viewerId,
      p_amount: 5000,
      p_source: 'shop_test_seed',
      p_ref: null,
      p_meta: { test: true }
    });
  });

  test.afterAll(async () => {
    await viewerCtx.dispose();
  });

  test('catalog renders with promo badges', async ({ page }) => {
    await loginAs(page, VIEWER_CREDENTIALS);
    await page.goto('/app/shop');
    await expect(page.getByTestId('shop-card-energy-refill-large')).toBeVisible();
    await expect(page.getByTestId('promo-ribbon').first()).toBeVisible();
  });

  test('price endpoint applies promo and achievement discounts', async () => {
    const response = await viewerCtx.post('/api/shop/price', {
      data: { lines: [{ sku: 'energy-refill-large', qty: 1 }] }
    });

    expect(response.status(), 'price status').toBe(200);
    const payload = await response.json();
    expect(payload.achievementPercent, 'achievement tier').toBeGreaterThanOrEqual(15);
    expect(payload.maxPromoPercent, 'promo percent').toBeGreaterThanOrEqual(20);
    expect(payload.combinedDiscountPercent, 'combined clamp').toBe(25);
    expect(payload.lines[0].total, 'line total').toBeLessThan(payload.lines[0].subtotal);
  });

  test('purchase delivers inventory and deducts wallet', async () => {
    const beforeRes = await viewerCtx.get('/api/econ/wallet');
    expect(beforeRes.status(), 'wallet fetch').toBe(200);
    const beforeWallet = await beforeRes.json();

    const purchaseRes = await viewerCtx.post('/api/shop/purchase', {
      data: { lines: [{ sku: 'loot-crate-standard', qty: 1 }] }
    });

    expect(purchaseRes.status(), 'purchase status').toBe(200);
    const purchaseBody = await purchaseRes.json();
    expect(purchaseBody.orderId).toBeTruthy();

    const afterRes = await viewerCtx.get('/api/econ/wallet');
    const afterWallet = await afterRes.json();
    expect(afterWallet.balance, 'wallet decreased').toBeLessThan(beforeWallet.balance);

    const inventoryRes = await viewerCtx.get('/api/inventory');
    const inventoryBody = await inventoryRes.json();
    const crateEntry = inventoryBody.inventory.find((row: any) => row.sku === 'loot-crate-standard');
    expect(crateEntry, 'inventory entry').toBeTruthy();
    expect(crateEntry.qty, 'inventory qty').toBeGreaterThan(0);

    const ordersRes = await viewerCtx.get('/api/shop/orders');
    const ordersBody = await ordersRes.json();
    expect(Array.isArray(ordersBody.orders), 'orders array').toBe(true);
    expect(ordersBody.orders[0]?.id, 'order recorded').toBe(purchaseBody.orderId);
  });

  test('cooldown violation returns 409', async () => {
    const first = await viewerCtx.post('/api/shop/purchase', {
      data: { lines: [{ sku: 'energy-refill-small', qty: 1 }] }
    });
    expect(first.status(), 'initial purchase').toBe(200);

    const second = await viewerCtx.post('/api/shop/purchase', {
      data: { lines: [{ sku: 'energy-refill-small', qty: 1 }] }
    });

    expect(second.status(), 'cooldown status').toBe(409);
    const error = await second.json();
    expect(error.code).toBe('cooldown_active');
  });

  test('per-user limit enforced', async () => {
    const first = await viewerCtx.post('/api/shop/purchase', {
      data: { lines: [{ sku: 'booster-ultra', qty: 1 }] }
    });
    expect(first.status(), 'first booster purchase').toBe(200);

    const second = await viewerCtx.post('/api/shop/purchase', {
      data: { lines: [{ sku: 'booster-ultra', qty: 1 }] }
    });
    expect(second.status(), 'limit status').toBe(409);
    const error = await second.json();
    expect(error.code).toBe('limit_exceeded');
  });

  test('rate limit returns 429 when exceeded', async () => {
    const previousLimit = process.env.SHOP_RATE_LIMIT_PER_MINUTE;
    process.env.SHOP_RATE_LIMIT_PER_MINUTE = '2';

    try {
      const ok1 = await viewerCtx.post('/api/shop/price', {
        data: { lines: [{ sku: 'xp-burst-30m', qty: 1 }] }
      });
      expect(ok1.status(), 'first price').toBe(200);

      const ok2 = await viewerCtx.post('/api/shop/price', {
        data: { lines: [{ sku: 'xp-burst-30m', qty: 1 }] }
      });
      expect(ok2.status(), 'second price').toBe(200);

      const limited = await viewerCtx.post('/api/shop/price', {
        data: { lines: [{ sku: 'xp-burst-30m', qty: 1 }] }
      });
      expect(limited.status(), 'rate limit status').toBe(429);
      const body = await limited.json();
      expect(body.code).toBe('rate_limited');
    } finally {
      process.env.SHOP_RATE_LIMIT_PER_MINUTE = previousLimit;
    }
  });

  test('flash promo expiration updates price', async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    await admin
      .from('shop_promotions')
      .update({ ends_at: past })
      .eq('slug', 'flash-energy-boost');

    const response = await viewerCtx.post('/api/shop/price', {
      data: { lines: [{ sku: 'energy-refill-large', qty: 1 }] }
    });

    expect(response.status(), 'price after expiry').toBe(200);
    const payload = await response.json();
    expect(payload.maxPromoPercent).toBe(0);
  });
});
