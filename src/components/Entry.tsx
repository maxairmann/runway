import { useState } from 'react';
import type { Household } from '../engine/types';
import type { Mode, Store } from '../data/store';
import { Onboarding } from './Onboarding';
import { CorgiMark } from './Corgi';

export function Welcome({ cloudConfigured, onChoose, hasLocal }: { cloudConfigured: boolean; onChoose: (m: Mode) => void; hasLocal: boolean }) {
  return (
    <main className="welcome">
      <CorgiMark className="welcome-corgi" />
      <h1>Runway</h1>
      <p className="lead">
        Tap the days you want off and see right away whether you’ll have the PTO. Caps, carryover, and holidays included.
      </p>
      <div className="welcome-actions">
        <button type="button" className="primary wide" onClick={() => onChoose('local')}>
          {hasLocal ? 'Open the plan on this phone' : 'Start a plan on this phone'}
        </button>
        {cloudConfigured ? (
          <button type="button" className="wide" onClick={() => onChoose('cloud')}>
            Sign in to sync your plan
          </button>
        ) : null}
        <button type="button" className="wide ghost" onClick={() => onChoose('demo')}>
          Try the demo with sample data
        </button>
      </div>
      <p className="fine">A plan on this phone stays on this phone. Sign in to use the same plan on your phone and laptop.</p>
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
      <h1>Set up your synced plan</h1>
      <p className="lead">Signed in as {cloud.email}. Your plan will be the same on every device you sign in on.</p>
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
