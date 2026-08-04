# The Wilds Local Development

Stage 5 requires an authenticated Memvoya session and a short-lived signed world ticket before Colyseus admission. The Phaser shell still works locally when the server is absent or authorization fails. Location and discoveries can be persisted; there are no durable rewards.

## Enable locally

1. Install the repository dependencies with `npm ci`.
2. Configure the existing Supabase variables used by authenticated routes.
3. Generate a random secret of at least 32 characters. Add `PUBLIC_WORLD_ENABLED=true`, `PUBLIC_WORLD_SERVER_URL=http://localhost:2567`, and `WORLD_JOIN_SECRET=<secret>` to the web `.env.local`.
4. In one terminal, run `npm run dev` from the repository root.
5. Apply `supabase/migrations/20260802210000_world_persistence.sql` and `supabase/migrations/20260803120000_world_moonberry_gather.sql` with the repository's normal Supabase migration workflow. `supabase/seed_world.sql` contains the base one-town/one-exploration-map fixture for local environments that seed separately.
6. In another terminal, run `npm ci`, copy `.env.example` to `.env`, set the same `WORLD_JOIN_SECRET`, `WORLD_SUPABASE_URL`, and server-only `WORLD_SUPABASE_SERVICE_ROLE_KEY`, and then run `npm run dev` from `services/world-server`.
7. Sign in to the web application.
8. Open `http://localhost:5173/app/world` (or the URL printed by Vite) in two browser windows to see both players.

The flag is parsed by `src/routes/app/(protected)/world/+page.server.ts`. Missing values and every value except `true` or `1` fail closed. When disabled, the page renders an unavailable state and does not mount or dynamically import Phaser.

## Controls

- Move: WASD or arrow keys.
- Touch: press and hold the four-direction pad shown on touch devices.
- Gather at Moonberry Grove: press E or use **Gather Moonberry** when the proximity prompt appears.
- Leave: use **Return Home**, the existing Memvoya sidebar/topbar, or the mobile dock.

The player is confined to the map bounds and collides with the central placeholder rock. Artwork under `static/game/world` is intentionally temporary.

## World server

`services/world-server` is intentionally an independent package. Copy its `.env.example` to `.env` if defaults are not suitable. Its useful commands are:

- `npm run dev` — start the TypeScript server with watch mode.
- `npm run check` — type-check server and tests.
- `npm test` — run simulation, state-transition, abuse, and two-client tests.
- `npm run build && npm start` — compile and run the independent Node service.

The default health endpoint is `http://localhost:2567/health`. Browser WebSocket origins are allowlisted with `WORLD_ALLOWED_ORIGINS`; this is an additional defense, not authentication. `WORLD_JOIN_SECRET` exists only in the SvelteKit and realtime server environments and must never have a `PUBLIC_` prefix. Only `PUBLIC_WORLD_SERVER_URL` and the rollout flag belong in the browser-visible configuration.

## Ticket and reconnect behavior

On mount, the browser POSTs to `/api/world/ticket`. SvelteKit uses the existing verified `locals.user`, reads only the signed-in user's `id`, `display_name`, `handle`, and account-privacy flag through the normal user-scoped Supabase client, and returns a 45-second one-use ticket. Private accounts receive the neutral `Explorer` presentation. It never returns the Supabase access token. Colyseus derives the account UUID and safe display identity from the verified ticket and accepts no client identity fields—the join shape permits only `ticket`.

Supabase SSR may refresh its cookie session before ticket issuance through the existing server client. A Colyseus transport reconnect during the configured grace period uses Colyseus's scoped reconnection credential; it does not reuse the admission ticket. After grace expiry or a full page remount, the browser requests a fresh ticket. A revoked/expired Supabase session cannot obtain a new ticket. An already issued ticket has a maximum 45-second revocation window and becomes invalid immediately after first consumption.

## Companion follower verification

Set an active companion through the existing Memvoya companion UI, then enter The Wilds in two authenticated sessions. Each player should see the same placeholder follower paired with its owner. Changing the active companion is reflected after the next signed refresh (within about 30 seconds) or after reconnect/reload. A player with no companion simply has no follower.

