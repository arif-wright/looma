import type { Companion } from '$lib/stores/companions';
import { resolveCanonicalArchetypeId, type CanonicalArchetypeId } from '$lib/onboarding/archetypes';
import type { CompanionElementId } from '$lib/companions/elements';
import { getCompanionElementProfile, sampleCompanionIdentityProfiles } from '$lib/companions/identity';

export const GIFT_CATEGORY_IDS = [
  'crystal',
  'music',
  'flower',
  'memory',
  'sweet',
  'toy',
  'puzzle',
  'lantern',
  'charm',
  'plant',
  'tea',
  'story',
  'art',
  'shell',
  'woven',
  'hearth',
  'stone',
  'moon',
  'prism',
  'keepsake',
  'snack',
  'trinket'
] as const;

export type GiftCategoryId = (typeof GIFT_CATEGORY_IDS)[number];
export type GiftPreferenceLevel = 'loved' | 'liked' | 'neutral' | 'disliked';
export type GiftRarity = 'common' | 'uncommon' | 'rare';

export type GiftCategoryDefinition = {
  id: GiftCategoryId;
  label: string;
  description: string;
  emotionalMeaning: string;
  visualHint: string;
};

export type GiftPreferenceSet = Record<GiftPreferenceLevel, GiftCategoryId[]>;

export type ArchetypeGiftPreferences = GiftPreferenceSet & {
  archetypeId: CanonicalArchetypeId;
  theme: string;
};

export type ElementGiftPreferences = {
  loved: GiftCategoryId[];
  liked: GiftCategoryId[];
};

export type FavoriteGiftOverrides = Partial<GiftPreferenceSet>;

export type CompanionGiftItem = {
  id: string;
  name: string;
  category: GiftCategoryId;
  rarity: GiftRarity;
  description: string;
  tags: string[];
  baseBondValue: number;
  iconKey: string;
};

export type GiftPreferenceEvaluation = {
  preference: GiftPreferenceLevel;
  category: GiftCategoryDefinition;
  multiplier: number;
  bondGain: number;
  response: string;
};

const category = (
  id: GiftCategoryId,
  label: string,
  description: string,
  emotionalMeaning: string,
  visualHint: string
): GiftCategoryDefinition => ({ id, label, description, emotionalMeaning, visualHint });

