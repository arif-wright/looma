# ADR-002: Anonymous authoritative room for Stage 2

- Status: Accepted for Stage 2 only
- Date: 2026-08-02

## Decision

Run Colyseus as an independent Node.js and TypeScript package at `services/world-server`. The browser joins the versioned `wilds` room anonymously and sends only `{ sequence, x, y }` normalized movement intents. `WorldRoom` advances players on a bounded 50 ms simulation interval, clamps them to the shared 960×540 map, resolves the placeholder obstacle, and synchronizes typed `PlayerState` objects.

The browser predicts its own movement with the existing Phaser physics, corrects toward authoritative snapshots, and interpolates remote sprites. The SDK's bounded automatic reconnection is used with server-side presence retained for a configurable grace period. If connection or recovery fails, Phaser stays mounted and remains locally playable.

The wire declarations are intentionally projected into both packages instead of importing server code into the Vercel web build. `WORLD_PROTOCOL_VERSION` is the compatibility boundary; Stage 3 must validate a short-lived Supabase-derived world ticket before admitting a client.

## Consequences

- The service can install, test, build, deploy, and scale independently without changing the root npm scripts.
- No room identifier, reconnection token, origin policy, or server configuration is displayed in the UI.
- Origin allowlisting, rate limits, shape validation, sequence checks, authoritative movement, and payload limits reduce accidental and basic abusive traffic.
- Anonymous users can impersonate neither accounts nor durable progress because neither exists in Stage 2, but anyone who can reach the endpoint can join. Production exposure is prohibited until Stage 3 authentication and identity binding land.
- Protocol declarations are duplicated at a package boundary and must be kept aligned through compatibility tests or a future publishable protocol-only package.

## Deferred

Supabase authentication, user identity, persistence, Redis/presence distribution, inventory, rewards, companions, combat, production matchmaking, telemetry aggregation, and cross-instance rooms remain deferred.
