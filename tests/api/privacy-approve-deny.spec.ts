import { test, expect } from '@playwright/test';

test('approve/deny follow requests (API smoke)', async ({ request }) => {
  // Replace placeholders with your test helpers when available
  const A = '<OWNER_USER_ID>';
  const B = '<VIEWER_USER_ID>';

  let res = await request.post('/api/privacy/follow-request', { data: { userId: A } });
  expect(res.status()).toBeLessThan(500);

  res = await request.post('/api/privacy/follow-approve', { data: { requesterId: B } });
  expect(res.status()).toBeLessThan(500);

  res = await request.get(`/api/privacy/follow-status?userId=${A}`);
  const json = await res.json();
  expect(json).toHaveProperty('isFollowing');

  await request.post('/api/privacy/follow-request', { data: { userId: A } });
  res = await request.post('/api/privacy/follow-deny', { data: { requesterId: B } });
  expect(res.status()).toBeLessThan(500);
});
