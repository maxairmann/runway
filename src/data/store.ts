// App state: which mode the app is in (demo, this device, or shared), the
// household being edited, and persistence for each mode.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Household } from '../engine/types';
import { makeDemo } from './demo';
import * as sync from './sync';

export type Mode = 'demo' | 'local' | 'cloud';

export type CloudPhase = 'idle' | 'checking' | 'signed-out' | 'set-password' | 'no-household' | 'ready' | 'error';

export interface CloudState {
  phase: CloudPhase;
  email?: string;
  error?: string;
  saving: boolean;
  savedAt?: string;
}

const KEYS = { mode: 'runway.mode', local: 'runway.local', demo: 'runway.demo' };

function read<T>(key: string, store: Storage | null = safeLocal()): T | null {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown, store: Storage | null = safeLocal()): void {
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private windows, previews); the app still works for this visit.
  }
}

function safeLocal(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function initialMode(): Mode | null {
  const m = read<Mode>(KEYS.mode);
  if (m === 'cloud' && !sync.cloudConfigured) return null;
  // A public demo deploy can open straight into the sample household.
  if (m === null && import.meta.env.VITE_START_IN_DEMO === 'true') return 'demo';
  return m;
}

function loadFor(mode: Mode | null): Household | null {
  if (mode === 'demo') return read<Household>(KEYS.demo) ?? makeDemo();
  if (mode === 'local') return read<Household>(KEYS.local);
  return null;
}

export function useStore() {
  const [mode, setMode] = useState<Mode | null>(() => initialMode());
  const [household, setHousehold] = useState<Household | null>(() => loadFor(mode));
  const [cloud, setCloud] = useState<CloudState>({ phase: 'idle', saving: false });

  const dirty = useRef(false);
  const lastSaved = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Household | null>(household);
  latest.current = household;
  const phaseRef = useRef<CloudPhase>(cloud.phase);
  phaseRef.current = cloud.phase;

  useEffect(() => write(KEYS.mode, mode), [mode]);

  // Synced mode: session → load plan → live updates from your other devices.
  const refreshCloud = useCallback(async () => {
    if (!sync.cloudConfigured) return;
    setCloud((c) => ({ ...c, phase: 'checking', error: undefined }));
    try {
      const session = await sync.getSession();
      if (!session) {
        setHousehold(null);
        setCloud((c) => ({ ...c, phase: 'signed-out', email: undefined }));
        return;
      }
      const email = session.user.email ?? undefined;
      if (sync.needsNewPassword(session)) {
        setHousehold(null);
        setCloud((c) => ({ ...c, phase: 'set-password', email }));
        return;
      }
      const loaded = await sync.loadHousehold();
      if (!loaded) {
        setHousehold(null);
        setCloud((c) => ({ ...c, phase: 'no-household', email }));
        return;
      }
      lastSaved.current = loaded.updatedAt;
      setHousehold(loaded.data);
      setCloud((c) => ({ ...c, phase: 'ready', email, savedAt: loaded.updatedAt }));
    } catch (e) {
      setCloud((c) => ({ ...c, phase: 'error', error: (e as Error).message }));
    }
  }, []);

  useEffect(() => {
    if (mode !== 'cloud') return;
    void refreshCloud();
    let off: (() => void) | undefined;
    void sync
      .onAuthChange((event) => {
        if (event === 'SIGNED_OUT') {
          setHousehold(null);
          setCloud((c) => ({ ...c, phase: 'signed-out', email: undefined }));
        }
      })
      .then((fn) => (off = fn));
    return () => off?.();
  }, [mode, refreshCloud]);

  const householdId = household?.id;
  useEffect(() => {
    if (mode !== 'cloud' || cloud.phase !== 'ready' || !householdId) return;
    let off: (() => void) | undefined;
    void sync
      .subscribeHousehold(householdId, (remote) => {
        if (remote.updatedAt === lastSaved.current) return; // our own save echoing back
        if (dirty.current) return; // our pending save will win
        lastSaved.current = remote.updatedAt;
        setHousehold(remote.data);
        setCloud((c) => ({ ...c, savedAt: remote.updatedAt }));
      })
      .then((fn) => (off = fn));
    return () => off?.();
  }, [mode, cloud.phase, householdId]);

  const persist = useCallback(
    (h: Household) => {
      if (mode === 'demo') write(KEYS.demo, h);
      else if (mode === 'local') write(KEYS.local, h);
      else if (mode === 'cloud') {
        dirty.current = true;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        setCloud((c) => ({ ...c, saving: true }));
        saveTimer.current = setTimeout(async () => {
          const toSave = latest.current;
          if (!toSave) return;
          try {
            const at = await sync.saveHousehold(toSave);
            lastSaved.current = at;
            dirty.current = false;
            setCloud((c) => ({ ...c, saving: false, savedAt: at, error: undefined }));
          } catch (e) {
            setCloud((c) => ({ ...c, saving: false, error: `Not saved: ${(e as Error).message}` }));
          }
        }, 700);
      }
    },
    [mode],
  );

  const update = useCallback(
    (fn: (h: Household) => Household) => {
      setHousehold((prev) => {
        if (!prev) return prev;
        const next = { ...fn(prev), updatedAt: new Date().toISOString() };
        latest.current = next;
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const choose = useCallback((m: Mode | null) => {
    setMode(m);
    setHousehold(loadFor(m));
    if (m !== 'cloud') setCloud({ phase: 'idle', saving: false });
  }, []);

  /** Start a plan on this device. */
  const startLocal = useCallback((h: Household) => {
    write(KEYS.local, h);
    setMode('local');
    setHousehold(h);
  }, []);

  const resetDemo = useCallback(() => {
    const fresh = makeDemo();
    write(KEYS.demo, fresh);
    setHousehold(fresh);
  }, []);

  const cloudActions = {
    signIn: async (email: string, password: string) => {
      await sync.signInWithPassword(email, password);
      await refreshCloud();
    },
    setPassword: async (password: string) => {
      await sync.setPassword(password);
      await refreshCloud();
    },
    signOut: async () => {
      await sync.signOut();
      setHousehold(null);
      setCloud({ phase: 'signed-out', saving: false });
    },
    /** Start syncing a plan: create it in the cloud. */
    create: async (h: Household) => {
      const created = await sync.createHousehold(h);
      lastSaved.current = created.updatedAt;
      setHousehold(created.data);
      setCloud((c) => ({ ...c, phase: 'ready', savedAt: created.updatedAt }));
    },
    retry: refreshCloud,
  };

  const localPlan = read<Household>(KEYS.local);

  return {
    mode,
    household,
    cloud,
    localPlan,
    cloudConfigured: sync.cloudConfigured,
    choose,
    startLocal,
    update,
    resetDemo,
    cloudActions,
  };
}

export type Store = ReturnType<typeof useStore>;
