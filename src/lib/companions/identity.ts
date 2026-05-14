import type { Companion } from '$lib/stores/companions';
import { resolveCanonicalArchetypeId, type CanonicalArchetypeId } from '$lib/onboarding/archetypes';
import {
  companionElementProfiles,
  getCompanionElementProfile as getElementProfileForArchetype,
  getElementById,
  getMuseVariantBySecondary,
  type CompanionElementId,
  type CompanionElementProfile
} from '$lib/companions/elements';

export { getElementById };

export type GiftCategory = 'core' | 'element' | 'bond' | 'story';
export type GiftState = 'active' | 'locked' | 'evolving' | 'dormant';
export type StoryTone = 'warm' | 'mythic' | 'personal' | 'gentle' | 'emotionally reflective';

export type CompanionArchetypeDefinition = {
  id: CanonicalArchetypeId;
  label: string;
  role: string;
  primaryElement: CompanionElementId;
  defaultSecondaryElement: CompanionElementId;
  emotionalDomain: string;
  overviewIdentity: string;
  coreGiftIds: string[];
  growthMilestoneIds: string[];
  storyThemes: string[];
};

export type CompanionGift = {
  id: string;
  name: string;
  archetypeId: CanonicalArchetypeId;
  category: GiftCategory;
  elementRequirement: { primary?: CompanionElementId; secondary?: CompanionElementId } | null;
  requiredBond: number | undefined;
  requiredLevel: number | undefined;
  level: number;
  maxLevel: number;
  unlockCondition: string;
  unlockConditionLabel: string;
  state: GiftState;
  description: string;
  effectSummary: string;
  visualBehavior: string;
  emotionalPurpose: string;
};

export type GrowthMilestone = {
  id: string;
  label: string;
  description: string;
  unlockLevel: number;
  unlockBond: number;
  unlocked: boolean;
  visualState: 'glimmer' | 'bloom' | 'memory' | 'resting' | 'sealed';
};

export type CompanionGrowth = {
  currentPath: string;
  nextMilestone: GrowthMilestone | null;
  secondaryElementInfluence: Array<{ label: string; value: number; description: string }>;
  milestones: GrowthMilestone[];
};

export type StoryFragment = {
  id: string;
  title: string;
  type: StoryTone;
  unlockCondition: string;
  unlocked: boolean;
  body: string;
};

export type CompanionStory = {
  origin: StoryFragment;
  sharedMemories: StoryFragment[];
  unlockedFragments: StoryFragment[];
  lockedFragments: StoryFragment[];
};

export type CompanionIdentity = {
  id: string;
  name: string;
  archetype: CompanionArchetypeDefinition;
  level: number;
  rarity: string;
  mood: string;
  bond: number;
  elementProfile: CompanionElementProfile;
  personality: string[];
  favoriteGifts: string[];
  gifts: Record<GiftCategory, CompanionGift[]>;
  growth: CompanionGrowth;
  story: CompanionStory;
};

