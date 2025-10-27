import { expect, test } from '@playwright/test';
import {
  commentHash,
  commentPermalinkFromId,
  commentPermalinkFromSlug,
  threadPermalinkById,
  threadPermalinkBySlug
} from '../src/lib/threads/permalink';

test.describe('permalink helpers', () => {
  test('thread permalink by id', () => {
    expect(threadPermalinkById('123')).toBe('/app/thread/123');
  });

  test('thread permalink by slug', () => {
    expect(threadPermalinkBySlug('my-thread')).toBe('/app/t/my-thread');
  });

  test('comment hash helper', () => {
    expect(commentHash('c1')).toBe('#c-c1');
  });

  test('comment permalink by id', () => {
    expect(commentPermalinkFromId('abc', 'def')).toBe('/app/thread/abc#c-def');
  });

  test('comment permalink by slug', () => {
    expect(commentPermalinkFromSlug('hello', 'xyz')).toBe('/app/t/hello#c-xyz');
  });
});
