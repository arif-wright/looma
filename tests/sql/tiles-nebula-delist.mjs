// Isolated PostgreSQL/WASM test: synthetic records only, no service connection.
// PGLITE_MODULE=file:///tmp/.../node_modules/@electric-sql/pglite/dist/index.js node tests/sql/tiles-nebula-delist.mjs
// PGlite validates SQL/RLS/rollback, not real competing-session lock scheduling.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const owner = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const slug = 'tiles-run-skin-nebula';
const read = (path) => readFileSync(path, 'utf8');
const forward = read('docs/sql/tiles-nebula-delist.sql');
const rollback = read('docs/sql/tiles-nebula-restore.sql');
const rows = async (sql) => (await db.query(sql)).rows;
let checks = 0;
const pass = (message) => console.log(`PASS ${++checks}: ${message}`);
const asUser = async (id, sql) => {
  await db.exec(`SET ROLE authenticated; SELECT set_config('test.uid','${id}',false);`);
  try { return await rows(sql); } finally { await db.exec('RESET ROLE'); }
};
const apply = async (sql) => {
  try { await db.exec(sql); } catch (error) { await db.exec('ROLLBACK'); throw error; }
};
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    INSERT INTO auth.users VALUES ('${owner}'), ('${other}');`);
  for (const file of ['20251104_shop_items.sql','20251105_shop_purchases.sql','20251105_shop_nonstackable.sql','20251105_shop_featured.sql']) {
    await db.exec(read(`supabase/migrations/${file}`));
  }
  await db.exec(`GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
    GRANT SELECT ON public.shop_items,public.shop_items_view,public.shop_inventory,public.shop_orders,public.user_wallets TO anon,authenticated;
    INSERT INTO public.shop_inventory(user_id,item_id) SELECT '${owner}',id FROM public.shop_items WHERE slug='${slug}';
    INSERT INTO public.user_wallets(user_id,shards) VALUES ('${owner}',1000),('${other}',1000);
    INSERT INTO public.shop_orders(user_id,item_id,slug,price_shards) SELECT '${owner}',id,slug,120 FROM public.shop_items WHERE slug='${slug}';`);
  const beforeInventory = await rows('SELECT * FROM public.shop_inventory ORDER BY id');
  const beforeOrders = await rows('SELECT * FROM public.shop_orders ORDER BY id');
  const beforeWallets = await rows('SELECT * FROM public.user_wallets ORDER BY user_id');
  const beforeOtherProducts = await rows(`SELECT * FROM public.shop_items WHERE slug<>'${slug}' ORDER BY slug`);
  const originalTarget = await rows(`SELECT * FROM public.shop_items WHERE slug='${slug}'`);
  await apply(forward);
  assert.deepEqual(await rows(`SELECT active,featured FROM public.shop_items WHERE slug='${slug}'`),[{active:false,featured:false}]);
  assert.deepEqual(await asUser(owner,`SELECT slug FROM public.shop_items_view WHERE active=true AND slug='${slug}'`),[]);
  assert.deepEqual(await asUser(owner,`SELECT slug FROM public.shop_items WHERE active=true AND featured=true AND slug='${slug}'`),[]);
  pass('both actual storefront query predicates exclude the inactive/unfeatured placeholder');
  const ownedMetadata = await asUser(owner,`SELECT i.acquired_at,s.slug,s.title,s.image_url FROM public.shop_inventory i LEFT JOIN public.shop_items s ON s.id=i.item_id WHERE i.user_id='${owner}'`);
  assert.equal(ownedMetadata.length,1); assert.equal(ownedMetadata[0].slug,slug); assert.equal(ownedMetadata[0].title,'Tiles Run – Nebula Skin');
  assert.equal(ownedMetadata[0].image_url,'/games/tiles-run/cover-512.webp');
  pass('owner inventory relation retains title/slug/image/acquired history under real source RLS');
  assert.deepEqual(await asUser(other,`SELECT slug FROM public.shop_items WHERE slug='${slug}'`),[]);
  assert.deepEqual(await asUser(other,`SELECT item_id FROM public.shop_inventory WHERE user_id='${owner}'`),[]);
  await db.exec('SET ROLE anon');
  assert.deepEqual(await rows(`SELECT slug FROM public.shop_items WHERE slug='${slug}'`),[]);
  await db.exec('RESET ROLE');
  pass('narrow owner policy does not reveal inactive metadata or ownership rows through direct tables to other/anonymous users');
  for (const user of [owner,other]) {
    await assert.rejects(asUser(user,`SELECT * FROM public.purchase_item('${slug}')`),/Item not available/);
  }
  assert.deepEqual(await rows('SELECT * FROM public.shop_inventory ORDER BY id'),beforeInventory);
  assert.deepEqual(await rows('SELECT * FROM public.shop_orders ORDER BY id'),beforeOrders);
  assert.deepEqual(await rows('SELECT * FROM public.user_wallets ORDER BY user_id'),beforeWallets);
  assert.deepEqual(await rows(`SELECT * FROM public.shop_items WHERE slug<>'${slug}' ORDER BY slug`),beforeOtherProducts);
  pass('actual purchase RPC rejects new buys without touching inventory, orders, wallets or unrelated products');
  await db.exec(`ALTER POLICY "owned retired Tiles Nebula metadata" ON public.shop_items TO anon USING (false)`);
  await assert.rejects(apply(rollback), /Reviewed Nebula metadata policy required/);
  assert.deepEqual(await rows(`SELECT active,featured FROM public.shop_items WHERE slug='${slug}'`),[{active:false,featured:false}]);
  assert.equal((await rows(`SELECT count(*)::int AS n FROM pg_policy WHERE polrelid='public.shop_items'::regclass AND polname='owned retired Tiles Nebula metadata'`))[0].n,1);
  pass('rollback refuses policy predicate/role drift atomically instead of dropping a later edit');
  await db.exec(`ALTER POLICY "owned retired Tiles Nebula metadata" ON public.shop_items TO authenticated
    USING (slug='${slug}' AND active=false AND EXISTS (
      SELECT 1 FROM public.shop_inventory AS owned
      WHERE owned.item_id=shop_items.id AND owned.user_id=(SELECT auth.uid())
    ))`);
  await apply(rollback);
  assert.deepEqual(await rows(`SELECT * FROM public.shop_items WHERE slug='${slug}'`),originalTarget);
  assert.equal((await rows(`SELECT count(*)::int AS n FROM pg_policy WHERE polrelid='public.shop_items'::regclass AND polname='owned retired Tiles Nebula metadata'`))[0].n,0);
  assert.deepEqual(await rows('SELECT * FROM public.shop_inventory ORDER BY id'),beforeInventory);
  pass('guarded rollback restores exact original catalog row and removes only its named owner policy');
  await db.exec(`INSERT INTO public.shop_inventory(user_id,item_id) SELECT '${other}',id FROM public.shop_items WHERE slug='${slug}'`);
  await assert.rejects(apply(forward),/Expected exactly one Nebula test entitlement/);
  assert.deepEqual(await rows(`SELECT * FROM public.shop_items WHERE slug='${slug}'`),originalTarget);
  pass('changed ownership count aborts atomically before any delist or policy creation');
  await db.exec(`DELETE FROM public.shop_inventory WHERE user_id='${other}'; UPDATE public.shop_items SET price_shards=121 WHERE slug='${slug}'`);
  await assert.rejects(apply(forward),/Nebula catalog changed/);
  assert.deepEqual(await rows(`SELECT active,featured,price_shards FROM public.shop_items WHERE slug='${slug}'`),[{active:true,featured:true,price_shards:121}]);
  pass('changed catalog precondition aborts without overwriting later changes');
  assert.match(forward,/LOCK TABLE public\.shop_items IN ACCESS EXCLUSIVE MODE/);
  assert.match(forward,/LOCK TABLE public\.shop_inventory IN SHARE MODE/);
  assert.match(forward,/SET LOCAL lock_timeout = '5s'/);
  pass('proposal includes bounded lock/drain contract; real concurrent lock scheduling NOT RUN');
  console.log(`PASSED ${checks} isolated SQL/RLS checks; no hosted data, native concurrency, HTTP or browser execution.`);
} finally { await db.close(); }
