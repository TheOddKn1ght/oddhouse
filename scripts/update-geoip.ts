import { Reader, type CountryResponse } from 'maxmind';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

// DB-IP Country Lite, CC BY 4.0. The dashboard and README credit DB-IP.
const destination = resolve(process.env.GEOIP_DATABASE || 'geoip/country.mmdb');
const now = new Date();
let data: Buffer | undefined;
for (let offset = 0; offset < 2; offset++) {
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
    .toISOString()
    .slice(0, 7);
  const response = await fetch(
    `https://download.db-ip.com/free/dbip-country-lite-${month}.mmdb.gz`,
    { signal: AbortSignal.timeout(60000) },
  );
  if (response.status === 404) continue;
  if (!response.ok) throw new Error(`GeoIP download failed (${response.status})`);
  data = gunzipSync(Buffer.from(await response.arrayBuffer()), {
    maxOutputLength: 64 * 1024 * 1024,
  });
  const reader = new Reader<CountryResponse>(data);
  if (!reader.metadata.databaseType.toLowerCase().includes('country'))
    throw new Error('Expected a country database');
  console.log(`Downloaded DB-IP Country Lite ${month}`);
  break;
}
if (!data) throw new Error('No current or previous monthly country database is available');
await mkdir(dirname(destination), { recursive: true });
const temporary = `${destination}.${process.pid}.tmp`;
await writeFile(temporary, data);
await rename(temporary, destination);
console.log('Country database updated. Restart the app to use it.');
