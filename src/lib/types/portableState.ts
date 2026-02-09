export const PORTABLE_STATE_VERSION = '1.0' as const;

export type PortableStateVersion = typeof PORTABLE_STATE_VERSION;

export type PortableStateItem = {
  key: string;
  value: string | number | boolean | null;
  updatedAt: string;
  source?: string | null;
};

export type PortableCompanionStats = {
  bond: number;
  level: number;
};

export type PortableCompanionEntry = {
  id: string;
  name: string;
  archetype: string;
  unlocked: boolean;
  cosmetics: Record<string, string | number | boolean | null>;
  cosmeticsUnlocked: string[];
  stats: PortableCompanionStats;
};

export type PortableCompanions = {
  activeId: string;
  roster: PortableCompanionEntry[];
};

export type PortableState = {
  version: PortableStateVersion;
  updatedAt: string;
  items: PortableStateItem[];
  companions?: PortableCompanions;
};

export const PORTABLE_STATE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://looma.app/schemas/portable-state.json',
  title: 'PortableState',
  type: 'object',
  required: ['version', 'updatedAt', 'items'],
  properties: {
    version: { type: 'string', const: PORTABLE_STATE_VERSION },
    updatedAt: { type: 'string', format: 'date-time' },
    items: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        required: ['key', 'value', 'updatedAt'],
        properties: {
          key: { type: 'string', maxLength: 80 },
          value: { type: ['string', 'number', 'boolean', 'null'] },
          updatedAt: { type: 'string', format: 'date-time' },
          source: { type: ['string', 'null'], maxLength: 80 }
        },
        additionalProperties: false
      }
    },
    companions: {
      type: 'object',
      required: ['activeId', 'roster'],
      properties: {
        activeId: { type: 'string', minLength: 1, maxLength: 80 },
        roster: {
          type: 'array',
          maxItems: 24,
          items: {
            type: 'object',
            required: ['id', 'name', 'archetype', 'unlocked', 'cosmetics', 'cosmeticsUnlocked', 'stats'],
            properties: {
              id: { type: 'string', minLength: 1, maxLength: 80 },
              name: { type: 'string', minLength: 1, maxLength: 80 },
              archetype: { type: 'string', minLength: 1, maxLength: 80 },
              unlocked: { type: 'boolean' },
              cosmetics: {
                type: 'object',
                additionalProperties: {
                  type: ['string', 'number', 'boolean', 'null']
                }
              },
              cosmeticsUnlocked: {
                type: 'array',
                maxItems: 64,
                items: {
                  type: 'string',
                  minLength: 1,
                  maxLength: 80
                }
              },
              stats: {
                type: 'object',
                required: ['bond', 'level'],
                properties: {
                  bond: { type: 'number' },
                  level: { type: 'number' }
                },
                additionalProperties: false
              }
            },
            additionalProperties: false
          }
        }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
} as const;