export const giftCategories: Record<GiftCategoryId, GiftCategoryDefinition> = {
  crystal: category('crystal', 'Crystal', 'Resonant stones, prisms, and softly glowing facets.', 'Clarity, resonance, and focused feeling.', 'faceted glow and tiny refractions'),
  music: category('music', 'Music', 'Soft tones, chimes, and melody-bearing objects.', 'Expression, rhythm, and emotional resonance.', 'tiny sound waves, chimes, glowing notes'),
  flower: category('flower', 'Flower', 'Living blooms, luminous petals, and small botanical offerings.', 'Tenderness, beauty, care, and emotional openness.', 'soft petals and warm bloom'),
  memory: category('memory', 'Memory', 'Objects that carry moments, names, places, or repeated feelings.', 'Continuity, identity, and remembered care.', 'afterimages and memory shimmer'),
  sweet: category('sweet', 'Sweet', 'Small treats with a bright, comforting, or playful feeling.', 'Joy, softness, and simple delight.', 'sugar sparkle and warm color'),
  toy: category('toy', 'Toy', 'Playful little objects made for motion, discovery, or shared delight.', 'Curiosity, play, and low-pressure connection.', 'bouncy motion and bright dots'),
  puzzle: category('puzzle', 'Puzzle', 'Shifting curios, riddles, and small thinking objects.', 'Discovery, pattern, and satisfying focus.', 'turning cubes and little glints'),
  lantern: category('lantern', 'Lantern', 'Guiding lights, steady flames, and gentle beacons.', 'Safety, hope, and being guided through difficulty.', 'warm lantern glow'),
  charm: category('charm', 'Charm', 'Small personal tokens worn or kept close.', 'Affection, intention, and quiet protection.', 'tiny hanging charm and soft shine'),
  plant: category('plant', 'Plant', 'Sprouts, leaves, mosses, and living keepsakes.', 'Growth, patience, restoration, and return.', 'green glow and unfurling leaves'),
  tea: category('tea', 'Tea', 'Fragrant leaves, warming cups, and calming ritual blends.', 'Recovery, quiet, steadiness, and soothing care.', 'steam curls and amber warmth'),
  story: category('story', 'Story', 'Pages, fragments, and symbolic scenes that invite meaning.', 'Narrative, reflection, and emotional pattern.', 'turning pages and violet ink'),
  art: category('art', 'Art', 'Painted, sketched, crafted, or color-rich offerings.', 'Expression, beauty, imagination, and self-recognition.', 'paint shimmer and soft strokes'),
  shell: category('shell', 'Shell', 'Tide-carried keepsakes with a quiet inner sound.', 'Listening, memory, return, and emotional tides.', 'pearl edges and ripple lines'),
  woven: category('woven', 'Woven', 'Braided threads, blankets, knots, and handmade textures.', 'Shelter, care, patience, and held-together feeling.', 'thread patterns and soft knots'),
  hearth: category('hearth', 'Hearth', 'Warm home-centered offerings that feel steady and safe.', 'Belonging, warmth, shelter, and return.', 'ember warmth and rounded glow'),
  stone: category('stone', 'Stone', 'Grounding stones, carved anchors, and quiet weights.', 'Stability, endurance, patience, and confidence.', 'matte stone and low glow'),
  moon: category('moon', 'Moon', 'Moonlit objects, night tokens, and dream-facing keepsakes.', 'Mystery, introspection, softness, and symbolic reflection.', 'silver haze and crescent light'),
  prism: category('prism', 'Prism', 'Light-splitting objects that reveal color from feeling.', 'Hope, clarity, expression, and reframed perspective.', 'rainbow refractions'),
  keepsake: category('keepsake', 'Keepsake', 'Personal tokens that matter because they have been carried.', 'Meaning, loyalty, memory, and emotional continuity.', 'small glow around a treasured object'),
  snack: category('snack', 'Snack', 'Simple bites and playful little comforts.', 'Casual care, joy, and everyday return.', 'tiny crumbs and cheerful sparkle'),
  trinket: category('trinket', 'Trinket', 'Odd little finds with personality and motion.', 'Novelty, discovery, and playful attention.', 'small spinning glints')
};

export const archetypeGiftPreferences: Record<CanonicalArchetypeId, ArchetypeGiftPreferences> = {
  muse: {
    archetypeId: 'muse',
    theme: 'Expression, harmony, beauty, emotional resonance',
    loved: ['music', 'crystal', 'flower', 'art', 'prism'],
    liked: ['memory', 'sweet', 'shell', 'story', 'charm'],
    neutral: ['plant', 'tea', 'toy', 'woven', 'keepsake'],
    disliked: ['stone', 'hearth']
  },
  guardian: {
    archetypeId: 'guardian',
    theme: 'Safety, loyalty, courage, protection',
    loved: ['lantern', 'charm', 'woven', 'hearth', 'stone'],
    liked: ['crystal', 'tea', 'story', 'plant', 'keepsake'],
    neutral: ['flower', 'sweet', 'memory', 'shell'],
    disliked: ['toy', 'trinket']
  },
  spark: {
    archetypeId: 'spark',
    theme: 'Play, curiosity, momentum, discovery',
    loved: ['toy', 'puzzle', 'sweet', 'trinket', 'snack'],
    liked: ['music', 'crystal', 'art', 'story', 'prism'],
    neutral: ['flower', 'shell', 'charm', 'keepsake'],
    disliked: ['stone', 'hearth']
  },
  root: {
    archetypeId: 'root',
    theme: 'Grounding, patience, restoration, growth',
    loved: ['plant', 'tea', 'woven', 'stone', 'flower'],
    liked: ['shell', 'memory', 'charm', 'hearth', 'keepsake'],
    neutral: ['crystal', 'sweet', 'story', 'art'],
    disliked: ['toy', 'trinket']
  },
  echo: {
    archetypeId: 'echo',
    theme: 'Memory, nostalgia, reflection, emotional continuity',
    loved: ['memory', 'story', 'shell', 'charm', 'keepsake'],
    liked: ['flower', 'music', 'crystal', 'tea', 'moon'],
    neutral: ['sweet', 'plant', 'woven', 'prism'],
    disliked: ['snack', 'toy']
  }
};

