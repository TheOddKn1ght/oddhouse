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
