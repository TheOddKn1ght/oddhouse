import { expect, test } from 'bun:test';
import {
  browserName,
  countryCode,
  deviceName,
  osName,
  normalizeLanguage,
  preferredLanguage,
  isBot,
} from '../src/lib/server/dimensions';

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

test('device and OS families cover mobile, tablet and desktop browser agents', () => {
  const examples: [string, string, string][] = [
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
      'Desktop',
      'Windows',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15',
      'Desktop',
      'macOS',
    ],
    [
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
      'Desktop',
      'Linux',
    ],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 16000.0.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
      'Desktop',
      'Chrome OS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1',
      'Mobile',
      'iOS',
    ],
    [
      'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1',
      'Tablet',
      'iOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
      'Mobile',
      'Android',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
      'Tablet',
      'Android',
    ],
    ['', 'Unknown', 'Unknown'],
    ['private browser', 'Unknown', 'Unknown'],
  ];
  for (const [ua, device, os] of examples) {
    expect(deviceName(ua)).toBe(device);
    expect(osName(ua)).toBe(os);
  }
});
test('language uses a validated preferred base language, with quality-weighted header fallback', () => {
  expect(normalizeLanguage('EN-us')).toBe('en');
  expect(preferredLanguage('fr-CA', 'en-US,en;q=0.9')).toBe('fr');
  expect(preferredLanguage(undefined, 'en-US;q=0.5, de-DE;q=0.9, fr;q=0')).toBe('de');
  expect(preferredLanguage('<script>', 'en;q=0,fr;q=0.8')).toBe('fr');
  expect(preferredLanguage(undefined, '*;q=0.9, en;q=1.9, fr;q=0')).toBe('');
  for (const value of [null, 42, '', 'en_us', 'und', 'x'.repeat(65), 'en\n<bad>'])
    expect(normalizeLanguage(value)).toBe('');
});
test('recognizable bots, preview crawlers and automation are filtered without rejecting normal browsers', () => {
  for (const ua of [
    'Googlebot/2.1 (+http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    'Mozilla/5.0 AppleWebKit/537.36 HeadlessChrome/130.0.0.0 Safari/537.36',
    'Playwright/1.0',
  ])
    expect(isBot(ua)).toBe(true);
  for (const ua of [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
    '',
  ])
    expect(isBot(ua)).toBe(false);
});
