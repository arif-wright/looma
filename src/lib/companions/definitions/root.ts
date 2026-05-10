import type { CompanionDefinition } from './types';
import { companionElementProfiles } from '$lib/companions/elements';

export const ROOT_DEFINITION: CompanionDefinition = {
  key: 'root',
  name: 'Root',
  description: 'Patient and grounded, Root favors steady growth, ritual, and calm returns.',
  color: '#7effc9',
  seed: 'kynth',
  renderHook: 'muse_core',
  elementProfile: companionElementProfiles.root,
  lockedByDefault: true
};
