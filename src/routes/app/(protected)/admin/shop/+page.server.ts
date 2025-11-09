import type { Actions, PageServerLoad } from './$types';
import { json } from '@sveltejs/kit';
import { serviceClient } from '$lib/server/admin';
import { getAdminFlags } from '$lib/server/admin-guard';

const hasAdminAccess = async (locals: App.Locals) => {
  const email = locals.session?.user?.email ?? locals.user?.email ?? null;
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;
  const flags = await getAdminFlags(email, userId);
  return flags.isAdmin;
};

export const load: PageServerLoad = async ({ locals }) => {
  const isAdmin = await hasAdminAccess(locals);
  if (!isAdmin) {
    return { forbidden: true, items: [], imageOptions: [] };
  }

  const client = serviceClient();
  const { data: items, error } = await client
    .from('shop_items')
    .select('*')
    .order('sort', { ascending: true });

  if (error) {
    console.error('[admin:shop] failed to load items', error);
    return { forbidden: false, items: [], imageOptions: [], loadError: error.message };
  }

  return { forbidden: false, items: items ?? [], imageOptions: [], loadError: null };
};

const toBoolean = (value: FormDataEntryValue | null): boolean => {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    return normalized === 'true' || normalized === 'on' || normalized === '1';
  }
  return false;
};

const toNumber = (value: FormDataEntryValue | null, fallback = 0): number => {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toTags = (value: FormDataEntryValue | null): string[] => {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export const actions: Actions = {
  upsert: async ({ request, locals }) => {
    const isAdmin = await hasAdminAccess(locals);
    if (!isAdmin) {
      return json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();
    const slug = String(form.get('slug') ?? '').trim();
    const title = String(form.get('title') ?? '').trim();
    const subtitleRaw = form.get('subtitle');
    const descriptionRaw = form.get('description');
    const type = String(form.get('type') ?? 'other').trim() || 'other';
    const rarity = String(form.get('rarity') ?? 'common').trim() || 'common';
    const priceShards = toNumber(form.get('price_shards'), 0);
    const sort = toNumber(form.get('sort'), 100);
    const imageUrl = String(form.get('image_url') ?? '').trim();
    const tags = toTags(form.get('tags'));
    const active = toBoolean(form.get('active'));
    const stackable = toBoolean(form.get('stackable'));

    if (!slug || !title || !imageUrl) {
      return json({ ok: false, error: 'Slug, title, and image URL are required' }, { status: 400 });
    }

    const payload: Record<string, unknown> = {
      slug,
      title,
      subtitle: subtitleRaw ? String(subtitleRaw).trim() || null : null,
      description: descriptionRaw ? String(descriptionRaw).trim() || null : null,
      type,
      rarity,
      price_shards: priceShards,
      image_url: imageUrl,
      tags,
      sort,
      active,
      stackable
    };

    if (id) {
      payload.id = id;
    }

    const client = serviceClient();
    const { data, error } = await client
      .from('shop_items')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) {
      console.error('[admin:shop] upsert failed', error);
      return json({ ok: false, error: error.message }, { status: 400 });
    }

    return json({ ok: true, item: data });
  },

  delete: async ({ request, locals }) => {
    const isAdmin = await hasAdminAccess(locals);
    if (!isAdmin) {
      return json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const form = await request.formData();
    const id = String(form.get('id') ?? '').trim();

    if (!id) {
      return json({ ok: false, error: 'Missing id' }, { status: 400 });
    }

    const client = serviceClient();
    const { error } = await client.from('shop_items').delete().eq('id', id);

    if (error) {
      console.error('[admin:shop] delete failed', error);
      return json({ ok: false, error: error.message }, { status: 400 });
    }

    return json({ ok: true });
  },

  reorder: async ({ request, locals }) => {
    const isAdmin = await hasAdminAccess(locals);
    if (!isAdmin) {
      return json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    let payload: Array<{ id: string; sort: number }> = [];

    try {
      const body = await request.json();
      if (Array.isArray(body)) {
        payload = body
          .map((entry) => ({
            id: typeof entry.id === 'string' ? entry.id : '',
            sort: Number(entry.sort)
          }))
          .filter((entry) => entry.id && Number.isFinite(entry.sort));
      }
    } catch (err) {
      console.warn('[admin:shop] reorder payload parse failed', err);
      return json({ ok: false, error: 'Invalid payload' }, { status: 400 });
    }

    if (!payload.length) {
      return json({ ok: false, error: 'No items to reorder' }, { status: 400 });
    }

    const client = serviceClient();
    const { error } = await client.from('shop_items').upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error('[admin:shop] reorder failed', error);
      return json({ ok: false, error: error.message }, { status: 400 });
    }

    return json({ ok: true });
  }
};
