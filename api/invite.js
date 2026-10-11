// Invites (Vercel serverless function). Runway is invite-only: sign-ups are turned off
// in Supabase, and only the admin (ADMIN_EMAIL) can add people here.
//
//   GET    /api/invite               list everyone who can sign in
//   POST   /api/invite {email}       invite someone (or resend their code)
//   DELETE /api/invite?email=…       remove someone, and their plan
//
// Needs these environment variables in Vercel (never prefix the service key with VITE_,
// or it would be shipped to every browser):
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  (already set for the app)
//   SUPABASE_SERVICE_ROLE_KEY                 (Supabase → Project Settings → API keys)
//   ADMIN_EMAIL                               (your sign-in email)
//   SITE_URL                                  (optional; defaults to this deploy's URL)

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  if (!url || !anonKey || !serviceKey || !adminEmail) {
    return res.status(501).json({ error: 'Invites aren’t set up on this site yet.' });
  }

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sign in first.' });
  const admin = createClient(url, serviceKey, noSession);
  const { data: who, error: whoError } = await admin.auth.getUser(token);
  if (whoError || !who?.user) return res.status(401).json({ error: 'Your sign-in expired. Sign in again.' });
  if ((who.user.email || '').toLowerCase() !== adminEmail) {
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
      const existing = await findUser(admin, email);
      if (!existing) {
        // Created already confirmed, so the emailed code signs them straight in.
        const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
        if (error) throw error;
      }
      // Send the sign-in email (Supabase's "Magic Link" template, which carries the code and the invite note).
      const site = process.env.SITE_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
      const anon = createClient(url, anonKey, noSession);
      const { error: mailError } = await anon.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: site },
      });
      if (mailError) {
        return res.status(502).json({
          error: `${email} can now sign in, but the email didn’t send (${mailError.message}). Try Resend in a minute.`,
        });
      }
      return res.status(200).json({ ok: true, resent: Boolean(existing) });
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
