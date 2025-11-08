const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];

const normalizeString = (value: string | null | undefined) => (value ?? '').trim();

export const normalizeUrl = (raw: string | null | undefined) => {
  let value = normalizeString(raw);
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  try {
    const url = new URL(value);
    UTM_KEYS.forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch {
    return '';
  }
};

export const safeLinks = (input: Array<{ label?: string; url?: string }> = []) => {
  const result: Array<{ label: string; url: string }> = [];
  input.slice(0, 3).forEach((item) => {
    const label = normalizeString(item?.label).slice(0, 40);
    const url = normalizeUrl(item?.url);
    if (!url || !/^https?:\/\//i.test(url)) return;
    result.push({ label: label || 'Link', url });
  });
  return result;
};
