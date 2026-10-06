# Moonberry gathering recovery

Local candidate prepared 2026-10-05 against main
`f0ffa90f1ffd1f1be338ca5c39cc5b7eb0ee57f2`. Nothing in this candidate has been
pushed, merged, deployed, or applied to a database.

## Player-facing repair

Keyboard E and the native Gather button now share a single pending request and
the same busy state. Repeated key presses and taps cannot queue more requests
while that action is pending. The button exposes its busy state to assistive
technology.

A missing reply can no longer leave “Gathering…” indefinitely. After ten
seconds, or immediately on connection loss, authorization loss, or restart, the
client explains that it could not confirm the gather and links to Keepsakes.
A timeout is not cancellation and does not prove that nothing was received.

Reconnecting never automatically repeats a pending reward request. A player
can inspect their collection, then deliberately gather again. That new action
uses a new request identifier; the existing server rules still determine
proximity, availability, holding limits, cooldown and any award. A late reply
from an older attempt or disposed room cannot overwrite the new attempt.

## Why automatic replay was removed

The database already deduplicates the same account and Moonberry request ID.
However, the room checks range, discovery and an in-progress gather before
that durable lookup. A replay while the original request is still running
can return `unavailable` before the original success arrives. A replacement
room can also execute an old uncommitted intent after new authorization.
Database idempotency alone therefore does not establish reliable result
recovery. This client repair conservatively reports uncertainty and requires
a fresh player action rather than adding new server/reward behavior.

## Implementation boundaries

- One pending gather and one watchdog belong to `WorldConnection`.
- Its accepted-start callback feeds `WorldSession` and `WorldGameMount` for
  both Phaser and Three, regardless of input source.
- The watchdog and pending state are cleared before result delivery.
- Only matching, recognized server statuses settle a pending request. The
  additional `unconfirmed` status is generated locally and rejected from the wire.
- Teardown cancels locally without updating a removed UI. Disposed, duplicate,
  malformed-status and late replies are ignored.
- Area changes do not pretend an outstanding gather has finished.
- Existing server-reported failure text also avoids claiming that a missing
  response proves no item was received.
- The holding-limit message links to the collection without telling players
  to “make room”: a Moonberry use/gift action is not yet implemented.

No world-server, database, inventory, journal, reward, protocol-version,
authentication, permission, consent, or companion-behavior contract changes.
The result link opens the existing inventory rather than inventing acquisition
history or a new inventory.

## Verification

Recorded in the accompanying local evidence bundle:

- Node 22; full Svelte check: 0 errors and 0 warnings.
- Core TypeScript check passed.
- All 772 web unit tests across 79 files passed, including 34 connection/session
  tests covering the new lifecycle and existing portal/restart behavior.
- Complete application production build and Vercel adapter packaging passed
  with a bounded 3 GiB Node heap. This is a local build, not deployment.
- World-server type check and all 101 tests across 13 files passed. Those
  existing integration tests use local transport with synthetic identities and
  null/in-memory persistence; they do not verify the hosted database.
- An independent source review found no blocking issue. Its callback-order and
  refresh-rejection-test improvements were incorporated before aggregate checks.

The new browser fixture passed all 24 cases in 5.0 minutes, with zero retries,
skips, unexpected or flaky results. It uses the actual component, session,
connection and both production renderers at 1280px and 320px; narrow cases
deliver real browser touch taps. Only the SDK and ticket response are fake.
Ordinary Chromium launch defaults were used. The fixture recorded no page
exceptions, failed game assets, external requests or application sockets.
Focused fixture Svelte/TypeScript checks passed with 0 errors and 0 warnings.
Final screenshots, structured results and logs are in the evidence bundle.
The proposed read-only GitHub Actions workflow has been parsed locally but
has not been published or run on GitHub.

## Remaining acceptance

No authenticated production gameplay was performed. Real authentication,
network loss/reconnect timing, database settlement, item arrival, journal
delivery and the real inventory destination remain unverified end to end.
The synthetic browser fixture verifies the link destination, not the content
of a real collection. Hardware GPU/frame-time and physical mobile-device
acceptance are separate. No item or memory is repaired or backfilled here.

Screenshot review found a pre-existing optional-Three 320px layout issue: the
gather prompt partly overlaps the upper camera-rotation row. Gathering, the
Keepsakes link and movement remain usable; Phaser's narrow layout is clear.
This candidate changes no renderer or control-layout CSS. Horizontal-fit
checks are not a claim that every Three camera control is unobstructed.

The watchdog bounds the pending UI while the browser event loop is running;
it cannot cancel a remote transaction. Browser suspension can delay the
callback until execution resumes. After uncertainty, an explicit retry may
still receive `unavailable` while the old write runs or `cooldown` after it
commits. The UI makes no exactly-once delivery or no-reward claim.