export const elementGiftPreferences: Record<CompanionElementId, ElementGiftPreferences> = {
  light: { loved: ['crystal', 'prism', 'flower'], liked: ['lantern', 'charm'] },
  sound: { loved: ['music'], liked: ['shell', 'story'] },
  dream: { loved: ['moon', 'story', 'art'], liked: ['memory', 'prism'] },
  tide: { loved: ['shell', 'tea'], liked: ['flower', 'memory'] },
  spark: { loved: ['toy', 'puzzle', 'trinket', 'sweet'], liked: ['music', 'snack'] },
  echo: { loved: ['memory', 'keepsake', 'story'], liked: ['shell', 'moon'] },
  root: { loved: ['plant', 'stone', 'woven'], liked: ['tea', 'hearth'] },
  ember: { loved: ['hearth', 'lantern', 'stone'], liked: ['charm', 'tea'] }
};

export const companionGiftItems: CompanionGiftItem[] = [
  { id: 'resonance_crystal', name: 'Resonance Crystal', category: 'crystal', rarity: 'rare', tags: ['muse', 'sound', 'light', 'harmony'], baseBondValue: 12, iconKey: 'crystal', description: 'A softly glowing crystal that hums when held near a Muse.' },
  { id: 'star_chime', name: 'Star Chime', category: 'music', rarity: 'uncommon', tags: ['muse', 'sound', 'dream'], baseBondValue: 10, iconKey: 'music', description: 'A tiny chime that rings with a tone only companions seem to hear.' },
  { id: 'moonflower', name: 'Moonflower', category: 'flower', rarity: 'uncommon', tags: ['muse', 'light', 'dream'], baseBondValue: 9, iconKey: 'flower', description: 'A luminous flower that opens when the room grows quiet.' },
  { id: 'ember_lantern', name: 'Ember Lantern', category: 'lantern', rarity: 'rare', tags: ['guardian', 'ember', 'protection'], baseBondValue: 12, iconKey: 'lantern', description: 'A small lantern with a steady flame that never seems to flicker.' },
  { id: 'hearthstone', name: 'Hearthstone', category: 'hearth', rarity: 'uncommon', tags: ['guardian', 'root', 'ember'], baseBondValue: 10, iconKey: 'hearth', description: 'A warm stone that carries the feeling of a safe place.' },
  { id: 'puzzle_cube', name: 'Puzzle Cube', category: 'puzzle', rarity: 'uncommon', tags: ['spark', 'curiosity', 'play'], baseBondValue: 9, iconKey: 'puzzle', description: 'A shifting little cube that never solves the same way twice.' },
  { id: 'joy_cookie', name: 'Joy Cookie', category: 'sweet', rarity: 'common', tags: ['spark', 'sweet', 'playful'], baseBondValue: 6, iconKey: 'sweet', description: 'A cheerful treat with a sparkle of harmless mischief.' },
  { id: 'seedstone', name: 'Seedstone', category: 'stone', rarity: 'uncommon', tags: ['root', 'grounding', 'growth'], baseBondValue: 10, iconKey: 'stone', description: 'A smooth stone with a tiny living sprout curled inside.' },
  { id: 'warm_tea_leaf', name: 'Warm Tea Leaf', category: 'tea', rarity: 'common', tags: ['root', 'tide', 'calm'], baseBondValue: 7, iconKey: 'tea', description: 'A fragrant leaf that gives off a gentle warmth.' },
  { id: 'memory_locket', name: 'Memory Locket', category: 'memory', rarity: 'rare', tags: ['echo', 'memory', 'keepsake'], baseBondValue: 12, iconKey: 'memory', description: 'A tiny locket that seems heavier when it holds meaning.' },
  { id: 'storyglass_shard', name: 'Storyglass Shard', category: 'story', rarity: 'uncommon', tags: ['echo', 'dream', 'story'], baseBondValue: 10, iconKey: 'story', description: 'A translucent shard that shows a different image depending on who remembers it.' }
];

