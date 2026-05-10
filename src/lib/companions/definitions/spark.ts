import type { CompanionDefinition } from './types';
import { companionElementProfiles } from '$lib/companions/elements';

export const SPARK_DEFINITION: CompanionDefinition = {
  key: 'spark',
  name: 'Spark',
  description: 'Fast and playful, Spark brings quick bursts of curiosity and celebratory energy.',
  color: '#ffd77f',
  seed: 'aurex',
  renderHook: 'muse_core',
  elementProfile: companionElementProfiles.spark,
  lockedByDefault: true
};