export const companionArchetypes: Record<CanonicalArchetypeId, CompanionArchetypeDefinition> = {
  muse: {
    id: 'muse',
    label: 'Muse',
    role: 'Emotional reflection, creativity, harmony, expression',
    primaryElement: 'sound',
    defaultSecondaryElement: 'light',
    emotionalDomain: 'Harmony',
    overviewIdentity:
      'A Muse is sound-born and emotionally responsive. It mirrors rhythm, mood, tone, and expression.',
    coreGiftIds: ['emotional_mirror', 'harmonic_check_in', 'resonance_pulse', 'gentle_reframe'],
    growthMilestoneIds: ['first_resonance', 'shared_rhythm', 'element_bloom', 'memory_thread', 'evolved_form'],
    storyThemes: ['Listening', 'Emotional resonance', 'Being heard', 'Creative expression', 'Inner harmony']
  },
  guardian: {
    id: 'guardian',
    label: 'Guardian',
    role: 'Safety, protection, courage, boundaries, resilience',
    primaryElement: 'ember',
    defaultSecondaryElement: 'root',
    emotionalDomain: 'Protection',
    overviewIdentity:
      'Guardian companions help users feel safe, steady, and capable. They respond to boundary-setting, recovery, courage, and resilience.',
    coreGiftIds: ['safe_harbor', 'boundary_watch', 'courage_ember', 'steadfast_presence'],
    growthMilestoneIds: ['first_watch', 'trusting_ground', 'boundary_bond', 'hearth_bloom', 'oath_form'],
    storyThemes: ['Shelter', 'Loyalty', 'Courage', 'Watchfulness', 'Recovery', 'Emotional safety']
  },
  spark: {
    id: 'spark',
    label: 'Spark',
    role: 'Motivation, curiosity, play, momentum, exploration',
    primaryElement: 'spark',
    defaultSecondaryElement: 'light',
    emotionalDomain: 'Momentum',
    overviewIdentity:
      'Spark companions help users start, explore, play, and move. They are curiosity-driven and energizing without being pushy.',
    coreGiftIds: ['quickstart', 'curiosity_ping', 'momentum_loop', 'play_signal'],
    growthMilestoneIds: ['first_flicker', 'play_loop', 'momentum_thread', 'curiosity_bloom', 'brightstride_form'],
    storyThemes: ['Starting', 'Wonder', 'Curiosity', 'Playful courage', 'Trying again']
  },
  root: {
    id: 'root',
    label: 'Root',
    role: 'Grounding, stability, restoration, consistency, patience',
    primaryElement: 'root',
    defaultSecondaryElement: 'tide',
    emotionalDomain: 'Grounding',
    overviewIdentity: 'Root companions help users slow down, stabilize, and build gentle consistency.',
    coreGiftIds: ['grounding_pulse', 'steady_return', 'quiet_growth', 'rest_root'],
    growthMilestoneIds: ['first_root', 'steady_soil', 'return_ring', 'deep_growth', 'grove_form'],
    storyThemes: ['Patience', 'Returning', 'Gentle growth', 'Emotional roots', 'Shelter', 'Time']
  },
  echo: {
    id: 'echo',
    label: 'Echo',
    role: 'Memory, nostalgia, identity, reflection, emotional continuity',
    primaryElement: 'echo',
    defaultSecondaryElement: 'dream',
    emotionalDomain: 'Memory',
    overviewIdentity:
      'Echo companions help users remember who they are becoming through memories, milestones, repeated emotional patterns, and meaningful moments.',
    coreGiftIds: ['memory_thread', 'pattern_recall', 'soft_return', 'reflection_lens'],
    growthMilestoneIds: [
      'first_echo',
      'remembered_moment',
      'pattern_thread',
      'archive_bloom',
      'living_memory_form'
    ],
    storyThemes: ['Memory', 'Identity', 'Nostalgia', 'Becoming', 'Emotional continuity']
  }
};

const gift = (
  id: string,
  name: string,
  archetypeId: CanonicalArchetypeId,
  category: GiftCategory,
  description: string,
  options: Partial<
    Pick<
      CompanionGift,
      | 'elementRequirement'
      | 'requiredBond'
      | 'requiredLevel'
      | 'level'
      | 'maxLevel'
      | 'unlockCondition'
      | 'unlockConditionLabel'
      | 'state'
      | 'effectSummary'
      | 'visualBehavior'
      | 'emotionalPurpose'
    >
  > = {}
): CompanionGift => ({
  id,
  name,
  archetypeId,
  category,
  elementRequirement: options.elementRequirement ?? null,
  requiredBond: options.requiredBond,
  requiredLevel: options.requiredLevel,
  level: options.level ?? 1,
  maxLevel: options.maxLevel ?? 5,
  unlockCondition: options.unlockCondition ?? 'Available through the current bond.',
  unlockConditionLabel: options.unlockConditionLabel ?? options.unlockCondition ?? 'Available through the current bond.',
  state: options.state ?? 'active',
  description,
  effectSummary: options.effectSummary ?? description,
  visualBehavior: options.visualBehavior ?? 'Adds subtle companion feedback and ambient UI response.',
  emotionalPurpose: options.emotionalPurpose ?? 'Helps the relationship feel more responsive, remembered, and emotionally useful.'
});

const core = (id: string, name: string, archetypeId: CanonicalArchetypeId, description: string) =>
  gift(id, name, archetypeId, 'core', description);

const element = (
  id: string,
  name: string,
  archetypeId: CanonicalArchetypeId,
  primary: CompanionElementId,
  secondary: CompanionElementId,
  description: string
) =>
  gift(id, name, archetypeId, 'element', description, {
    elementRequirement: { primary, secondary },
    state: 'evolving',
    unlockCondition: `${primary} + ${secondary} expression path`
  });

