# ADR-003: Short-lived server-issued world tickets

- Status: Accepted
- Date: 2026-08-02

## Decision

Use a 45-second, one-use HMAC-SHA256 world ticket instead of passing a Supabase access token to Colyseus. SvelteKit is the issuer because `src/hooks.server.ts` already verifies the Supabase session into `locals.user`. The issuer performs an owner-scoped projection of `profiles.id`, `display_name`, `handle`, and `account_private`, uses a neutral identity for private accounts, normalizes the presentation, and signs fixed issuer, audience, room, protocol, subject, ticket ID, issued-at, and expiry claims.

The browser can submit only `{ ticket }`. The realtime service checks the signature with a shared server-only secret, validates every claim, derives the account from `sub`, consumes `jti` once, and retains the UUID only in private connection auth data. Room state exposes only an ephemeral session entity, bounded display name/handle, presence, and movement.

## Why not pass the Supabase access token?

Tickets minimize bearer-token exposure, prevent the realtime service from receiving a reusable account credential, bind admission to one room/protocol, carry only an allowlisted presentation projection, and require no service-role key or direct Supabase access in the realtime runtime. This preserves the repository's SSR verification convention and keeps privileged credentials out of browser bundles.

## Consequences

- The signing secret must be at least 32 characters, stored independently in Vercel and the realtime service, rotated together, and never prefixed `PUBLIC_`.
- Replay consumption and duplicate-account admission are process-local until Redis/distributed presence is introduced.
- Session revocation prevents new issuance immediately. An unconsumed issued ticket remains usable for at most 45 seconds; this bounded stale-authorization window is accepted for this non-durable slice.
- Transport reconnection uses Colyseus's scoped reconnect token during grace. A new admission fetches a fresh ticket.
