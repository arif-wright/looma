import type { CompanionDefinition } from './types';
import { companionElementProfiles } from '$lib/companions/elements';

export const GUARDIAN_DEFINITION: CompanionDefinition = {
  key: 'guardian',
  name: 'Guardian',
  description: 'Steady and protective, Guardian favors deliberate pacing and resilient focus.',
  color: '#8fd3ff',
  seed: 'tova',
  renderHook: 'muse_core',
  elementProfile: companionElementProfiles.guardian,
  lockedByDefault: true
};
