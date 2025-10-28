type Meta = Record<string, unknown> | undefined;

export function reportHomeLoadIssue(tag: string, meta?: Meta) {
  const payload = {
    tag,
    meta: sanitize(meta)
  };
  if (typeof console !== 'undefined' && console.error) {
    console.error('[home.load]', payload);
  }
}

const sanitize = (meta?: Meta) => {
  if (!meta || typeof meta !== 'object') return meta ?? null;
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      clone[key] = value;
    } else if (value instanceof Error) {
      clone[key] = { message: value.message };
    } else {
      clone[key] = String(value);
    }
  }
  return clone;
};
