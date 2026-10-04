# Unified Item System Contract

## Purpose

Every item must connect acquisition, ownership, use, companion response, and memory.

> Acquire -> own -> use, gift, place, or equip -> companion responds -> relationship remembers

Items must not appear on a surface without a source or a supported action.

## Source Of Truth

- `item_catalog` defines what an item is and what it can do.
- `user_items` records who owns it, which companion it belongs to, and why it was acquired.
- Feature-specific tables record current use:
  - `sanctuary_placements` records placed items.
  - Future companion equipment records worn items.
  - Future gift events record items given to companions.
- The Journal records meaningful unlocks and first-use moments.

## Capabilities

- `placeable`: can be placed in the Personal Sanctuary.
- `interactive`: unlocks a direct activity.
- `keepsake`: preserves relationship provenance.
- `giftable`: can be given to a companion.
- `wearable`: can be equipped by a companion.
- `consumable`: can be used once.

Capabilities describe actions. They do not create separate inventories.

## Surface Responsibilities

- Inventory: everything owned, its origin, and available actions.
- Companion: direct actions such as gifting, equipping, care, and play.
- Sanctuary: the shared environment and currently placed items.
- Journal: why an item matters and what happened around it.
- Missions, care, play, and social systems: item acquisition sources.

## First Vertical Loop

1. Complete three care moments with one companion.
2. Unlock the Moss Seat in `user_items`.
3. See its care provenance in Inventory.
4. Place it in the Personal Sanctuary.
5. Record the placement response in the Journal.

6. Use the placed Moss Seat for shared rest and follow its persisted Journal memory.

## Current Implementation Checkpoint — 2026-10-04

Shared rest, owned acquisition identity, history preservation and absence protection exist in published draft PR #9. The local batch qualifies Moss Seat from persisted direct care, saves acquisition and unlock memory atomically, keeps bond calls owner-verified, settles achievement rewards in one transaction and makes the acquired object's recorded story inspectable.

These changes reuse the existing item, Journal and economy systems. Missing or legacy history is not invented. The story uses exact acquisition ownership, memory consent and conservative existing Journal archive visibility. It adds no mutation, emotional profiling, inventory system or monetization behavior.

Hosted schema/grants, real browser interaction and competing-session verification remain release gates. Placement-to-Journal recovery is still separate work. See [the roadmap status](roadmap-status-2026-10-04.md).
