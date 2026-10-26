import { expect, test } from 'bun:test';
import { normalizeHit } from '../src/lib/server/collection';

test('collection removes queries, fragments and referrer paths', () => {
  expect(
    normalizeHit(
      {
        kind: 'pageview',
        path: '/notes?secret=123#private',
        title: 'Notes',
        referrer: 'https://search.example/private?q=secret',
      },
      'https://blog.example',
    ),
  ).toEqual({
    kind: 'pageview',
    path: '/notes',
    title: 'Notes',
    referrer: 'search.example',
    event: '',
  });
});
test('collection distinguishes internal/direct traffic and validates event names', () => {
  expect(
    normalizeHit(
      { kind: 'pageview', path: '/', referrer: 'https://blog.example/page' },
      'https://blog.example',
    )?.referrer,
  ).toBe('');
  expect(
    normalizeHit({ kind: 'event', path: '/', event: 'download.pdf' }, 'https://blog.example')
      ?.event,
  ).toBe('download.pdf');
  for (const event of ['', 'email@example.com', '<script>', 'a'.repeat(101)]) {
    expect(normalizeHit({ kind: 'event', path: '/', event }, 'https://blog.example')).toBeNull();
  }
});
test('collection rejects malformed kinds, paths and oversized paths', () => {
  for (const value of [
    null,
    [],
    {},
    { kind: 'unknown', path: '/' },
    { kind: 'pageview', path: '//evil.test' },
    { kind: 'pageview', path: 'https://evil.test' },
    { kind: 'pageview', path: '/' + 'a'.repeat(2048) },
  ]) {
    expect(normalizeHit(value, 'https://blog.example')).toBeNull();
  }
});
