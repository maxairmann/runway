// Invites (Vercel serverless function). Runway is invite-only: sign-ups are turned off
// in Supabase, and only the admin (ADMIN_EMAIL) can add people here. No email is ever
// sent: the admin gets a temporary password to pass on, and the person picks their own
// the first time they sign in.
//
//   GET    /api/invite               list everyone who can sign in
//   POST   /api/invite {email}       create an account, or give an existing one a new temporary password
//   DELETE /api/invite?email=…       remove someone, and their plan
//
// Needs these environment variables in Vercel (never prefix the service key with VITE_,
// or it would be shipped to every browser):
//   VITE_SUPABASE_URL                         (already set for the app)
//   SUPABASE_SERVICE_ROLE_KEY                 (Supabase → Project Settings → API keys, the secret key)
//   ADMIN_EMAIL                               (the email you sign in to Runway with)

import { randomInt } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Easy to read aloud or type on a phone: no 0/O, 1/l/I. Three groups of four, about 60 bits. */
function tempPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const group = () => Array.from({ length: 4 }, () => chars[randomInt(chars.length)]).join('');
  return `${group()}-${group()}-${group()}`;
}

async function findUser(admin, email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function allUsers(admin) {
  const out = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    out.push(...data.users);
    if (data.users.length < 200) break;
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!url || !serviceKey || !adminEmail) {
    return res.status(501).json({ error: 'Invites aren’t set up on this site yet.' });
  }

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sign in first.' });
  const admin = createClient(url, serviceKey, noSession);
  const { data: who, error: whoError } = await admin.auth.getUser(token);
  if (whoError || !who?.user) return res.status(401).json({ error: 'Your sign-in expired. Sign in again.' });
  // Only the confirmed, non-anonymous account with ADMIN_EMAIL. Emails are unique in Supabase,
  // and sign-ups are off, so no one else can claim that address.
  const isAdmin = (who.user.email || '').toLowerCase() === adminEmail && !who.user.is_anonymous && Boolean(who.user.email_confirmed_at);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Only the admin can manage invites.' });
  }

  try {
    if (req.method === 'GET') {
      const users = (await allUsers(admin))
        .filter((u) => (u.email || '').toLowerCase() !== adminEmail)
        .map((u) => ({ email: u.email, invitedAt: u.created_at, lastSignIn: u.last_sign_in_at ?? null }))
        .sort((a, b) => (a.invitedAt < b.invitedAt ? 1 : -1));
      return res.status(200).json({ users });
    }

    if (req.method === 'POST') {
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!EMAIL.test(email)) return res.status(400).json({ error: 'That doesn’t look like an email address.' });
      if (email === adminEmail) return res.status(400).json({ error: 'That’s you. Change your own password in Supabase.' });
      const password = tempPassword();
      // temp_password makes the app ask them to choose their own on first sign-in.
      const existing = await findUser(admin, email);
      const { error } = existing
        ? await admin.auth.admin.updateUserById(existing.id, { password, user_metadata: { temp_password: true } })
        : await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { temp_password: true } });
      if (error) throw error;
      return res.status(200).json({ ok: true, existed: Boolean(existing), password });
    }

    if (req.method === 'DELETE') {
      const email = String(req.query?.email || '').trim().toLowerCase();
      if (email === adminEmail) return res.status(400).json({ error: 'You can’t remove yourself.' });
      const user = await findUser(admin, email);
      if (!user) return res.status(404).json({ error: 'No one with that email.' });
      // Their plan goes with them (households.created_by cascades).
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Something went wrong.' });
  }
}
