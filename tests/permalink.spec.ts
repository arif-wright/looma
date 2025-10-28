import { expect, test } from '@playwright/test';
import {
  canonicalCommentPath,
  canonicalPostPath,
  commentHash,
  legacyThreadById,
  legacyThreadBySlug
} from '../src/lib/threads/permalink';
import { appendSearch, canonicalRedirectTarget } from '../src/lib/threads/redirectHelpers';

test.describe('permalink helpers', () => {
  test('canonical post path prefers slug', () => {
    expect(canonicalPostPath('arif', 'my-thread', '123')).toBe('/app/u/arif/my-thread');
  });

  test('canonical post path falls back to id route when slug absent', () => {
    expect(canonicalPostPath('arif', null, '123')).toBe('/app/u/arif/p/123');
  });

  test('canonical post path falls back to legacy when handle missing', () => {
    expect(canonicalPostPath(null, 'slug', '123')).toBe('/app/thread/123');
  });

  test('comment hash helper', () => {
    expect(commentHash('c1')).toBe('#c-c1');
  });

  test('canonical comment path composes correctly', () => {
    expect(canonicalCommentPath('arif', 'slug', '123', '456')).toBe('/app/u/arif/slug#c-456');
  });

  test('legacy helpers remain accessible', () => {
    expect(legacyThreadById('123')).toBe('/app/thread/123');
    expect(legacyThreadBySlug('sluggy')).toBe('/app/t/sluggy');
  });

  test('redirect helper prefers slug when present', () => {
    const target = canonicalRedirectTarget({
      id: '123',
      slug: 'hello-world',
      author: { handle: 'arif' }
    });
    expect(target).toBe('/app/u/arif/hello-world');
  });

  test('redirect helper falls back to id when slug missing', () => {
    const target = canonicalRedirectTarget({
      id: '123',
      slug: null,
      author: { handle: 'arif' }
    });
    expect(target).toBe('/app/u/arif/p/123');
  });

  test('redirect helper encodes handle and slug', () => {
    const target = canonicalRedirectTarget({
      id: '123',
      slug: 'Hello World',
      author: { handle: 'A R I F' }
    });
    expect(target).toBe('/app/u/A%20R%20I%20F/Hello%20World');
  });

  test('redirect helper throws when handle missing', () => {
    expect(() =>
      canonicalRedirectTarget({
        id: '123',
        slug: 'slug',
        author: { handle: null }
      })
    ).toThrowError(/Missing author handle/);
  });

  test('appendSearch utility preserves search strings', () => {
    expect(appendSearch('/app/u/arif/slug', '')).toBe('/app/u/arif/slug');
    expect(appendSearch('/app/u/arif/slug', '?foo=bar')).toBe('/app/u/arif/slug?foo=bar');
  });
});
