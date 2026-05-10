import type { CompanionDefinition } from './types';
import { companionElementProfiles } from '$lib/companions/elements';

export const MUSE_DEFINITION: CompanionDefinition = {
  key: 'muse',
  name: 'Muse',
  description: 'A harmonizing companion tuned for gentle momentum and balanced routines.',
  color: '#5ef2ff',
  seed: 'mirae',
  renderHook: 'muse_core',
  elementProfile: companionElementProfiles.muse
};
