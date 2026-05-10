import type { CompanionElementProfile } from '$lib/companions/elements';

export type CompanionDefinition = {
  key: string;
  name: string;
  description: string;
  color: string;
  seed: string;
  renderHook: string;
  elementProfile: CompanionElementProfile;
  lockedByDefault?: boolean;
};

export type CompanionDefinitionCatalogEntry = {
  key: string;
  name: string;
  description: string;
  color: string;
  seed: string;
  renderHook: string;
  locked: boolean;
};