Followers use no Phaser physics and cannot block paths. Normal motion trails a short buffer of authoritative owner positions; `prefers-reduced-motion: reduce` removes interpolation. Stop the realtime server briefly and confirm other clients show the disconnected owner's follower in its dimmed reconnecting state, then restore it within the grace period.

## Moonberry loop verification

1. Enter `/app/world` with persistence configured and walk to the purple Moonberry Grove at the upper-right of Whispering Grove.
2. Confirm the proximity prompt appears. Press E or tap **Gather Moonberry**.
3. Confirm the success notice names one Moonberry and, when an active companion exists, shows its authored reaction.
4. Follow **View in Keepsakes** and confirm the canonical Inventory displays Moonberry, its quantity, and “Gathered in The Wilds.”
5. Return immediately and gather again. Confirm the cooldown state appears and quantity remains unchanged.
6. Reload/reconnect and retry the prior operation during cooldown; confirm no additional item or Journal entry appears.
7. For database verification, inspect the signed-in owner's rows in `world_landmark_discoveries`, `world_events`, `user_items`, and—when applicable—`companion_journal_entries`. There must be one successful event/item increment and at most one Journal row for the event UUID.

The node is per-player: a second account may gather while the first account is cooling down. Set `world_gather_nodes.is_active=false` for an operational node kill switch. Reward quantity, cooldown, and holding cap are database configuration and must remain within migration-enforced bounds.

## Production configuration

Configure both deployments independently:

- Vercel/SvelteKit: `PUBLIC_WORLD_ENABLED`, `PUBLIC_WORLD_SERVER_URL=https://…`, `WORLD_JOIN_SECRET`, plus the existing Supabase public/server configuration.
- Realtime service: `NODE_ENV=production`, the same `WORLD_JOIN_SECRET`, exact HTTPS entries in `WORLD_ALLOWED_ORIGINS`, `PORT`, `WORLD_RECONNECT_GRACE_SECONDS`, `WORLD_PING_INTERVAL_MS`, `WORLD_PING_MAX_RETRIES`, `WORLD_MAX_CLIENTS`, `WORLD_LOG_LEVEL`, `WORLD_MAP_ID`, `WORLD_CHECKPOINT_SECONDS`, `WORLD_SUPABASE_URL`, and the server-only `WORLD_SUPABASE_SERVICE_ROLE_KEY`. The heartbeat defaults allow 30 seconds for a pong (`10000` × `3`) so brief browser scheduling stalls do not destroy a healthy session.

`WORLD_SUPABASE_SERVICE_ROLE_KEY` must exist only in the realtime deployment. Production startup fails closed when persistence configuration is absent. Checkpoints default to 15 seconds and configuration is bounded to 5–60 seconds; frames are never written. The initial active map is `wilds-exploration`. Disconnect drops, graceful leaves, and shutdown trigger a final best-effort checkpoint.

Production startup rejects missing/short signing secrets, wildcard origins, localhost origins, and loopback origins. Rotate the signing secret in both deployments together; during rotation, old unconsumed tickets fail closed.

## Lifecycle behavior

- Phaser is dynamically imported only after the Svelte component mounts in the browser.
- A `ResizeObserver` fits the fixed 960×540 logical world into the available area without changing its aspect ratio.
- `visibilitychange` sleeps the Phaser loop while the page is hidden and wakes it on return.
- Svelte teardown destroys the game and canvas.
- A global mount registry destroys an older instance before navigation or hot reload can create another canvas.

## Verification

With the flag off, confirm `/app/world` shows **The Wilds is not available yet** and the DOM contains no `<canvas>`. With it on, confirm exactly one canvas appears. Without the server, the badge must say local mode and movement must keep working. With the server, open two sessions and confirm distinct players move in both, remote movement is smooth, reconnect status appears during a brief outage, and local mode remains usable after reconnection is exhausted. Also confirm bounds, obstacle collision, resize, tab pause, and navigation teardown still behave as Stage 1 specified.
