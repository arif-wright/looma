import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';

let stripeClient: Stripe | null = null;

export const getStripe = () => {
  if (stripeClient) return stripeClient;

  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: '2023-10-16'
  });

  return stripeClient;
};

const getServiceKey = () => {
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE ?? '';
  if (!key) {
    throw new Error('Supabase service key is not configured');
  }
  return key;
};

export function serviceClient() {
  return createClient(PUBLIC_SUPABASE_URL, getServiceKey(), {
    auth: { persistSession: false }
  });
}

export function productCatalog() {
  return [
    { key: '500', shards: 500, priceId: env.STRIPE_PRICE_500 ?? '' },
    { key: '1200', shards: 1200, priceId: env.STRIPE_PRICE_1200 ?? '' },
    { key: '2600', shards: 2600, priceId: env.STRIPE_PRICE_2600 ?? '' }
  ].filter((entry) => entry.priceId);
}
