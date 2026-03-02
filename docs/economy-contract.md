# Looma Economy Contract

Looma monetizes acceleration, expression, and premium depth. It does not monetize emotional access to the companion.

## Core Rules

- `Check in`, `Journal`, `Messages`, `Circles`, and basic `Companion care` are always free.
- The bond loop must never be blocked by a paywall, cooldown purchase, or stamina purchase.
- Paid systems should make progression smoother or richer, not make the relationship possible.

## Economy Layers

### 1. Bond Layer

Always available:

- reconnect and check-in
- journal review and memory refresh
- basic companion care
- basic messaging and circle participation
- chapter reveals, digests, recaps, and companion replies

This is the trust layer. If this feels monetized, Looma’s core promise breaks.

### 2. Momentum Layer

`Energy` should be renamed to `Momentum` or `Spark`.

This is the paced progression layer:

- reward-bearing game runs
- boosted mission runs
- optional bonus multipliers
- limited high-yield shard loops
- special challenge threads or seasonal objectives

Rules:

- some free daily uses before friction appears
- natural regeneration
- higher cap and faster regeneration can be subscriber benefits
- no core bond action should spend momentum

### 3. Expression Layer

Primary shard sinks and premium appeal:

- sanctuary cosmetics
- companion adornments
- keepsake presentation
- profile shelf upgrades
- aura and ambience variants
- seasonal collectibles

This is the healthiest long-term monetization surface because it deepens identity without coercing care.

## Subscription: `Sanctuary+`

The default premium tier is `Sanctuary+`.

What it should unlock:

- faster momentum regeneration
- larger momentum cap
- one daily reserve refill or bonus charge
- richer relationship history depth
- enhanced keepsake shelf presentation
- premium sanctuary cosmetics and aura variants
- deeper chapter insight cards and recap interpretation
- future premium collectible tracks

What it must not unlock:

- the ability to talk to the companion at all
- the ability to maintain the relationship at all
- access to journal, check-ins, or basic care

## Shard Rules

Shards should primarily fund:

- expression
- atmosphere
- optional convenience
- collectible identity

Avoid making shards a prerequisite for emotional continuity.

## Admin Operations

- Super admins can grant or revoke `Sanctuary+` from the Players admin surface.
- Admin grants should use the same entitlement model future Stripe subscriptions will use.
- Stripe should eventually write into `user_subscriptions`, not a parallel billing-only flag.

## Implementation Direction

Near-term:

- keep core bond loop free
- implement `Sanctuary+` entitlements
- use admin grants for testing and support
- move future subscription billing into the same entitlement table

Long-term:

- rename player `energy` to `momentum` or `spark`
- gate only optional reward-heavy loops with it
- monetize cosmetics, premium depth, and smoother progression
