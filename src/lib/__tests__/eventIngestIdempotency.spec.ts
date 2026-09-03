import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { claimEventIngestReceipt } from '$lib/server/events/idempotency';

const clientReturning = (error: unknown) => {
  const insert = vi.fn().mockResolvedValue({ error });
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as any, from, insert };
};

describe('event ingest receipt idempotency', () => {
  it('inserts the receipt with the supplied protected client', async () => {
    const admin = clientReturning(null);

    await expect(
      claimEventIngestReceipt({
        supabase: admin.client,
        userId: 'user-1',
        type: 'preference.toggle',
        idempotencyKey: 'receipt-1'
      })
    ).resolves.toEqual({ duplicate: false });

    expect(admin.from).toHaveBeenCalledWith('event_ingest_receipts');
    expect(admin.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      event_type: 'preference.toggle',
      idempotency_key: 'receipt-1'
    });
  });

  it('treats PostgreSQL 23505 as a successful duplicate claim', async () => {
    const admin = clientReturning({ code: '23505', message: 'duplicate' });

    await expect(
      claimEventIngestReceipt({
        supabase: admin.client,
        userId: 'user-1',
        type: 'preference.toggle',
        idempotencyKey: 'receipt-1'
      })
    ).resolves.toEqual({ duplicate: true });
  });

  it('propagates nonduplicate database errors', async () => {
    const failure = { code: '42501', message: 'permission denied' };
    const admin = clientReturning(failure);

    await expect(
      claimEventIngestReceipt({
        supabase: admin.client,
        userId: 'user-1',
        type: 'preference.toggle',
        idempotencyKey: 'receipt-1'
      })
    ).rejects.toBe(failure);
  });

  it('keeps direct authenticated access denied in the migration', () => {
    const migration = readFileSync('supabase/migrations/20260302_event_ingest_receipts.sql', 'utf8');

    expect(migration).toContain('to authenticated');
    expect(migration).toContain('using (false)');
    expect(migration).toContain('with check (false)');
    expect(migration).toContain('revoke all on table public.event_ingest_receipts from public, authenticated');
  });
});
