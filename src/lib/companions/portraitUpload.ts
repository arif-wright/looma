const UPLOAD_KEY_PREFIX = 'looma:companionPortraitUploaded:';

const fnv1a = (input: string) => {
  // Fast non-crypto hash so we can skip re-uploading identical data URLs.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const keyFor = (companionId: string) => `${UPLOAD_KEY_PREFIX}${companionId}`;

export const dataUrlToFile = async (dataUrl: string, filename: string) => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const type = blob.type || 'image/png';
  return new File([blob], filename, { type });
};

export const shouldUploadPortrait = (companionId: string, dataUrl: string) => {
  if (typeof window === 'undefined') return false;
  try {
    const hash = fnv1a(dataUrl);
    const prev = window.localStorage.getItem(keyFor(companionId));
    return prev !== hash;
  } catch {
    return true;
  }
};

export const markPortraitUploaded = (companionId: string, dataUrl: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(keyFor(companionId), fnv1a(dataUrl));
  } catch {
    // Ignore.
  }
};

export const uploadCompanionPortrait = async (input: { companionId: string; dataUrl: string }) => {
  const { companionId, dataUrl } = input;
  if (!companionId) throw new Error('companion_id_required');
  if (!dataUrl?.startsWith('data:image/')) throw new Error('portrait_data_url_required');

  const file = await dataUrlToFile(dataUrl, `portrait_${Date.now()}.png`);
  const form = new FormData();
  form.set('companionId', companionId);
  form.set('file', file);

  const res = await fetch('/api/companions/portrait', { method: 'POST', body: form });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(payload?.error ?? 'portrait_upload_failed');
  }
  const url = payload?.url;
  if (typeof url !== 'string' || !url) throw new Error('portrait_upload_missing_url');
  return { url };
};