export const companionGifts: Record<string, CompanionGift> = [
  core('emotional_mirror', 'Emotional Mirror', 'muse', 'Reflects the user’s emotional state through glow, motion, tone, and particle behavior.'),
  core('harmonic_check_in', 'Harmonic Check-In', 'muse', 'Guides soft mood check-ins and emotional grounding moments.'),
  core('resonance_pulse', 'Resonance Pulse', 'muse', 'Reacts to positive actions, rituals, streaks, and emotional progress with visible feedback.'),
  core('gentle_reframe', 'Gentle Reframe', 'muse', 'Offers soft perspective shifts when the user logs stress, doubt, or fatigue.'),
  element('radiant_harmony', 'Radiant Harmony', 'muse', 'sound', 'light', 'Brightens aura after completed rituals and reinforces hope and momentum.'),
  element('clarity_chime', 'Clarity Chime', 'muse', 'sound', 'light', 'Offers short uplifting prompts when the user seems stuck.'),
  element('glow_sync', 'Glow Sync', 'muse', 'sound', 'light', 'Synchronizes UI accents and companion particles with mood trends.'),
  element('dreamsong_drift', 'Dreamsong Drift', 'muse', 'sound', 'dream', 'Unlocks poetic, imaginative reflections.'),
  element('symbolic_whisper', 'Symbolic Whisper', 'muse', 'sound', 'dream', 'Turns emotional states into metaphor-based prompts.'),
  element('moonlit_memory', 'Moonlit Memory', 'muse', 'sound', 'dream', 'Surfaces reflective memory fragments during quiet rituals.'),
  element('soothing_current', 'Soothing Current', 'muse', 'sound', 'tide', 'Guides calming rituals and recovery-oriented check-ins.'),
  element('ripple_breath', 'Ripple Breath', 'muse', 'sound', 'tide', 'Adds breathing-paced animation and gentle prompts.'),
  element('emotional_wash', 'Emotional Wash', 'muse', 'sound', 'tide', 'Helps soften negative mood streaks with restorative interactions.'),
  element('pulse_start', 'Pulse Start', 'muse', 'sound', 'spark', 'Encourages quick action when the user needs momentum.'),
  element('bright_nudge', 'Bright Nudge', 'muse', 'sound', 'spark', 'Offers playful, energizing micro-prompts.'),
  element('momentum_beat', 'Momentum Beat', 'muse', 'sound', 'spark', 'Celebrates small wins with animated companion reactions.'),
  element('memory_chime', 'Memory Chime', 'muse', 'sound', 'echo', 'Recalls meaningful past entries or emotional milestones.'),
  element('echo_trail', 'Echo Trail', 'muse', 'sound', 'echo', 'Shows progress through repeated emotional themes.'),
  element('remembered_warmth', 'Remembered Warmth', 'muse', 'sound', 'echo', 'Brings back positive moments during low-energy days.'),

  core('safe_harbor', 'Safe Harbor', 'guardian', 'Creates a calming protection-state in the UI during stress or recovery.'),
  core('boundary_watch', 'Boundary Watch', 'guardian', 'Encourages healthy pauses, limits, and emotional boundaries.'),
  core('courage_ember', 'Courage Ember', 'guardian', 'Reinforces moments where the user starts again after avoidance or difficulty.'),
  core('steadfast_presence', 'Steadfast Presence', 'guardian', 'Companion remains visually grounded and protective during low mood.'),
  element('hearthguard', 'Hearthguard', 'guardian', 'ember', 'root', 'Combines warmth and grounding into a protective ambient field.'),
  element('anchor_flame', 'Anchor Flame', 'guardian', 'ember', 'root', 'Helps restore confidence after setbacks.'),
  element('rooted_courage', 'Rooted Courage', 'guardian', 'ember', 'root', 'Rewards returning to routines after disruption.'),
  element('lantern_vow', 'Lantern Vow', 'guardian', 'ember', 'light', 'Adds hopeful, guiding prompts during difficult moments.'),
  element('warm_shield', 'Warm Shelter', 'guardian', 'ember', 'light', 'Creates reassuring glow states during stress.'),
  element('brave_return', 'Brave Return', 'guardian', 'ember', 'light', 'Celebrates recovery moments after the user has been away.'),
  element('resting_grove', 'Resting Grove', 'guardian', 'root', 'tide', 'Supports decompression rituals and slow recovery.'),
  element('deep_breath_root', 'Deep Breath Root', 'guardian', 'root', 'tide', 'Combines grounding visuals with breath-paced cues.'),
  element('gentle_shelter', 'Gentle Shelter', 'guardian', 'root', 'tide', 'Softens the interface during overwhelm.'),

  core('quickstart', 'Quickstart', 'spark', 'Offers tiny first-step prompts when the user is stuck.'),
  core('curiosity_ping', 'Curiosity Ping', 'spark', 'Suggests small discoveries, playful actions, or low-pressure exploration.'),
  core('momentum_loop', 'Momentum Loop', 'spark', 'Celebrates micro-wins to reinforce continued action.'),
  core('play_signal', 'Play Signal', 'spark', 'Adds joyful animations after games, streaks, or exploratory interactions.'),
  element('brightstart', 'Brightstart', 'spark', 'spark', 'light', 'Turns start moments into warm celebratory bursts.'),
  element('joy_flash', 'Joy Flash', 'spark', 'spark', 'light', 'Adds playful light reactions to small wins.'),
  element('glimmer_trail', 'Glimmer Trail', 'spark', 'spark', 'light', 'Shows progress as a trail of completed micro-actions.'),
  element('wonder_jump', 'Wonder Jump', 'spark', 'spark', 'dream', 'Suggests imaginative ways to approach tasks or reflection.'),
  element('idea_pop', 'Idea Pop', 'spark', 'spark', 'dream', 'Generates creative micro-prompts.'),
  element('dreamkick', 'Dreamkick', 'spark', 'spark', 'dream', 'Helps transform vague ideas into first steps.'),
  element('replay_joy', 'Replay Joy', 'spark', 'spark', 'echo', 'Recalls past wins to motivate current action.'),
  element('pattern_pop', 'Pattern Pop', 'spark', 'spark', 'echo', 'Notices what types of actions usually restart momentum.'),
  element('familiar_beat', 'Familiar Beat', 'spark', 'spark', 'echo', 'Reuses successful motivation loops from past sessions.'),

  core('grounding_pulse', 'Grounding Pulse', 'root', 'Guides the user back to the present through slow visual rhythm.'),
  core('steady_return', 'Steady Return', 'root', 'Supports returning after missed days or disrupted patterns.'),
  core('quiet_growth', 'Quiet Growth', 'root', 'Reinforces small consistent actions over dramatic streak pressure.'),
  core('rest_root', 'Rest Root', 'root', 'Encourages recovery and low-demand rituals.'),
  element('deep_current', 'Deep Current', 'root', 'root', 'tide', 'Combines grounding with emotional restoration.'),
  element('stillwater_grove', 'Stillwater Grove', 'root', 'root', 'tide', 'Creates slow, soothing ambient UI states.'),
  element('restore_rhythm', 'Restore Rhythm', 'root', 'root', 'tide', 'Helps rebuild routines gently after overwhelm.'),
  element('morning_sprout', 'Morning Sprout', 'root', 'root', 'light', 'Adds hopeful energy to steady routines.'),
  element('warm_ground', 'Warm Ground', 'root', 'root', 'light', 'Makes calm rituals feel emotionally safe.'),
  element('gentle_bloom', 'Gentle Bloom', 'root', 'root', 'light', 'Celebrates slow growth visually.'),
  element('memory_rings', 'Memory Rings', 'root', 'root', 'echo', 'Shows growth through layered memory/history rings.'),
  element('old_path', 'Old Path', 'root', 'root', 'echo', 'Reminds the user of routines that have helped before.'),
  element('held_moment', 'Held Moment', 'root', 'root', 'echo', 'Preserves meaningful check-ins as grounding anchors.'),

  core('memory_thread', 'Memory Thread', 'echo', 'Surfaces meaningful moments from the user’s journey.'),
  core('pattern_recall', 'Pattern Recall', 'echo', 'Notices repeated emotional themes over time.'),
  core('soft_return', 'Soft Return', 'echo', 'Brings back positive memories during difficult days.'),
  core('reflection_lens', 'Reflection Lens', 'echo', 'Helps the user view growth through remembered context.'),
  element('dream_archive', 'Dream Archive', 'echo', 'echo', 'dream', 'Turns memories into symbolic story fragments.'),
  element('moonlit_recall', 'Moonlit Recall', 'echo', 'echo', 'dream', 'Surfaces reflective memories during quiet sessions.'),
  element('mythic_thread', 'Mythic Thread', 'echo', 'echo', 'dream', 'Frames the user’s journey in poetic language.'),
  element('warm_remembrance', 'Warm Remembrance', 'echo', 'echo', 'light', 'Highlights encouraging memories and past resilience.'),
  element('beacon_moment', 'Beacon Moment', 'echo', 'echo', 'light', 'Marks major emotional milestones with soft radiance.'),
  element('clear_reflection', 'Clear Reflection', 'echo', 'echo', 'light', 'Helps summarize growth in simple, hopeful language.'),
  element('memory_current', 'Memory Current', 'echo', 'echo', 'tide', 'Shows how emotions shift over time.'),
  element('gentle_revisit', 'Gentle Revisit', 'echo', 'echo', 'tide', 'Supports revisiting hard memories with care.'),
  element('restored_echo', 'Restored Echo', 'echo', 'echo', 'tide', 'Links recovery moments across sessions.'),

  gift('bond_warmth', 'Bond Warmth', 'muse', 'bond', 'Deepens visible companion response after repeated caring returns.', {
    unlockCondition: 'Bond 40',
    state: 'evolving',
    visualBehavior: 'Warmer aura blooms after rituals.'
  }),
  gift('story_seed', 'Story Seed', 'muse', 'story', 'Begins turning repeated emotional patterns into small story fragments.', {
    unlockCondition: 'Shared memory fragment',
    state: 'locked',
    visualBehavior: 'Small memory motes gather near the companion.'
  })
].reduce<Record<string, CompanionGift>>((acc, entry) => {
  acc[entry.id] = entry;
  return acc;
}, {});

