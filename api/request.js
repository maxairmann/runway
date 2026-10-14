// Request an account (public, Vercel serverless function). Saves the email for the admin
// to approve in Settings → Invites. Always answers the same way, so it doesn't reveal
// who already has an account.
//
//   POST /api/request {email}
//
// Uses VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see api/invite.js).

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A cap on waiting requests, so a script can't fill the table. */
const MAX_PENDING = 100;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!url || !serviceKey) return res.status(501).json({ error: 'Requests aren’t set up on this site yet.' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  // A hidden form field people never see; bots tend to fill it in.
  if (req.body?.website) return res.status(200).json({ ok: true });
  if (!EMAIL.test(email) || email.length > 200) return res.status(400).json({ error: 'That doesn’t look like an email address.' });

  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { count, error: countError } = await admin.from('account_requests').select('email', { count: 'exact', head: true });
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_PENDING) return res.status(429).json({ error: 'Too many requests are waiting. Try again later.' });
    const { error } = await admin.from('account_requests').upsert({ email }, { onConflict: 'email', ignoreDuplicates: true });
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Something went wrong. Try again in a minute.' });
  }
}
