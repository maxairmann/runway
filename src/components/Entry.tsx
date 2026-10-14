import { useState } from 'react';
import type { Household } from '../engine/types';
import type { Mode, Store } from '../data/store';
import { Onboarding } from './Onboarding';
import { CorgiMark } from './Corgi';
import * as sync from '../data/sync';

export function Welcome({ cloudConfigured, onChoose, hasLocal }: { cloudConfigured: boolean; onChoose: (m: Mode) => void; hasLocal: boolean }) {
  const [view, setView] = useState<'home' | 'request' | 'sent'>('home');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState(''); // hidden from people; bots fill it in
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Without accounts set up (a demo copy of the app), plans live on the device.
  if (!cloudConfigured) {
    return (
      <main className="welcome">
        <CorgiMark className="welcome-corgi" />
        <h1>Runway</h1>
        <p className="lead">Tap the days you want off and see right away whether you’ll have the PTO. Caps, carryover, and holidays included.</p>
        <div className="welcome-actions">
          <button type="button" className="primary wide" onClick={() => onChoose('local')}>
            {hasLocal ? 'Open my plan' : 'Start a plan'}
          </button>
          <button type="button" className="wide ghost" onClick={() => onChoose('demo')}>
            Try the demo with sample data
          </button>
        </div>
      </main>
    );
  }

  if (view === 'sent') {
    return (
      <main className="welcome">
        <CorgiMark className="welcome-corgi" />
        <h1>Request sent</h1>
        <p className="lead">
          Thanks. Once your request is approved, you’ll get a temporary password for {email}. Then come back here and tap Sign in.
        </p>
        <div className="welcome-actions">
          <button type="button" className="wide" onClick={() => setView('home')}>
            Back
          </button>
          <button type="button" className="wide ghost" onClick={() => onChoose('demo')}>
            Try the demo while you wait
          </button>
        </div>
      </main>
    );
  }

  if (view === 'request') {
    return (
      <main className="welcome">
        <button type="button" className="link back" onClick={() => setView('home')}>
          Back
        </button>
        <h1>Request an account</h1>
        <form
          className="welcome-actions"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await sync.requestAccount(email.trim(), website);
              setView('sent');
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="lead">Runway is invite-only for now. Leave your email and you’ll hear back with a temporary password.</p>
          <label className="field">
            <span className="label">Email</span>
            <input id="request-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="hp" aria-hidden="true">
            Website
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" className="primary wide" disabled={busy}>
            {busy ? 'Sending…' : 'Request an account'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="welcome">
      <CorgiMark className="welcome-corgi" />
      <h1>Runway</h1>
      <p className="lead">Tap the days you want off and see right away whether you’ll have the PTO. Caps, carryover, and holidays included.</p>
      <div className="welcome-actions">
        <button type="button" className="primary wide" onClick={() => onChoose('cloud')}>
          Sign in
        </button>
        <button type="button" className="wide" onClick={() => setView('request')}>
          Request an account
        </button>
        <button type="button" className="wide ghost" onClick={() => onChoose('demo')}>
          Try the demo with sample data
        </button>
        {hasLocal ? (
          <button type="button" className="link" onClick={() => onChoose('local')}>
            Open the plan saved on this phone
          </button>
        ) : null}
      </div>
      <p className="fine">Runway is invite-only for now.</p>
    </main>
  );
}

export function CloudGate({ store, onBack }: { store: Store; onBack: () => void }) {
  const { cloud, cloudActions, localPlan } = store;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (cloud.phase === 'idle' || cloud.phase === 'checking') {
    return (
      <main className="welcome">
        <p className="lead">Loading your shared plan…</p>
      </main>
    );
  }

  if (cloud.phase === 'error') {
    return (
      <main className="welcome">
        <h1>Couldn’t reach your shared plan</h1>
        <p className="error">{cloud.error}</p>
        <div className="welcome-actions">
          <button type="button" className="primary wide" onClick={() => void cloudActions.retry()}>
            Try again
          </button>
          <button type="button" className="wide ghost" onClick={onBack}>
            Back
          </button>
        </div>
      </main>
    );
  }

  if (cloud.phase === 'signed-out') {
    return (
      <main className="welcome">
        <button type="button" className="link back" onClick={onBack}>
          Back
        </button>
        <h1>Sign in</h1>
        <form
          className="welcome-actions"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => cloudActions.signIn(email.trim(), password));
          }}
        >
          <p className="lead">Use the email and password you were given. Runway is invite-only.</p>
          <label className="field">
            <span className="label">Email</span>
            <input id="signin-email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Password</span>
            <input
              id="signin-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" className="primary wide" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="hint">Forgot it? Ask whoever invited you for a new temporary password.</p>
        </form>
      </main>
    );
  }

  if (cloud.phase === 'set-password') {
    const tooShort = newPassword.length > 0 && newPassword.length < 8;
    return (
      <main className="welcome">
        <h1>Choose your password</h1>
        <form
          className="welcome-actions"
          onSubmit={(e) => {
            e.preventDefault();
            if (newPassword.length >= 8) void run(() => cloudActions.setPassword(newPassword));
          }}
        >
          <p className="lead">You signed in with a temporary password. Pick one only you know.</p>
          {cloud.email ? <input type="email" autoComplete="username" value={cloud.email} readOnly hidden /> : null}
          <label className="field">
            <span className="label">New password</span>
            <input
              id="new-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          {tooShort ? <p className="hint">At least 8 characters.</p> : null}
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" className="primary wide" disabled={busy || newPassword.length < 8}>
            {busy ? 'Saving…' : 'Save and continue'}
          </button>
        </form>
      </main>
    );
  }

  // Signed in, no household yet.
  if (setup) {
    return (
      <Onboarding
        onBack={() => setSetup(false)}
        busyLabel="Saving…"
        onDone={(h: Household) => cloudActions.create(h)}
      />
    );
  }
  return (
    <main className="welcome">
      <button type="button" className="link back" onClick={onBack}>
        Back
      </button>
      <h1>Set up your plan</h1>
      <p className="lead">Signed in as {cloud.email}. Your plan is saved to your account, so it’s there whenever you sign in.</p>
      <div className="welcome-actions">
        {localPlan ? (
          <button type="button" className="primary wide" disabled={busy} onClick={() => void run(() => cloudActions.create(localPlan))}>
            Use the plan on this phone ({localPlan.name})
          </button>
        ) : null}
        <button type="button" className={localPlan ? 'wide' : 'primary wide'} onClick={() => setSetup(true)}>
          Start a new plan
        </button>
        {error ? <p className="error">{error}</p> : null}
        <button type="button" className="wide ghost" onClick={() => void cloudActions.signOut()}>
          Sign out
        </button>
      </div>
    </main>
  );
}