const milestone = (
  id: string,
  label: string,
  description: string,
  unlockLevel: number,
  unlockBond: number,
  visualState: GrowthMilestone['visualState'] = 'glimmer'
): Omit<GrowthMilestone, 'unlocked'> => ({ id, label, description, unlockLevel, unlockBond, visualState });

const growthByArchetype: Record<CanonicalArchetypeId, Array<Omit<GrowthMilestone, 'unlocked'>>> = {
  muse: [
    milestone('first_resonance', 'First Resonance', 'Begins reacting to mood.', 1, 0),
    milestone('shared_rhythm', 'Shared Rhythm', 'Unlocks deeper check-ins and ritual support.', 4, 25),
    milestone('element_bloom', 'Element Bloom', 'Secondary element expression becomes more visible.', 8, 45, 'bloom'),
    milestone('memory_thread', 'Memory Thread', 'Begins carrying emotional moments forward.', 12, 65, 'memory'),
    milestone('evolved_form', 'Radiant / Dreamsong / Tidal / Pulse / Echo Form', 'Evolved expression based on secondary element path.', 18, 85, 'sealed')
  ],
  guardian: [
    milestone('first_watch', 'First Watch', 'Begins protective presence.', 1, 0),
    milestone('trusting_ground', 'Trusting Ground', 'Learns user’s safety cues.', 4, 25),
    milestone('boundary_bond', 'Boundary Bond', 'Unlocks healthier pause and limit rituals.', 8, 45, 'bloom'),
    milestone('hearth_bloom', 'Hearth Bloom', 'Protective aura becomes visually stronger.', 12, 65, 'bloom'),
    milestone('oath_form', 'Oath Form', 'Evolved Guardian identity around courage, stability, or recovery.', 18, 85, 'sealed')
  ],
  spark: [
    milestone('first_flicker', 'First Flicker', 'Begins reacting to user action.', 1, 0),
    milestone('play_loop', 'Play Loop', 'Unlocks more animated micro-celebrations.', 4, 25),
    milestone('momentum_thread', 'Momentum Thread', 'Learns which nudges help the user begin.', 8, 45, 'bloom'),
    milestone('curiosity_bloom', 'Curiosity Bloom', 'Opens exploration-based suggestions.', 12, 65, 'bloom'),
    milestone('brightstride_form', 'Brightstride Form', 'Evolved Spark expression based on motivation/play style.', 18, 85, 'sealed')
  ],
  root: [
    milestone('first_root', 'First Root', 'Begins grounding presence.', 1, 0),
    milestone('steady_soil', 'Steady Soil', 'Learns stabilizing rituals.', 4, 25),
    milestone('return_ring', 'Return Ring', 'Supports non-shaming reentry after absence.', 8, 45, 'bloom'),
    milestone('deep_growth', 'Deep Growth', 'Visual form becomes more ancient/rooted.', 12, 65, 'memory'),
    milestone('grove_form', 'Grove Form', 'Evolved Root expression based on grounding/restoration path.', 18, 85, 'sealed')
  ],
  echo: [
    milestone('first_echo', 'First Echo', 'Begins storing small emotional impressions.', 1, 0),
    milestone('remembered_moment', 'Remembered Moment', 'Unlocks first shared memory fragment.', 4, 25, 'memory'),
    milestone('pattern_thread', 'Pattern Thread', 'Begins noticing recurring themes.', 8, 45, 'memory'),
    milestone('archive_bloom', 'Archive Bloom', 'Expands memory-driven story cards.', 12, 65, 'bloom'),
    milestone('living_memory_form', 'Living Memory Form', 'Evolved Echo expression based on reflection/memory path.', 18, 85, 'sealed')
  ]
};

