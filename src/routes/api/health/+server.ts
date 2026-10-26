import { sql } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { database } from '#lib/server/database.js';

export function GET() {
  database().get(sql`SELECT 1`);
  return json({ status: 'ok' });
}
