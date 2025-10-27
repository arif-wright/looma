export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    // fall back to legacy approach below
    console.error('clipboard: navigator API failed', err);
  }

  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);

  let copied = false;
  try {
    textarea.select();
    copied = document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
  return copied;
}
