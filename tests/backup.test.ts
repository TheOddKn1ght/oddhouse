import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backup, restore } from '../scripts/backup';

test('live WAL backup restores committed rows, refuses overwrites and detects corruption', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oddhouse-backup-test-'));
  const source = join(dir, 'live.sqlite');
  const db = new Database(source, { create: true });
  try {
    db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE hits(id INTEGER PRIMARY KEY, path TEXT); INSERT INTO hits(path) VALUES ('/first');",
    );
    const snapshot = await backup(source, dir);
    db.exec("INSERT INTO hits(path) VALUES ('/later');");
    const destination = join(dir, 'restored.sqlite');
    await restore(snapshot, destination);
    const restored = new Database(destination, { readonly: true });
    try {
      expect(restored.query('SELECT path FROM hits').all()).toEqual([{ path: '/first' }]);
    } finally {
      restored.close();
    }
    await expect(restore(snapshot, destination)).rejects.toThrow('already exists');
    const bytes = new Uint8Array(await Bun.file(snapshot).arrayBuffer());
    bytes[200] ^= 255;
    await Bun.write(snapshot, bytes);
    await expect(restore(snapshot, join(dir, 'corrupt.sqlite'))).rejects.toThrow('checksum');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
