# Personality-informed companion responses

Memvoya is a persistent companion-centered social and world platform. The RPG is one experience inside it. Personality profiling begins at onboarding; current emotional context, learned preferences, the companion's own identity and actual shared history remain distinct. Experiences can become meaningful objects, memories, traditions and places. Users can accept, change or decline invitations.

## First implementation

The existing Home reconnect emits `companion.ritual.listen`. Event ingestion now loads a small personalization projection for that event through the authenticated request's Supabase client. The shared context bundle, public profile and world protocol do not gain the personality vector.

The projection requires all of:

- Stored quiz consent is explicitly true.
- `consent_adaptation` and `consent_emotional_adaptation` are explicitly true.
- Quiz version is `emotional-profile-v1`.
- All ten stored dimensions are finite numbers between zero and one.

Missing preferences, lookup errors, unknown versions and reset/malformed profiles produce no personalization. Reads are not cached. Explicit event adaptation suppression also disables prompt guidance.

The mean of stability preference and ritual affinity is compared with the mean of novelty seeking and playful activation. A difference below 0.15 is treated as ambiguous. Otherwise, a bounded `structured` or `exploratory` pacing preference is supplied. This mapping is a product hypothesis, not a validated psychological measurement. It does not use reassurance need to assign a diagnosis or hidden motive, and it does not change scores or companion archetype.

Generated replies receive tentative pacing guidance, the current reflection (up to the existing 480-character input limit), mood and existing history. Instructions give explicit user requests priority, preserve the companion voice and prohibit invented history. Actual model compliance requires separate evaluation; prompt instructions alone are not a guarantee.

Non-model Home reconnect replies can offer one optional structured or exploratory continuation. They add none for heavy/numb moods or recognized requests/negations. That conservative text heuristic is not a complete natural-language intent detector. Unrecognized languages and indirect requests remain a limitation to evaluate before broader release.

## Public and private information

Both profile-view loaders use an explicit public projection containing only the existing badge fields `archetype` and `color`. Detailed emotional dimensions, answers, scores and future private fields are omitted even when the account is publicly viewable. The owner's account profile can still receive its existing private summary.

No database schema or quiz scoring change is included. Existing quiz consent collection/defaulting behavior is not redesigned in this patch. The new use of data requires explicit stored permissions and fails neutral when they cannot be established.

## Validation and next step

Focused tests compare the same Muse and reflection across contrasting profiles, verify consent-off and malformed-data neutrality, exercise owner-scoped reads and storage failures, compare deterministic fallback text, and verify public projection serialization.

Next, exercise an authenticated development journey through onboarding, reconnect and return continuity. Evaluate response quality with permitted model calls and test data. Then complete the Moss Seat/shared-rest persistence and remembered-activity loop. Do not infer a successful live playthrough from unit tests or build success.

The control-plane repository and its PR #44 are outside this change. No new autonomous-agent infrastructure is required.
