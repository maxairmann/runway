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
    createClient(url as string, anonKey as string, { auth: { persistSession: true, detectSessionInUrl: true } }),
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

export async function sendMagicLink(email: string): Promise<void> {
  const sb = await client();
  const redirect = window.location.origin + window.location.pathname;
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
  fail(error);
}

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
