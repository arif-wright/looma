import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserServer } from '$lib/server/auth';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const BUCKET = 'avatars';

const toBuffer = async (file: File) => Buffer.from(await file.arrayBuffer());

export const POST: RequestHandler = async (event) => {
  const { supabase, user } = await requireUserServer(event);
  const formData = await event.request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return json({ error: 'File is required' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return json({ error: 'Unsupported file type' }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return json({ error: 'File too large (max 2MB)' }, { status: 400 });
  }

  const path = `${user.id}/avatar_${Date.now()}.webp`;
  const buffer = await toBuffer(file);

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    upsert: true,
    contentType: file.type
  });

  if (uploadError) {
    console.error('[avatar upload] storage error', uploadError);
    return json({ error: 'Upload failed' }, { status: 500 });
  }

  const {
    data: { publicUrl }
  } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', user.id);

  if (profileError) {
    console.error('[avatar upload] profile update failed', profileError);
    return json({ error: 'Failed to update profile' }, { status: 500 });
  }

  return json({ url: publicUrl });
};