export const giftResponseCopy: Record<GiftPreferenceLevel, string[]> = {
  loved: [
    'This deeply resonates with {companionName}.',
    '{companionName} glows a little brighter as they receive it.',
    'This feels like exactly the kind of gift {companionName} understands.'
  ],
  liked: [
    '{companionName} accepts it warmly.',
    'This gift seems to suit {companionName}.',
    'A soft reaction passes through {companionName}.'
  ],
  neutral: [
    '{companionName} receives it gently.',
    'It may not be their favorite, but they seem to appreciate the thought.',
    '{companionName} keeps it close for now.'
  ],
  disliked: [
    '{companionName} accepts it gently, though it does not quite resonate with them.',
    'They seem grateful, even if the gift feels a little distant from their nature.',
    'It does not fully match their rhythm, but the gesture still matters.'
  ]
};

const rank: Record<GiftPreferenceLevel, number> = { disliked: 0, neutral: 1, liked: 2, loved: 3 };
const multipliers: Record<GiftPreferenceLevel, number> = { loved: 1.5, liked: 1.2, neutral: 1, disliked: 0.6 };

const sampleOverride = (companion: Companion | null | undefined) =>
  companion?.name ? sampleCompanionIdentityProfiles[companion.name as keyof typeof sampleCompanionIdentityProfiles] ?? null : null;

const resolveOverride = (companion: Companion | null | undefined): FavoriteGiftOverrides => {
  const maybe = companion as (Companion & { favoriteGiftOverrides?: FavoriteGiftOverrides }) | null | undefined;
  return maybe?.favoriteGiftOverrides ?? {};
};

const preferenceFromSet = (categoryId: GiftCategoryId, prefs: Partial<GiftPreferenceSet>): GiftPreferenceLevel | null => {
  if (prefs.loved?.includes(categoryId)) return 'loved';
  if (prefs.liked?.includes(categoryId)) return 'liked';
  if (prefs.neutral?.includes(categoryId)) return 'neutral';
  if (prefs.disliked?.includes(categoryId)) return 'disliked';
  return null;
};

const strongest = (...levels: Array<GiftPreferenceLevel | null>): GiftPreferenceLevel => {
  return levels.reduce<GiftPreferenceLevel>((best, level) => (level && rank[level] > rank[best] ? level : best), 'neutral');
};

export const getGiftCategory = (categoryId: string | null | undefined): GiftCategoryDefinition | null => {
  return GIFT_CATEGORY_IDS.includes(categoryId as GiftCategoryId) ? giftCategories[categoryId as GiftCategoryId] : null;
};

export const getArchetypeGiftPreferences = (archetypeId: string | null | undefined): ArchetypeGiftPreferences =>
  archetypeGiftPreferences[resolveCanonicalArchetypeId(archetypeId, 'muse')] ?? archetypeGiftPreferences.muse;

export const getElementGiftPreferences = (elementId: string | null | undefined): ElementGiftPreferences => {
  const key = String(elementId ?? '').toLowerCase() as CompanionElementId;
  return elementGiftPreferences[key] ?? { loved: [], liked: [] };
};

