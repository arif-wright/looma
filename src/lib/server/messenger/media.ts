import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import { tryGetSupabaseAdminClient } from '$lib/server/supabase';

export const MESSENGER_UPLOAD_BUCKET = 'messenger_uploads';
export const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

export type AttachmentKind = 'image' | 'gif' | 'file' | 'link';

export type MessageAttachmentInput = {
  kind?: AttachmentKind;
  storagePath?: string | null;
  url?: string | null;
  mimeType?: string | null;
  bytes?: number | null;
  width?: number | null;
  height?: number | null;
  altText?: string | null;
};

export type NormalizedAttachmentInput = {
  kind: AttachmentKind;
  storagePath: string | null;
  url: string | null;
  mimeType: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  altText: string | null;
};

export type MessageAttachmentRow = {
  id: string;
  message_id: string;
  kind: AttachmentKind;
  url: string;
  storage_path: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  alt_text: string | null;
  created_at: string;
};

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getUploadLimits = (trustTier: 'new' | 'standard' | 'trusted' | 'restricted') => {
  const imageCap = parsePositiveInt(env.MESSENGER_IMAGE_UPLOAD_MAX_BYTES, 8 * 1024 * 1024);
  const gifCap = parsePositiveInt(env.MESSENGER_GIF_UPLOAD_MAX_BYTES, 10 * 1024 * 1024);
  const maxAttachments = trustTier === 'restricted' ? 1 : 4;

  return {
    maxAttachments,
    imageCap: trustTier === 'restricted' ? Math.min(imageCap, 4 * 1024 * 1024) : imageCap,
    gifCap: trustTier === 'restricted' ? Math.min(gifCap, 5 * 1024 * 1024) : gifCap
  };
};

const normalizeFileName = (name: string) =>
  name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'file';

export const buildStoragePath = (
  userId: string,
  conversationId: string,
  messageId: string,
  fileName: string
) => `${userId}/${conversationId}/${messageId}/${normalizeFileName(fileName)}`;

export const isAllowedMimeType = (mimeType: string) => ALLOWED_UPLOAD_MIME_TYPES.has(mimeType);

export const guessAttachmentKindFromMime = (mimeType: string): 'image' | 'gif' =>
  mimeType === 'image/gif' ? 'gif' : 'image';

export const clampDim = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  if (n <= 0) return null;
  return Math.min(12000, n);
};

export const clampBytes = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  if (n <= 0) return null;
  return Math.min(100 * 1024 * 1024, n);
};

export const normalizeAttachmentInput = (raw: MessageAttachmentInput): NormalizedAttachmentInput | null => {
  const kind = raw.kind;
  if (kind !== 'image' && kind !== 'gif' && kind !== 'link' && kind !== 'file') return null;

  const storagePath = typeof raw.storagePath === 'string' && raw.storagePath.trim() ? raw.storagePath.trim() : null;
  const url = typeof raw.url === 'string' && raw.url.trim() ? raw.url.trim() : null;
  const mimeType = typeof raw.mimeType === 'string' && raw.mimeType.trim() ? raw.mimeType.trim().toLowerCase() : null;
  const bytes = clampBytes(raw.bytes ?? null);
  const width = clampDim(raw.width ?? null);
  const height = clampDim(raw.height ?? null);
  const altText = typeof raw.altText === 'string' && raw.altText.trim() ? raw.altText.trim().slice(0, 160) : null;

  if (!storagePath && !url) return null;

  return {
    kind,
    storagePath,
    url,
    mimeType,
    bytes,
    width,
    height,
    altText
  };
};

export const buildUploadViewUrl = async (storagePath: string): Promise<string | null> => {
  const admin = tryGetSupabaseAdminClient();
  if (!admin) return null;

  const { data, error } = await admin.storage
    .from(MESSENGER_UPLOAD_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
};

export const resolveAttachmentViewUrls = async (
  attachments: MessageAttachmentRow[]
): Promise<Array<MessageAttachmentRow & { view_url: string }>> => {
  if (!attachments.length) return [];

  const signed: Array<MessageAttachmentRow & { view_url: string }> = [];
  const admin = tryGetSupabaseAdminClient();

  for (const item of attachments) {
    if (item.storage_path && admin) {
      const { data } = await admin.storage
        .from(MESSENGER_UPLOAD_BUCKET)
        .createSignedUrl(item.storage_path, 60 * 60 * 24);
      signed.push({
        ...item,
        view_url: data?.signedUrl ?? item.url
      });
      continue;
    }

    signed.push({
      ...item,
      view_url: item.url
    });
  }

  return signed;
};

export const verifyAttachmentMembership = async (
  supabase: SupabaseClient,
  conversationId: string,
  storagePath: string,
  userId: string
): Promise<boolean> => {
  const prefix = `${userId}/${conversationId}/`;
  return storagePath.startsWith(prefix);
};
