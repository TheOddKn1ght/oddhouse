import { eq } from 'drizzle-orm';
import { admins, sessions } from '../src/lib/server/schema';
import { database } from '../src/lib/server/database';

const [command, username] = Bun.argv.slice(2);
if (
  !['create', 'reset'].includes(command) ||
  !username ||
  !/^[A-Za-z0-9_-]{1,64}$/.test(username) ||
  Bun.argv.length !== 4
) {
  console.error('Usage: bun scripts/admin.ts create|reset USERNAME (password on stdin)');
  process.exit(1);
}
if (process.stdin.isTTY) {
  console.error('Pipe the password on stdin, or use sudo oddhouse admin on the VPS.');
  process.exit(1);
}
const password = (await Bun.stdin.text()).replace(/\r?\n$/, '');
if (password.length < 12 || password.length > 1024) {
  console.error('Password must contain 12–1024 characters.');
  process.exit(1);
}
const db = database();
const existing = db
  .select({ username: admins.username })
  .from(admins)
  .where(eq(admins.username, username))
  .get();
if ((command === 'create' && existing) || (command === 'reset' && !existing)) {
  console.error(
    existing
      ? 'Administrator already exists. Use reset.'
      : 'Administrator does not exist. Use create.',
  );
  process.exit(1);
}
const hash = await Bun.password.hash(password, { algorithm: 'argon2id' });
db.transaction((tx) => {
  if (command === 'create') tx.insert(admins).values({ username, password_hash: hash }).run();
  else tx.update(admins).set({ password_hash: hash }).where(eq(admins.username, username)).run();
  tx.delete(sessions).where(eq(sessions.username, username)).run();
});
console.log(
  `Administrator ${username} ${command === 'create' ? 'created' : 'updated'}. Existing sessions revoked.`,
);