export const getCompanionGiftPreferences = (companion: Companion | null | undefined): ArchetypeGiftPreferences => {
  const sample = sampleOverride(companion);
  const archetypePrefs = getArchetypeGiftPreferences(sample?.archetype ?? companion?.species);
  const elementProfile = getCompanionElementProfile(companion);
  const secondaryPrefs = getElementGiftPreferences(elementProfile.secondary);
  const override = resolveOverride(companion);

  // Gift preferences are determined by archetype first, then element expression, then optional individual companion overrides.
  // Gifting should reinforce emotional identity and bond, not act like a combat/stat optimization system.
  return {
    ...archetypePrefs,
    loved: Array.from(new Set([...archetypePrefs.loved, ...secondaryPrefs.loved, ...(override.loved ?? [])])),
    liked: Array.from(new Set([...archetypePrefs.liked, ...secondaryPrefs.liked, ...(override.liked ?? [])])),
    neutral: Array.from(new Set([...archetypePrefs.neutral, ...(override.neutral ?? [])])),
    disliked: Array.from(new Set([...archetypePrefs.disliked, ...(override.disliked ?? [])]))
  };
};

export const getGiftPreferenceForCompanion = (
  companion: Companion | null | undefined,
  gift: CompanionGiftItem | { category: GiftCategoryId }
): GiftPreferenceLevel => {
  const categoryId = gift.category;
  const override = resolveOverride(companion);
  const overridePreference = preferenceFromSet(categoryId, override);
  if (overridePreference) return overridePreference;

  const sample = sampleOverride(companion);
  const archetypePreference = preferenceFromSet(categoryId, getArchetypeGiftPreferences(sample?.archetype ?? companion?.species));
  const elementProfile = getCompanionElementProfile(companion);
  const elementPreference = preferenceFromSet(categoryId, {
    loved: [
      ...getElementGiftPreferences(elementProfile.primary).loved,
      ...getElementGiftPreferences(elementProfile.secondary).loved
    ],
    liked: [
      ...getElementGiftPreferences(elementProfile.primary).liked,
      ...getElementGiftPreferences(elementProfile.secondary).liked
    ]
  });
  return strongest(archetypePreference, elementPreference);
};

export const getGiftBondMultiplier = (preference: GiftPreferenceLevel) => multipliers[preference] ?? 1;

export const getGiftResponseCopy = (
  preference: GiftPreferenceLevel,
  companionName = 'Your companion',
  seed = 0
): string => {
  const options = giftResponseCopy[preference] ?? giftResponseCopy.neutral;
  const template = options[Math.abs(seed) % options.length] ?? options[0] ?? '{companionName} receives it gently.';
  return template.replace(/\{companionName\}/g, companionName);
};

export const calculateGiftBondGain = (
  companion: Companion | null | undefined,
  gift: CompanionGiftItem
): GiftPreferenceEvaluation => {
  const preference = getGiftPreferenceForCompanion(companion, gift);
  const multiplier = getGiftBondMultiplier(preference);
  return {
    preference,
    category: giftCategories[gift.category],
    multiplier,
    bondGain: Math.max(1, Math.round(gift.baseBondValue * multiplier)),
    response: getGiftResponseCopy(preference, companion?.name ?? 'Your companion', gift.id.length)
  };
};

export const getFavoriteGiftItemsForCompanion = (
  companion: Companion | null | undefined,
  limit = 5
): Array<CompanionGiftItem & { preference: GiftPreferenceLevel; categoryDefinition: GiftCategoryDefinition }> => {
  return companionGiftItems
    .map((gift) => ({
      ...gift,
      preference: getGiftPreferenceForCompanion(companion, gift),
      categoryDefinition: giftCategories[gift.category]
    }))
    .sort((a, b) => {
      const byPreference = rank[b.preference] - rank[a.preference];
      if (byPreference !== 0) return byPreference;
      return b.baseBondValue - a.baseBondValue;
    })
    .slice(0, limit);
};
