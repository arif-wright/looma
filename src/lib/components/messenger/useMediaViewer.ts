export type MediaViewerItem = {
  messageId: string;
  attachmentId: string;
  kind: 'image' | 'gif';
  url: string;
  width?: number | null;
  height?: number | null;
  mimeType?: string | null;
  bytes?: number | null;
  createdAt?: string | null;
  senderId?: string | null;
  senderHandle?: string | null;
};

export const clampIndex = (index: number, length: number) => {
  if (length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(length - 1, Math.floor(index)));
};

export const nextIndex = (index: number, length: number) => clampIndex(index + 1, length);

export const prevIndex = (index: number, length: number) => clampIndex(index - 1, length);

export const formatBytes = (value: number | null | undefined): string | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
};

export const itemLabel = (item: MediaViewerItem): string => {
  const typeLabel = item.kind === 'gif' ? 'GIF' : 'Image';
  const sender = item.senderHandle ? ` by ${item.senderHandle}` : '';
  return `${typeLabel}${sender}`;
};
