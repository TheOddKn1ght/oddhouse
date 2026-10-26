import { expect, test } from 'bun:test';
import { browserName, countryCode } from '../src/lib/server/dimensions';

test('browser derivatives take priority over compatibility UA tokens', () => {
  for (const [ua, browser] of [
    ['Mozilla Chrome/130.0 Safari/537.36 Edg/130.0', 'Edge'],
    ['Mozilla Chrome/130.0 Safari/537.36 OPR/114.0', 'Opera'],
    ['Mozilla Chrome/130.0 SamsungBrowser/26.0 Safari/537.36', 'Samsung Internet'],
    ['Mozilla Chrome/130.0 YaBrowser/24.0 Safari/537.36', 'Yandex Browser'],
    ['Mozilla Firefox/130.0', 'Firefox'],
    ['Mozilla FxiOS/130.0 Mobile Safari/605.1', 'Firefox'],
    ['Mozilla CriOS/130.0 Mobile Safari/605.1', 'Chrome'],
    ['Mozilla Version/18.0 Mobile Safari/605.1', 'Safari'],
    ['HeadlessChrome/130.0 Safari/537.36', 'Headless Chrome'],
    ['Chromium/130.0', 'Chromium'],
    ['', 'Unknown'],
  ])
    expect(browserName(ua)).toBe(browser);
});
test('country lookup accepts IPv4 and IPv6, rejects invalid codes and unknown addresses', () => {
  expect(countryCode('8.8.8.8', () => ({ country: { iso_code: 'US' } }) as any)).toBe('US');
  expect(countryCode('2001:4860:4860::8888', () => ({ country: { iso_code: 'US' } }) as any)).toBe(
    'US',
  );
  expect(
    countryCode('not-an-ip', () => {
      throw new Error('must not look up invalid IP');
    }),
  ).toBe('');
  for (const code of ['ZZ', 'usa', '<script>', '']) {
    expect(countryCode('8.8.8.8', () => ({ country: { iso_code: code } }) as any)).toBe('');
  }
  expect(countryCode('127.0.0.1', () => null)).toBe('');
  expect(
    countryCode('8.8.8.8', () => {
      throw new Error('invalid data');
    }),
  ).toBe('');
});
