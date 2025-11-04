import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const catalogPromise = fetch('/api/shop/catalog', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify({})
  });

  const walletPromise = fetch('/api/econ/wallet', {
    headers: { 'cache-control': 'no-store' }
  });

  const inventoryPromise = fetch('/api/inventory', {
    headers: { 'cache-control': 'no-store' }
  });

  const ordersPromise = fetch('/api/shop/orders', {
    headers: { 'cache-control': 'no-store' }
  });

  try {
    const [catalogRes, walletRes, inventoryRes, ordersRes] = await Promise.all([
      catalogPromise,
      walletPromise,
      inventoryPromise,
      ordersPromise
    ]);

    const catalogData = catalogRes.ok ? await catalogRes.json() : { products: [] };
    const wallet = walletRes.ok ? await walletRes.json() : null;
    const inventoryData = inventoryRes.ok ? await inventoryRes.json() : { inventory: [] };
    const ordersData = ordersRes.ok ? await ordersRes.json() : { orders: [] };

    return {
      products: catalogData.products ?? [],
      wallet,
      inventory: inventoryData.inventory ?? [],
      orders: ordersData.orders ?? []
    };
  } catch (error) {
    console.warn('[shop] load failed', error);
    return {
      products: [],
      wallet: null,
      inventory: [],
      orders: []
    };
  }
};
