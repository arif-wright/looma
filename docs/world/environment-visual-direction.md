# Exploration environment visual direction

Status: approved visual target for the Phase 8D exploration vertical slice.

Canonical reference image: `art-source/world/environment/references/3bf40675-74cc-4a44-bff9-fffa7e249a19.png`.

## Scope of approval

The reference establishes visual direction only. It is not a runtime asset, map, texture atlas, level-layout specification, collision source, or gameplay specification. It must not be copied into `static/`, loaded by an environment manifest, used as a background, or cropped into production assets. Production environment assets will be supplied and approved separately.

The illustration's UI, labels, character placement, prop placement, path dimensions, perspective, shadows, and decorative layout are non-authoritative. They must not be measured or translated into world coordinates. The canonical traversal manifest, existing collision footprints, server coordinates, player and companion state, and gameplay contracts remain unchanged.

## Approved visual target

- HD illustrated fantasy RPG environment with a soft painterly/storybook finish.
- Warm yellow-green grass with layered tonal variation rather than a flat repeating field.
- Organic earthen paths with soft, irregular grass transitions, embedded stones, subtle wear, and readable boundaries without hard rectangular edges.
- Stylized trees with strong conifer and broadleaf silhouettes, layered foliage masses, readable trunks, and darker framing vegetation near the scene perimeter.
- Rounded, painterly rocks with broad value planes, moss, flowers, and vegetation that ground them naturally without obscuring their solid silhouette.
- Moderately rich vegetation using clustered flowers, grass tufts, small plants, stones, and foliage. Density should be composed in pockets, preserving clear traversal lanes and actor readability.
- A palette built around warm sunlit greens and earth tones, deep blue-green shadow foliage, restrained violet flowers, and cyan/aether highlights.
- Magical accents should remain sparse and purposeful: small cyan motes, glowing flora, and subtle violet/cyan points of interest rather than a uniform glow over the scene.
- Props should feel rooted through contact darkening, clustered undergrowth, overlap, and soft grounding. Realtime shadows remain out of scope; lightweight authored/contact-shadow treatments are preferred.
- The Moonberry should read as a distinctive magical harvestable through a rounded berry-like core, protective leaves, violet/aether color, restrained cyan-violet glow, and a silhouette identifiable at gameplay scale.
- Overall density should frame and enrich the playable area while keeping players, companions, the path, interaction prompts, and solid obstacles immediately legible.

## Translation into production assets

Artists should reproduce the approved style through separately isolated terrain, path, prop, vegetation, interactable, and effect assets following `environment-production-handoff.md`. Asset anchors and visual footprints must conform to the existing authoritative placement and collision data. If an illustration-inspired prop cannot communicate its current collision footprint clearly, the asset must be revised; traversal must not be changed to fit the painting.

Renderer-local dressing may use the reference's density and color rhythm as guidance, but placement must remain deterministic, non-colliding, and independent of multiplayer state. Decorative details may not introduce apparent barriers across walkable ground or roads.

## Explicitly non-canonical details

- Painted object coordinates and quantities
- Road position, width, curvature, and walkable extent
- Player or companion appearance, identity, scale, or placement
- Camera framing and UI composition
- Lighting direction as a gameplay system
- Implied harvesting, vegetation, or environmental mechanics
- Any decorative object not already represented by an approved asset contract

