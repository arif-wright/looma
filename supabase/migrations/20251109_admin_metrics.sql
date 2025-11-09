create or replace function public.sum_shop_orders_last_30d()
returns table(total_shards bigint, order_count bigint)
language sql
stable
as $$
  select coalesce(sum(price_shards), 0)::bigint as total_shards,
         count(*)::bigint as order_count
  from public.shop_orders
  where created_at >= now() - interval '30 days';
$$;
