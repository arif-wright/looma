export async function fetchImageOptions(fetcher: typeof fetch = fetch): Promise<string[]> {
  const res = await fetcher('images');
  if (!res.ok) {
    throw new Error('Failed to load images');
  }
  const out = await res.json().catch(() => ({}));
  if (!out?.ok || !Array.isArray(out.images)) {
    throw new Error(out?.error || 'Invalid response');
  }
  return out.images;
}
