export type CompanionDefinition = {
  key: string;
  name: string;
  description: string;
  color: string;
  seed: string;
  renderHook: string;
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
