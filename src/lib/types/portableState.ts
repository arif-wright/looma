export const PORTABLE_STATE_VERSION = '1.0' as const;

export type PortableStateVersion = typeof PORTABLE_STATE_VERSION;

export type PortableStateItem = {
  key: string;
  value: string | number | boolean | null;
  updatedAt: string;
  source?: string | null;
};

export type PortableState = {
  version: PortableStateVersion;
  updatedAt: string;
  items: PortableStateItem[];
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
    }
  },
  additionalProperties: false
} as const;