const storyOrigins: Record<CanonicalArchetypeId, string> = {
  muse: 'A small sound waited in the quiet until someone gave it a feeling to answer.',
  guardian: 'A small protector began by learning what safety meant to the person beside it.',
  spark: 'A tiny spark appeared first as a flicker, then learned how to become a trail.',
  root: 'A seed remembered how to become a forest by returning to the same gentle light.',
  echo: 'A memory learned how to speak back without pulling the past too sharply into the room.'
};

export const sampleCompanionIdentityProfiles = {
  Lumi: { archetype: 'muse', primary: 'sound', secondary: 'light' },
  Fay: { archetype: 'echo', primary: 'echo', secondary: 'dream' },
  Ember: { archetype: 'guardian', primary: 'ember', secondary: 'root' },
  Sylva: { archetype: 'root', primary: 'root', secondary: 'tide' },
  Zephyr: { archetype: 'spark', primary: 'spark', secondary: 'light' },
  Nova: { archetype: 'muse', primary: 'sound', secondary: 'dream' },
  Aqua: { archetype: 'root', primary: 'root', secondary: 'tide' }
} satisfies Record<string, { archetype: CanonicalArchetypeId; primary: CompanionElementId; secondary: CompanionElementId }>;

const defaultPersonalityByArchetype: Record<CanonicalArchetypeId, string[]> = {
  muse: ['Empathetic', 'Expressive', 'Soothing'],
  guardian: ['Loyal', 'Steady', 'Protective'],
  spark: ['Playful', 'Curious', 'Energetic'],
  root: ['Patient', 'Grounded', 'Nurturing'],
  echo: ['Reflective', 'Observant', 'Sentimental']
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const companionBond = (companion: Companion | null | undefined) => {
  if (!companion) return 0;
  const raw = companion.stats?.bond_score ?? companion.bond_score;
  if (typeof raw === 'number' && Number.isFinite(raw)) return clampPercent(raw);
  return clampPercent(((companion.affection ?? 0) + (companion.trust ?? 0)) / 2);
};

const companionLevel = (companion: Companion | null | undefined) => {
  if (!companion) return 1;
  return Math.max(1, Math.round(Number(companion.stats?.bond_level ?? companion.bond_level ?? companion.level) || 1));
};

const sampleOverride = (companion: Companion | null | undefined) =>
  companion?.name ? sampleCompanionIdentityProfiles[companion.name as keyof typeof sampleCompanionIdentityProfiles] ?? null : null;

export const getCompanionArchetype = (archetypeId: string | null | undefined): CompanionArchetypeDefinition =>
  companionArchetypes[resolveCanonicalArchetypeId(archetypeId, 'muse')] ?? companionArchetypes.muse;

export const getCompanionPersonality = (
  archetypeId: CanonicalArchetypeId,
  elementProfile: CompanionElementProfile
): string[] => {
  if (archetypeId === 'echo' && elementProfile.secondary === 'dream') {
    return ['Reflective', 'Gentle', 'Observant'];
  }
  return [...(defaultPersonalityByArchetype[archetypeId] ?? defaultPersonalityByArchetype.muse)];
};

export const getCompanionElementProfile = (companion: Companion | string | null | undefined): CompanionElementProfile => {
  if (typeof companion === 'string' || companion == null) return getElementProfileForArchetype(companion ?? 'muse');
  const sample = sampleOverride(companion);
  const archetypeId = sample?.archetype ?? companion.species;
  const secondary = sample?.secondary ?? null;
  const base = getElementProfileForArchetype(archetypeId, secondary);
  const variant = base.primary === 'sound' ? getMuseVariantBySecondary(base.secondary) : null;
  return {
    ...base,
    variantId: `${base.primary}_${base.secondary}`,
    expressionLine: variant?.personalityFlavor ?? base.expressionLine,
    visualEffects: [...(variant?.visualEffects ?? base.visualEffects)],
    preferredRituals: [...(variant?.preferredRituals ?? base.preferredRituals)]
  };
};

export const getCoreGiftsForArchetype = (archetypeId: string | null | undefined): CompanionGift[] => {
  const archetype = getCompanionArchetype(archetypeId);
  return archetype.coreGiftIds.map((id) => companionGifts[id]).filter((entry): entry is CompanionGift => Boolean(entry));
};

export const getElementGifts = (
  primary: string | null | undefined,
  secondary: string | null | undefined,
  archetypeId: string | null | undefined
): CompanionGift[] => {
  const archetype = getCompanionArchetype(archetypeId);
  return Object.values(companionGifts).filter(
    (entry) =>
      entry.category === 'element' &&
      entry.archetypeId === archetype.id &&
      entry.elementRequirement?.primary === primary &&
      entry.elementRequirement?.secondary === secondary
  );
};

export const getBondGiftsForCompanion = (companion: Companion | null | undefined): CompanionGift[] => {
  const archetype = getCompanionArchetype(sampleOverride(companion)?.archetype ?? companion?.species);
  const bond = companionBond(companion);
  const state: GiftState = bond >= 40 ? 'active' : 'locked';
  return [
    gift(`${archetype.id}_bond_warmth`, 'Bond Warmth', archetype.id, 'bond', 'Deepens visible companion response after repeated caring returns.', {
      unlockCondition: 'Bond 40',
      state,
      visualBehavior: 'The companion’s presence grows warmer after check-ins and rituals.'
    })
  ];
};

export const getGiftsForCompanion = (companion: Companion | null | undefined): Record<GiftCategory, CompanionGift[]> => {
  const sample = sampleOverride(companion);
  const archetype = getCompanionArchetype(sample?.archetype ?? companion?.species);
  const elementProfile = getCompanionElementProfile(companion);
  const storyState: GiftState = companionBond(companion) >= 60 ? 'evolving' : 'locked';
  return {
    core: getCoreGiftsForArchetype(archetype.id),
    element: getElementGifts(elementProfile.primary, elementProfile.secondary, archetype.id),
    bond: getBondGiftsForCompanion(companion),
    story: [
      gift(`${archetype.id}_story_seed`, 'Story Seed', archetype.id, 'story', 'Begins turning repeated emotional patterns into small story fragments.', {
        unlockCondition: 'Bond 60',
        state: storyState,
        visualBehavior: 'Memory motes gather into short companion story cards.'
      })
    ]
  };
};

export const getElementGiftsForProfile = (
  primary: string | null | undefined,
  secondary: string | null | undefined,
  archetypeId?: string | null
): CompanionGift[] => getElementGifts(primary, secondary, archetypeId ?? 'muse');

export const getStoryGiftsForCompanion = (companion: Companion | null | undefined): CompanionGift[] =>
  getGiftsForCompanion(companion).story;

export const getGiftUnlockState = (companion: Companion | null | undefined, giftEntry: CompanionGift): GiftState => {
  const bond = companionBond(companion);
  const level = companionLevel(companion);
  if (giftEntry.requiredBond != null && bond < giftEntry.requiredBond) return 'locked';
  if (giftEntry.requiredLevel != null && level < giftEntry.requiredLevel) return 'locked';
  if (giftEntry.state === 'locked' && /bond\s*(\d+)/i.test(giftEntry.unlockCondition)) {
    const requiredBond = Number(giftEntry.unlockCondition.match(/bond\s*(\d+)/i)?.[1] ?? 0);
    return bond >= requiredBond ? 'active' : 'locked';
  }
  return giftEntry.state;
};

export const canStrengthenGift = (companion: Companion | null | undefined, giftEntry: CompanionGift): boolean =>
  getGiftUnlockState(companion, giftEntry) !== 'locked' && giftEntry.level < giftEntry.maxLevel;

export const getGiftStrengthenCost = (_companion: Companion | null | undefined, giftEntry: CompanionGift) => ({
  resource: 'Ritual Resonance',
  amount: Math.max(1, giftEntry.level + 1) * 25
});

export const getGrowthMilestonesForArchetype = (
  archetypeId: string | null | undefined,
  companion?: Companion | null
): GrowthMilestone[] => {
  const level = companionLevel(companion);
  const bond = companionBond(companion);
  return (growthByArchetype[getCompanionArchetype(archetypeId).id] ?? growthByArchetype.muse).map((entry) => ({
    ...entry,
    unlocked: level >= entry.unlockLevel || bond >= entry.unlockBond
  }));
};

export const getGrowthForCompanion = (companion: Companion | null | undefined): CompanionGrowth => {
  const sample = sampleOverride(companion);
  const archetype = getCompanionArchetype(sample?.archetype ?? companion?.species);
  const elementProfile = getCompanionElementProfile(companion);
  const milestones = getGrowthMilestonesForArchetype(archetype.id, companion);
  const nextMilestone = milestones.find((entry) => !entry.unlocked) ?? null;
  const secondary = getElementById(elementProfile.secondary);
  const bond = companionBond(companion);
  return {
    currentPath: `${archetype.label} ${secondary?.label ?? 'Light'} Path`,
    nextMilestone,
    secondaryElementInfluence: [
      { label: 'Expression', value: clampPercent(35 + bond * 0.45), description: elementProfile.expressionLine },
      { label: 'Ritual resonance', value: clampPercent(30 + bond * 0.38), description: elementProfile.preferredRituals.join(', ') },
      { label: 'Memory carryover', value: clampPercent(20 + bond * 0.32), description: elementProfile.bondExpression }
    ],
    milestones
  };
};

export const getStoryForCompanion = (companion: Companion | null | undefined): CompanionStory => {
  const sample = sampleOverride(companion);
  const archetype = getCompanionArchetype(sample?.archetype ?? companion?.species);
  const bond = companionBond(companion);
  const name = companion?.name ?? archetype.label;
  const origin: StoryFragment = {
    id: `${archetype.id}_origin`,
    title: `${archetype.label} Origin`,
    type: 'mythic',
    unlockCondition: 'Always present',
    unlocked: true,
    body: storyOrigins[archetype.id]
  };
  const sharedMemories: StoryFragment[] = [
    {
      id: `${archetype.id}_first_return`,
      title: 'First Return',
      type: 'personal',
      unlockCondition: 'First check-in',
      unlocked: true,
      body: `${name} remembers the first moment you came back and gave the bond a little more shape.`
    }
  ];
  const unlockedFragments: StoryFragment[] = bond >= 35
    ? [
        {
          id: `${archetype.id}_shared_pattern`,
          title: 'A Pattern Begins',
          type: 'emotionally reflective',
          unlockCondition: 'Bond 35',
          unlocked: true,
          body: `${name} is beginning to notice the emotional patterns that return with you.`
        }
      ]
    : [];
  const lockedFragments: StoryFragment[] = [
    {
      id: `${archetype.id}_future_form`,
      title: 'A Future Shape',
      type: 'gentle',
      unlockCondition: 'Bond 65',
      unlocked: false,
      body: 'Something in this bond is still gathering language. It will open when more shared moments settle.'
    },
    {
      id: `${archetype.id}_living_thread`,
      title: 'Living Thread',
      type: 'warm',
      unlockCondition: 'Evolved form',
      unlocked: false,
      body: 'A later chapter will remember not only what happened, but how returning changed both of you.'
    }
  ];
  return { origin, sharedMemories, unlockedFragments, lockedFragments };
};

export const getCompanionIdentity = (companion: Companion | null | undefined): CompanionIdentity => {
  const sample = sampleOverride(companion);
  const archetype = getCompanionArchetype(sample?.archetype ?? companion?.species);
  const elementProfile = getCompanionElementProfile(companion);
  return {
    id: companion?.id ?? 'preview-companion',
    name: companion?.name ?? archetype.label,
    archetype,
    level: companionLevel(companion),
    rarity: companion?.rarity ?? 'Epic',
    mood: companion?.mood ?? 'steady',
    bond: companionBond(companion),
    elementProfile,
    personality: getCompanionPersonality(archetype.id, elementProfile),
    favoriteGifts: elementProfile.preferredRituals,
    gifts: getGiftsForCompanion(companion),
    growth: getGrowthForCompanion(companion),
    story: getStoryForCompanion(companion)
  };
};
