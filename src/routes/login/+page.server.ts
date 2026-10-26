import { eq } from 'drizzle-orm';
import { admins } from '#lib/server/schema.js';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { database } from '#lib/server/database.js';
import { allowLogin, cookieName, createSession, userForSession } from '#lib/server/auth.js';

// Compare unknown users against a real hash as well.
const dummyHash = Bun.password.hashSync('oddhouse-dummy-password');
export const load: PageServerLoad = ({ cookies }) => {
  if (userForSession(cookies.get(cookieName))) redirect(303, '/');
};
export const actions: Actions = {
  default: async ({ request, cookies, url, getClientAddress }) => {
    if (!allowLogin(getClientAddress()))
      return fail(429, { error: 'Too many attempts. Try again in 15 minutes.' });
    const form = await request.formData();
    const username = String(form.get('username') || '').slice(0, 64);
    const password = String(form.get('password') || '');
    if (password.length > 1024) return fail(400, { error: 'Invalid username or password.' });
    const row = database()
      .select({ password_hash: admins.password_hash })
      .from(admins)
      .where(eq(admins.username, username))
      .get();
    const valid = await Bun.password.verify(password, row?.password_hash || dummyHash);
    if (!row || !valid) return fail(400, { error: 'Invalid username or password.' });
    cookies.set(cookieName, createSession(username), {
      path: '/',
      httpOnly: true,
      secure: url.protocol === 'https:',
      sameSite: 'strict',
      maxAge: 7 * 86400,
    });
    redirect(303, '/');
  },
};
