import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const supabase = (locals as any)?.supabase;
  const user = (locals as any)?.user;

  if (!supabase) {
    return { shards: 0, tx: [], error: 'Missing Supabase client' };
  }

  if (!user) {
    const {
      data: { user: fetched }
    } = await supabase.auth.getUser();
    if (!fetched) {
      return { shards: 0, tx: [], error: 'Not authenticated' };
    }
    (locals as any).user = fetched;
  }

  const [walletRes, txRes] = await Promise.all([
    supabase.from('user_wallets').select('shards').single(),
    supabase
      .from('wallet_transactions')
      .select('kind, amount, source, ref_id, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
  ]);

  return {
    shards: walletRes.data?.shards ?? 0,
    tx: txRes.data ?? [],
    error: walletRes.error?.message ?? txRes.error?.message ?? null
  };
};
