import { expect, test } from '@playwright/test';
import { runSeed, type SeedResult } from '../fixtures/env';
import { createAuthedRequest } from '../fixtures/auth';

test.describe.serial('Reactions API', () => {
  let seedData: SeedResult;

  test.beforeAll(async () => {
    seedData = await runSeed();
  });

  test('toggle post like on/off', async () => {
    const apiContext = await createAuthedRequest(seedData.viewer);

    const likeAdd = await apiContext.post('/api/reactions/post', {
      data: { post_id: seedData.postId, kind: 'like' }
    });
    const likeAddText = await likeAdd.text();
    console.log('like add response', likeAdd.status(), likeAddText);
    expect(likeAdd.status(), 'like add status').toBe(200);
    const likeAddBody = JSON.parse(likeAddText);
    expect(likeAddBody.toggledOn).toBe(true);
    expect(likeAddBody.counts.like).toBe(1);

    const likeRemove = await apiContext.post('/api/reactions/post', {
      data: { post_id: seedData.postId, kind: 'like' }
    });
    expect(likeRemove.status(), 'like remove status').toBe(200);
    const likeRemoveBody = await likeRemove.json();
    expect(likeRemoveBody.toggledOn).toBe(false);
    expect(likeRemoveBody.counts.like).toBe(0);

    await apiContext.dispose();
  });

  test('adding cheer does not affect like counts', async () => {
    const apiContext = await createAuthedRequest(seedData.viewer);

    const cheerAdd = await apiContext.post('/api/reactions/post', {
      data: { post_id: seedData.postId, kind: 'cheer' }
    });
    expect(cheerAdd.status(), 'cheer status').toBe(200);
    const cheerBody = await cheerAdd.json();
    expect(cheerBody.counts.cheer).toBe(1);
    expect(cheerBody.counts.like).toBe(0);

    const cheerRemove = await apiContext.post('/api/reactions/post', {
      data: { post_id: seedData.postId, kind: 'cheer' }
    });
    expect(cheerRemove.status(), 'cheer remove status').toBe(200);
    const cheerRemoveBody = await cheerRemove.json();
    expect(cheerRemoveBody.counts.cheer).toBe(0);

    await apiContext.dispose();
  });

  test('comment reactions toggle successfully', async () => {
    const apiContext = await createAuthedRequest(seedData.viewer);

    const add = await apiContext.post('/api/reactions/comment', {
      data: { comment_id: seedData.commentId, kind: 'spark' }
    });
    expect(add.status(), 'comment add status').toBe(200);
    const addBody = await add.json();
    expect(addBody.counts.spark).toBe(1);

    const remove = await apiContext.post('/api/reactions/comment', {
      data: { comment_id: seedData.commentId, kind: 'spark' }
    });
    expect(remove.status(), 'comment remove status').toBe(200);
    const removeBody = await remove.json();
    expect(removeBody.counts.spark).toBe(0);

    await apiContext.dispose();
  });

  test('unauthenticated requests are rejected', async ({ request }) => {
    const res = await request.post('/api/reactions/post', {
      data: { post_id: seedData.postId, kind: 'like' }
    });
    expect(res.status(), 'unauthenticated status').toBe(401);
  });

  test('invalid reaction kinds return 400', async () => {
    const apiContext = await createAuthedRequest(seedData.viewer);
    const res = await apiContext.post('/api/reactions/post', {
      data: { post_id: seedData.postId, kind: 'clap' }
    });
    expect(res.status(), 'bad kind status').toBe(400);
    await apiContext.dispose();
  });
});
