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
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
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
        {sent ? (
          <form
            className="welcome-actions"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => cloudActions.verifyCode(email.trim(), code.trim()));
            }}
          >
            <p className="lead">We emailed {email} a sign-in code. Enter it here.</p>
            <label className="field">
              <span className="label">Code</span>
              <input
                id="signin-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={10}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button type="submit" className="primary wide" disabled={busy || code.length < 6}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="hint">
              On a computer you can also just click the link in the email.{' '}
              <button
                type="button"
                className="link"
                onClick={() => {
                  setSent(false);
                  setCode('');
                  setError(null);
                }}
              >
                Use a different email
              </button>
            </p>
          </form>
        ) : (
          <form
            className="welcome-actions"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await cloudActions.sendLink(email.trim());
                setSent(true);
              });
            }}
          >
            <p className="lead">We’ll email you a sign-in code. No password.</p>
            <label className="field">
              <span className="label">Email</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button type="submit" className="primary wide" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a code'}
            </button>
          </form>
        )}
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
