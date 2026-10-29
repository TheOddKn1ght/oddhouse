import { isbot } from 'isbot';
import { Reader, type CountryResponse } from 'maxmind';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { resolve } from 'node:path';

export function browserName(userAgent: string) {
  // Match derivatives before the Chromium/Safari tokens they also advertise.
  const rules: [RegExp, string][] = [
    [/Edg(?:e|A|iOS)?\//i, 'Edge'],
    [/(?:OPR|Opera|OPiOS)\//i, 'Opera'],
    [/SamsungBrowser\//i, 'Samsung Internet'],
    [/YaBrowser\//i, 'Yandex Browser'],
    [/(?:Firefox|FxiOS)\//i, 'Firefox'],
    [/HeadlessChrome\//i, 'Headless Chrome'],
    [/(?:Chrome|CriOS)\//i, 'Chrome'],
    [/Chromium\//i, 'Chromium'],
    [/Version\/[\d.]+.*Safari\//i, 'Safari'],
  ];
  return rules.find(([pattern]) => pattern.test(userAgent.slice(0, 4096)))?.[1] || 'Unknown';
}

export function countryCode(address: string, lookup: (ip: string) => CountryResponse | null) {
  if (!isIP(address)) return '';
  try {
    const code = lookup(address)?.country?.iso_code;
    return code && /^[A-Z]{2}$/.test(code) && code !== 'ZZ' ? code : '';
  } catch {
    return '';
  }
}
let loaded = false;
let reader: Reader<CountryResponse> | undefined;
export function countryForAddress(address: string) {
  if (!loaded) {
    loaded = true;
    try {
      reader = new Reader<CountryResponse>(
        readFileSync(resolve(process.env.GEOIP_DATABASE || 'geoip/country.mmdb')),
      );
    } catch {
      console.warn('Country database unavailable. Run bun run geoip:update, then restart the app.');
    }
  }
  return reader ? countryCode(address, (ip) => reader!.get(ip)) : '';
}

export function deviceName(userAgent: string) {
  const ua = userAgent.slice(0, 4096);
  if (
    /iPad|Tablet|PlayBook|Kindle|Silk\//i.test(ua) ||
    (/Android/i.test(ua) && !/Mobile/i.test(ua))
  )
    return 'Tablet';
  if (/Mobile|iPhone|iPod|Windows Phone|IEMobile/i.test(ua)) return 'Mobile';
  if (/Windows NT|Macintosh|Mac OS X|X11|Linux|CrOS/i.test(ua)) return 'Desktop';
  return 'Unknown';
}

export function osName(userAgent: string) {
  const ua = userAgent.slice(0, 4096);
  const rules: [RegExp, string][] = [
    [/Windows Phone/i, 'Windows Phone'],
    [/iPhone|iPad|iPod/i, 'iOS'],
    [/Android/i, 'Android'],
    [/CrOS/i, 'Chrome OS'],
    [/Windows NT/i, 'Windows'],
    [/Macintosh|Mac OS X/i, 'macOS'],
    [/Linux/i, 'Linux'],
  ];
  return rules.find(([pattern]) => pattern.test(ua))?.[1] || 'Unknown';
}

export function normalizeLanguage(value: unknown) {
  if (typeof value !== 'string' || value.length > 64) return '';
  try {
    const language = new Intl.Locale(value).language;
    return language !== 'und' && /^[a-z]{2,8}$/.test(language) ? language : '';
  } catch {
    return '';
  }
}

export function preferredLanguage(language: unknown, acceptLanguage: string) {
  const preferred = normalizeLanguage(language);
  if (preferred) return preferred;
  return (
    acceptLanguage
      .slice(0, 2048)
      .split(',')
      .slice(0, 20)
      .map((entry) => {
        const match =
          /^\s*([a-z]{2,8}(?:-[a-z0-9]{1,8})*)(?:\s*;\s*q=(0(?:\.\d{1,3})?|1(?:\.0{1,3})?))?\s*$/i.exec(
            entry,
          );
        return {
          language: match ? normalizeLanguage(match[1]) : '',
          quality: match ? Number(match[2] ?? 1) : 0,
        };
      })
      .filter((entry) => entry.language && entry.quality > 0)
      .sort((left, right) => right.quality - left.quality)[0]?.language || ''
  );
}

export function isBot(userAgent: string) {
  return (
    isbot(userAgent.slice(0, 4096)) ||
    /HeadlessChrome|PhantomJS|Playwright|Puppeteer|Selenium/i.test(userAgent.slice(0, 4096))
  );
}

export type HitDimensions = {
  country: string;
  browser: string;
  device: string;
  os: string;
  language: string;
};
