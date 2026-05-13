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
export type GiftCategory = GiftCategoryId;
export type GiftPreferenceLevel = 'loved' | 'liked' | 'neutral' | 'disliked';
export type GiftRarity = 'common' | 'rare' | 'epic';

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
  icon: string;
  description: string;
  tags: string[];
  baseBondValue: number;
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

const gift = (
  id: string,
  name: string,
  category: GiftCategoryId,
  rarity: GiftRarity,
  baseBondValue: number,
  description: string,
  tags: string[]
): CompanionGiftItem => ({
  id,
  name,
  category,
  rarity,
  icon: `/assets/gifts/gift-${category}-${rarity}-${id.replace(`${category}_${rarity}_`, '').replace(/_/g, '-')}.png`,
  description,
  tags,
  baseBondValue
});

// Favorite Gifts are consumable bond items. They are separate from equipment items such as Sigils, Charms, and Relics.
export const companionGiftItems: CompanionGiftItem[] = [
  gift('crystal_common_glow_pebble', 'Glow Pebble', 'crystal', 'common', 5, 'A small glowing stone that feels warm when held.', ['muse', 'light', 'harmony', 'clarity']),
  gift('crystal_rare_resonance_crystal', 'Resonance Crystal', 'crystal', 'rare', 12, 'A softly glowing crystal that hums when held near a Muse.', ['muse', 'sound', 'light', 'harmony', 'expression']),
  gift('crystal_epic_prism_heart_crystal', 'Prism Heart Crystal', 'crystal', 'epic', 20, 'A radiant heart-shaped crystal that scatters emotion into color.', ['muse', 'light', 'prism', 'harmony', 'expression']),
  gift('music_common_tiny_chime', 'Tiny Chime', 'music', 'common', 5, 'A small chime with a soft, clear tone.', ['muse', 'sound', 'harmony', 'expression']),
  gift('music_rare_star_chime', 'Star Chime', 'music', 'rare', 10, 'A tiny chime that rings with a tone only companions seem to hear.', ['muse', 'sound', 'dream', 'harmony']),
  gift('music_epic_celestial_lyre_charm', 'Celestial Lyre Charm', 'music', 'epic', 20, 'A golden lyre charm that seems to remember every melody.', ['muse', 'sound', 'light', 'harmony', 'memory']),
  gift('flower_common_soft_bloom', 'Soft Bloom', 'flower', 'common', 5, 'A gentle bloom with petals that glow faintly in quiet moments.', ['muse', 'light', 'root', 'care']),
  gift('flower_rare_moonflower', 'Moonflower', 'flower', 'rare', 9, 'A luminous flower that opens when the room grows quiet.', ['muse', 'light', 'dream', 'reflection']),
  gift('flower_epic_harmonia_lotus', 'Harmonia Lotus', 'flower', 'epic', 20, 'A radiant lotus said to bloom only near deep emotional resonance.', ['muse', 'light', 'harmony', 'root', 'expression']),
  gift('memory_common_memory_bead', 'Memory Bead', 'memory', 'common', 5, 'A tiny bead that seems to hold the warmth of a small remembered moment.', ['echo', 'memory', 'keepsake', 'reflection']),
  gift('memory_rare_memory_locket', 'Memory Locket', 'memory', 'rare', 12, 'A tiny locket that seems heavier when it holds meaning.', ['echo', 'memory', 'keepsake', 'reflection']),
  gift('memory_epic_remembered_star', 'Remembered Star', 'memory', 'epic', 20, 'A star-shaped keepsake that glows brighter around cherished memories.', ['echo', 'dream', 'memory', 'light', 'reflection']),
  gift('sweet_common_joy_cookie', 'Joy Cookie', 'sweet', 'common', 6, 'A cheerful treat with a sparkle of harmless mischief.', ['spark', 'play', 'curiosity', 'joy']),
  gift('sweet_rare_dream_macaron', 'Dream Macaron', 'sweet', 'rare', 10, 'A soft, dreamy confection with a filling that tastes like starlight.', ['spark', 'dream', 'play', 'wonder']),
  gift('sweet_epic_starlight_confection', 'Starlight Confection', 'sweet', 'epic', 20, 'A dazzling magical dessert that leaves tiny star motes in the air.', ['spark', 'light', 'play', 'momentum']),
  gift('toy_common_glimmer_top', 'Glimmer Top', 'toy', 'common', 5, 'A small spinning toy that leaves a faint trail of light.', ['spark', 'play', 'curiosity', 'light']),
  gift('toy_rare_spark_kite', 'Spark Kite', 'toy', 'rare', 10, 'A bright little kite that tugs toward motion and laughter.', ['spark', 'play', 'momentum', 'light']),
  gift('toy_epic_wonder_spinner', 'Wonder Spinner', 'toy', 'epic', 20, 'A magical spinner that shifts shape with every burst of curiosity.', ['spark', 'play', 'curiosity', 'dream']),
  gift('puzzle_common_simple_puzzle_tile', 'Simple Puzzle Tile', 'puzzle', 'common', 5, 'A small puzzle tile with a soft star etched into its surface.', ['spark', 'curiosity', 'pattern', 'play']),
  gift('puzzle_rare_puzzle_cube', 'Puzzle Cube', 'puzzle', 'rare', 9, 'A shifting little cube that never solves the same way twice.', ['spark', 'curiosity', 'play', 'momentum']),
  gift('puzzle_epic_infinite_puzzle_box', 'Infinite Puzzle Box', 'puzzle', 'epic', 20, 'A mysterious puzzle box that reveals new patterns when understood.', ['spark', 'dream', 'curiosity', 'pattern']),
  gift('lantern_common_pocket_lantern', 'Pocket Lantern', 'lantern', 'common', 5, 'A tiny lantern with a steady, comforting glow.', ['guardian', 'ember', 'light', 'safety']),
  gift('lantern_rare_ember_lantern', 'Ember Lantern', 'lantern', 'rare', 12, 'A small lantern with a steady flame that never seems to flicker.', ['guardian', 'ember', 'protection', 'safety']),
  gift('lantern_epic_oathfire_lantern', 'Oathfire Lantern', 'lantern', 'epic', 20, 'A brilliant lantern said to burn brightest when protecting someone.', ['guardian', 'ember', 'protection', 'loyalty']),
  gift('charm_common_soft_charm', 'Soft Charm', 'charm', 'common', 5, 'A small charm that carries a gentle feeling of care.', ['guardian', 'echo', 'care', 'safety']),
  gift('charm_rare_safehouse_charm', 'Safehouse Charm', 'charm', 'rare', 10, 'A tiny house-shaped charm that feels like a safe place.', ['guardian', 'root', 'protection', 'safety']),
  gift('charm_epic_guardian_crest', 'Guardian Crest', 'charm', 'epic', 20, 'A radiant crest that symbolizes loyalty, courage, and protection.', ['guardian', 'ember', 'protection', 'loyalty']),
  gift('plant_common_tiny_sprout', 'Tiny Sprout', 'plant', 'common', 5, 'A small sprout that leans gently toward warmth.', ['root', 'growth', 'grounding', 'restoration']),
  gift('plant_rare_moss_charm', 'Moss Charm', 'plant', 'rare', 10, 'A mossy charm that carries the calm of shaded earth.', ['root', 'grounding', 'restoration', 'tide']),
  gift('plant_epic_living_grove_seed', 'Living Grove Seed', 'plant', 'epic', 20, 'A living seed that hums with the patience of an ancient grove.', ['root', 'growth', 'grounding', 'restoration']),
  gift('tea_common_warm_tea_leaf', 'Warm Tea Leaf', 'tea', 'common', 7, 'A fragrant leaf that gives off a gentle warmth.', ['root', 'tide', 'calm', 'restoration']),
  gift('tea_rare_resting_grove_tea', 'Resting Grove Tea', 'tea', 'rare', 10, 'A calming tea blend that smells like rain on leaves.', ['root', 'tide', 'restoration', 'grounding']),
  gift('tea_epic_stillwater_tea_bloom', 'Stillwater Tea Bloom', 'tea', 'epic', 20, 'A luminous tea bloom that opens slowly in moments of quiet recovery.', ['root', 'tide', 'restoration', 'recovery']),
  gift('story_common_story_slip', 'Story Slip', 'story', 'common', 5, 'A curled little note with a half-remembered line written inside.', ['echo', 'dream', 'memory', 'reflection']),
  gift('story_rare_storyglass_shard', 'Storyglass Shard', 'story', 'rare', 10, 'A translucent shard that shows a different image depending on who remembers it.', ['echo', 'dream', 'story', 'memory']),
  gift('story_epic_mythbound_page', 'Mythbound Page', 'story', 'epic', 20, 'A glowing page from a story that seems to include the reader.', ['echo', 'dream', 'memory', 'reflection']),
  gift('art_common_color_thread', 'Color Thread', 'art', 'common', 5, 'A spool of luminous thread used to stitch feeling into color.', ['muse', 'dream', 'expression', 'art']),
  gift('art_rare_painted_star_tile', 'Painted Star Tile', 'art', 'rare', 10, 'A painted tile whose star glimmers differently from every angle.', ['muse', 'light', 'dream', 'expression']),
  gift('art_epic_dreambrush_relic', 'Dreambrush Relic', 'art', 'epic', 20, 'A magical brush that paints the color of remembered dreams.', ['muse', 'dream', 'expression', 'memory']),
  gift('shell_common_soft_shell', 'Soft Shell', 'shell', 'common', 5, 'A pale shell that carries the hush of distant water.', ['root', 'tide', 'echo', 'listening']),
  gift('shell_rare_prism_shell', 'Prism Shell', 'shell', 'rare', 10, 'A pearlescent shell with prism-light refractions and a soft violet-blue glow.', ['root', 'tide', 'muse', 'light']),
  gift('shell_epic_moonlit_tide_shell', 'Moonlit Tide Shell', 'shell', 'epic', 20, 'A luminous shell that seems to hold a tide beneath moonlight.', ['root', 'tide', 'echo', 'dream', 'memory']),
  gift('woven_common_braided_thread', 'Braided Thread', 'woven', 'common', 5, 'A simple braided thread made with careful hands.', ['guardian', 'root', 'care', 'grounding']),
  gift('woven_rare_woven_band', 'Woven Band', 'woven', 'rare', 10, 'A soft braided charm bracelet with tiny glowing beads.', ['guardian', 'root', 'care', 'safety']),
  gift('woven_epic_rootwoven_bracelet', 'Rootwoven Bracelet', 'woven', 'epic', 20, 'An ancient woven bracelet braided with living root and luminous thread.', ['guardian', 'root', 'grounding', 'protection']),
  gift('hearth_common_warm_coal', 'Warm Coal', 'hearth', 'common', 5, 'A small coal that glows warmly without burning.', ['guardian', 'ember', 'hearth', 'safety']),
  gift('hearth_rare_hearthstone', 'Hearthstone', 'hearth', 'rare', 10, 'A warm stone that carries the feeling of a safe place.', ['guardian', 'root', 'ember', 'safety']),
  gift('hearth_epic_hearthheart_ember', 'Hearthheart Ember', 'hearth', 'epic', 20, 'A heart-shaped ember that glows brighter around trust and courage.', ['guardian', 'ember', 'protection', 'trust']),
  gift('stone_common_smooth_stone', 'Smooth Stone', 'stone', 'common', 5, 'A smooth grounding stone marked with a faint spiral.', ['root', 'guardian', 'grounding', 'stability']),
  gift('stone_rare_seedstone', 'Seedstone', 'stone', 'rare', 10, 'A smooth stone with a tiny living sprout curled inside.', ['root', 'grounding', 'growth', 'stability']),
  gift('stone_epic_ancient_rootstone', 'Ancient Rootstone', 'stone', 'epic', 20, 'A deep green stone wrapped in ancient root and quiet patience.', ['root', 'guardian', 'grounding', 'restoration']),
  gift('moon_common_moon_drop', 'Moon Drop', 'moon', 'common', 5, 'A tiny moonlit drop that glows softly in the dark.', ['echo', 'dream', 'memory', 'reflection']),
  gift('moon_rare_moonlit_shell', 'Moonlit Shell', 'moon', 'rare', 10, 'A small shell filled with pale moonlight and quiet memory.', ['echo', 'dream', 'tide', 'memory']),
  gift('moon_epic_lunar_memory_orb', 'Lunar Memory Orb', 'moon', 'epic', 20, 'A glowing orb that reflects memories as if they were constellations.', ['echo', 'dream', 'memory', 'reflection']),
  gift('prism_common_prism_chip', 'Prism Chip', 'prism', 'common', 5, 'A tiny prism shard that catches light in gentle colors.', ['muse', 'light', 'clarity', 'expression']),
  gift('prism_rare_prism_shell', 'Prism Shell', 'prism', 'rare', 10, 'A shell-like prism that bends soft light into emotional color.', ['muse', 'light', 'tide', 'expression']),
  gift('prism_epic_radiant_prism_crown', 'Radiant Prism Crown', 'prism', 'epic', 20, 'A radiant crown of prism light, delicate enough to feel ceremonial.', ['muse', 'light', 'harmony', 'expression']),
  gift('keepsake_common_faded_ribbon', 'Faded Ribbon', 'keepsake', 'common', 5, 'A soft ribbon that feels like it belonged to an old, kind memory.', ['echo', 'memory', 'keepsake', 'reflection']),
  gift('keepsake_rare_keepsake_locket', 'Keepsake Locket', 'keepsake', 'rare', 10, 'A delicate locket made to hold something emotionally important.', ['echo', 'memory', 'keepsake', 'loyalty']),
  gift('keepsake_epic_everheld_token', 'Everheld Token', 'keepsake', 'epic', 20, 'A luminous token that seems to preserve what matters most.', ['echo', 'memory', 'keepsake', 'continuity']),
  gift('snack_common_bright_berry', 'Bright Berry', 'snack', 'common', 5, 'A bright little berry with a sweet spark of energy.', ['spark', 'play', 'momentum', 'snack']),
  gift('snack_rare_spark_biscuit', 'Spark Biscuit', 'snack', 'rare', 10, 'A crisp biscuit that gives off tiny playful sparks.', ['spark', 'play', 'momentum', 'curiosity']),
  gift('snack_epic_festival_starcake', 'Festival Starcake', 'snack', 'epic', 20, 'A celebratory cake topped with starlight and joyful magic.', ['spark', 'light', 'play', 'celebration']),
  gift('trinket_common_curiosity_coin', 'Curiosity Coin', 'trinket', 'common', 5, 'A little coin that seems to flip itself when curiosity rises.', ['spark', 'curiosity', 'play', 'discovery']),
  gift('trinket_rare_glimmer_bauble', 'Glimmer Bauble', 'trinket', 'rare', 10, 'A playful bauble that glimmers with small surprises.', ['spark', 'curiosity', 'light', 'play']),
  gift('trinket_epic_wonderwork_trinket', 'Wonderwork Trinket', 'trinket', 'epic', 20, 'A tiny impossible object that shifts when no one is watching.', ['spark', 'dream', 'curiosity', 'play'])
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

const strongestPositive = (...levels: Array<GiftPreferenceLevel | null>): GiftPreferenceLevel | null => {
  return levels.reduce<GiftPreferenceLevel | null>((best, level) => {
    if (!level || level === 'neutral' || level === 'disliked') return best;
    return !best || rank[level] > rank[best] ? level : best;
  }, null);
};

export const getGiftCategory = (categoryId: string | null | undefined): GiftCategoryDefinition | null => {
  return GIFT_CATEGORY_IDS.includes(categoryId as GiftCategoryId) ? giftCategories[categoryId as GiftCategoryId] : null;
};

export const getAllCompanionGifts = (): CompanionGiftItem[] => [...companionGiftItems];

export const getCompanionGiftById = (giftId: string | null | undefined): CompanionGiftItem | null => {
  return companionGiftItems.find((gift) => gift.id === giftId) ?? null;
};

export const getGiftsByCategory = (categoryId: GiftCategoryId): CompanionGiftItem[] => {
  return companionGiftItems.filter((gift) => gift.category === categoryId);
};

export const getGiftsByRarity = (rarity: GiftRarity): CompanionGiftItem[] => {
  return companionGiftItems.filter((gift) => gift.rarity === rarity);
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
  return strongestPositive(archetypePreference, elementPreference) ?? archetypePreference ?? 'neutral';
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

export const getFavoriteGiftsForCompanion = getFavoriteGiftItemsForCompanion;
