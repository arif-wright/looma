import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserServer } from '$lib/server/auth';
import { tryGetSupabaseAdminClient } from '$lib/server/supabase';

const ALLOWED_TYPES = new Set(['image/png', 'image/webp']);
const MAX_SIZE = 2 * 1024 * 1024; // 2MB
// Requires a Supabase Storage bucket named `companion-portraits`.
const BUCKET = 'companion-portraits';

const toBuffer = async (file: File) => Buffer.from(await file.arrayBuffer());

export const POST: RequestHandler = async (event) => {
  const { supabase, user } = await requireUserServer(event);
  const supabaseAdmin = tryGetSupabaseAdminClient();
  const formData = await event.request.formData();
  const file = formData.get('file');
  const companionIdRaw = formData.get('companionId');

  const companionId = typeof companionIdRaw === 'string' ? companionIdRaw.trim() : '';
  if (!companionId) {
    return json({ error: 'companion_id_required' }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return json({ error: 'file_required' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return json({ error: 'unsupported_file_type' }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return json({ error: 'file_too_large' }, { status: 400 });
  }

  const ext = file.type === 'image/webp' ? 'webp' : 'png';
  const path = `${user.id}/${companionId}/portrait_${Date.now()}.${ext}`;
  const buffer = await toBuffer(file);

  // Always enforce ownership via the user-scoped client (keeps auth boundaries sane even with service role).
  const { data: owned, error: ownedError } = await supabase
    .from('companions')
    .select('id')
    .eq('id', companionId)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (ownedError) {
    console.error('[companions/portrait] owner check failed', ownedError);
    return json({ error: 'owner_check_failed', details: ownedError.message }, { status: 500 });
  }

  if (!owned?.id) {
    return json({ error: 'not_found' }, { status: 404 });
  }

  // Prefer service role for storage + DB update to avoid Storage policy / RLS pitfalls.
  const writeClient = supabaseAdmin ?? supabase;

  const { error: uploadError } = await writeClient.storage.from(BUCKET).upload(path, buffer, {
    upsert: true,
    contentType: file.type,
    cacheControl: '3600'
  });

  if (uploadError) {
    console.error('[companions/portrait] storage upload failed', uploadError);
    return json({ error: 'upload_failed', details: uploadError.message }, { status: 500 });
  }

  const {
    data: { publicUrl }
  } = writeClient.storage.from(BUCKET).getPublicUrl(path);

  const { error: updateError } = await writeClient
    .from('companions')
    .update({ avatar_url: publicUrl })
    .eq('id', companionId)
    .eq('owner_id', user.id);

  if (updateError) {
    console.error('[companions/portrait] db update failed', updateError);
    return json({ error: 'db_update_failed', details: updateError.message }, { status: 500 });
  }

  return json({ url: publicUrl });
};
