# Personal Sanctuary Roadmap

## Product Promise

The Personal Sanctuary makes the companion relationship tangible:

> Change a shared space, then see the companion notice and remember that change.

The sanctuary is intentionally smaller than a world builder. Expansion should follow demonstrated relationship value rather than editor complexity.

## Implementation Checkpoint — 2026-10-04

This sequence distinguishes source implementation from hosted acceptance. See [the reconciled status and release gates](roadmap-status-2026-10-04.md).

The Moss Seat shared-rest transaction and owned-object history hardening are published in draft PR #9 at `178aeb5`. Care qualification, owner-checked bond calls, atomic achievement settlement and the read-only acquired-keepsake story are reconstructed locally for fresh verification. No feature migration or application deployment is performed by that reconstruction. Finish the same single-object loop before expanding scope.

## Foundation: One Shared Space

Status: implemented in source; hosted acceptance remains open

- One private sanctuary per user
- Five clear decoration spaces
- Owned placeable items sourced from the unified item system
- Persistent placement and removal
- Active companion presence
- Companion reaction after placement
- Reactions recorded in the companion Journal; placement and its Journal insert still have a partial-failure gap
- Moss Seat earned after three persisted direct-care events, with acquisition and unlock memory saved atomically in the local repair

Success signal:

- Players return to change the sanctuary and revisit recorded reactions.

## Next: Meaningful Object Interactions

Status: Moss Seat implemented in source; reliability and hosted acceptance remain open

- Placed Moss Seat unlocks a shared-rest interaction
- Shared rest restores the companion's effective energy and records a Journal memory
- The rest action only appears while it is currently available; cooldown state should explain that the last quiet moment is still being carried.
- After a successful persisted rest memory, Sanctuary links directly to the Journal entry.
- Tired companions invite the user toward the Sanctuary from Home and Companions
- Continue unlocking objects through care, missions, play, and relationship milestones
- Give placed objects a small companion interaction
- Let selected journal keepsakes appear as sanctuary objects
- Allow the companion to leave a note or gift near an object

Success signal:

- Players understand why an object matters, not merely how it looks.

## Later: Visiting

- Read-only friend sanctuary visits
- Reactions and small gifts
- Snapshot sharing
- Privacy and moderation controls

Success signal:

- Sanctuary visits deepen existing relationships without becoming a public popularity feed.

## Future: Small Worlds

Separate flagged Wilds implementation exists in source and later ADRs. It does not establish this Sanctuary product phase or a verified live rollout.

- Multiple sanctuary scenes
- Modular paths, structures, and points of interest
- Collaborative spaces only after private and visiting loops retain players
- AI assistance may suggest layouts, descriptions, or environmental changes

Explicitly out of scope until then:

- Prompt-generated explorable 3D worlds
- Freeform terrain editing
- Real-time collaborative building
- A creator marketplace
