// Supabase sync. Loaded only when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
// are set; without them the app runs fully on-device (local plan + demo).

import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Household } from '../engine/types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudConfigured = Boolean(url && anonKey);

let clientPromise: Promise<SupabaseClient> | null = null;

function client(): Promise<SupabaseClient> {
  if (!cloudConfigured) return Promise.reject(new Error('Sharing is not set up on this site.'));
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url as string, anonKey as string, { auth: { persistSession: true, detectSessionInUrl: false } }),
  );
  return clientPromise;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export interface CloudHousehold {
  id: string;
  data: Household;
  updatedAt: string;
}

export async function getSession(): Promise<Session | null> {
  const sb = await client();
  const { data, error } = await sb.auth.getSession();
  fail(error);
  return data.session;
}

export async function onAuthChange(cb: (event: string, session: Session | null) => void): Promise<() => void> {
  const sb = await client();
  const { data } = sb.auth.onAuthStateChange((event, session) => cb(event, session));
  return () => data.subscription.unsubscribe();
}

/** Sign in with the email and password the admin set up (or the one you chose). */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  const sb = await client();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error && /invalid login credentials/i.test(error.message)) throw new Error('That email and password don’t match. Check both, or ask for a new temporary password.');
  fail(error);
}

/** True when the admin set a temporary password that the person hasn't replaced yet. */
export function needsNewPassword(session: Session): boolean {
  return session.user.user_metadata?.temp_password === true;
}

/** Choose your own password (also clears the temporary-password flag). */
export async function setPassword(password: string): Promise<void> {
  const sb = await client();
  const { error } = await sb.auth.updateUser({ password, data: { temp_password: false } });
  fail(error);
}

export interface Invitee {
  email: string;
  invitedAt: string;
  lastSignIn: string | null;
}

/** Calls the admin-only invite endpoint. Throws with `status` set (403 = not the admin, 404/501 = not set up). */
async function inviteApi<T>(method: 'GET' | 'POST' | 'DELETE', email?: string): Promise<T> {
  const sb = await client();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw Object.assign(new Error('Sign in first.'), { status: 401 });
  const query = method === 'DELETE' && email ? `?email=${encodeURIComponent(email)}` : '';
  const res = await fetch(`/api/invite${query}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify({ email }) : undefined,
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || body === null) {
    throw Object.assign(new Error(body?.error ?? 'Invites aren’t available here.'), { status: body === null ? 404 : res.status });
  }
  return body;
}

export const listInvitees = () => inviteApi<{ users: Invitee[] }>('GET').then((b) => b.users);
/** Creates the account (or resets its password) and returns the temporary password to pass on. */
export const sendInvite = (email: string) => inviteApi<{ ok: true; existed: boolean; password: string }>('POST', email);
export const removeInvitee = (email: string) => inviteApi<{ ok: true }>('DELETE', email);

export async function signOut(): Promise<void> {
  const sb = await client();
  const { error } = await sb.auth.signOut();
  fail(error);
}

function toCloud(row: { id: string; data: Household; updated_at: string }): CloudHousehold {
  return { id: row.id, data: { ...row.data, id: row.id, updatedAt: row.updated_at }, updatedAt: row.updated_at };
}

/** The household this user belongs to (the first one, if several). */
export async function loadHousehold(): Promise<CloudHousehold | null> {
  const sb = await client();
  const { data, error } = await sb
    .from('households')
    .select('id, data, updated_at')
    .order('created_at', { ascending: true })
    .limit(1);
  fail(error);
  return data && data.length > 0 ? toCloud(data[0]) : null;
}

export async function createHousehold(h: Household): Promise<CloudHousehold> {
  const sb = await client();
  const { data: id, error } = await sb.rpc('create_household', { p_name: h.name, p_data: h });
  fail(error);
  const loaded = await loadHousehold();
  if (!loaded || loaded.id !== id) throw new Error('The household was created but could not be loaded.');
  return loaded;
}

/** Saves the plan; returns the server's timestamp for this version. */
export async function saveHousehold(h: Household): Promise<string> {
  const sb = await client();
  const { data, error } = await sb
    .from('households')
    .update({ name: h.name, data: h })
    .eq('id', h.id)
    .select('updated_at')
    .single();
  fail(error);
  return (data as { updated_at: string }).updated_at;
}

/** Calls back whenever anyone saves this household. */
export async function subscribeHousehold(id: string, cb: (h: CloudHousehold) => void): Promise<() => void> {
  const sb = await client();
  const channel = sb
    .channel(`household:${id}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'households', filter: `id=eq.${id}` },
      (payload) => cb(toCloud(payload.new as { id: string; data: Household; updated_at: string })),
    )
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}
