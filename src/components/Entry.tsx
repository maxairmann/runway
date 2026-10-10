import { useState } from 'react';
import type { Household } from '../engine/types';
import type { Mode, Store } from '../data/store';
import { Onboarding } from './Onboarding';

export function Welcome({ cloudConfigured, onChoose, hasLocal }: { cloudConfigured: boolean; onChoose: (m: Mode) => void; hasLocal: boolean }) {
  return (
    <main className="welcome">
      <div className="welcome-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h1>Runway</h1>
      <p className="lead">
        Plan time off together, and see before you book whether you’ll both have the hours. Caps, carryover, and holidays included.
      </p>
      <div className="welcome-actions">
        <button type="button" className="primary wide" onClick={() => onChoose('local')}>
          {hasLocal ? 'Open the plan on this phone' : 'Start a plan on this phone'}
        </button>
        {cloudConfigured ? (
          <button type="button" className="wide" onClick={() => onChoose('cloud')}>
            Sign in to a shared plan
          </button>
        ) : null}
        <button type="button" className="wide ghost" onClick={() => onChoose('demo')}>
          Try the demo with sample data
        </button>
      </div>
      <p className="fine">A plan on this phone stays on this phone. Sign in to share one with your partner.</p>
    </main>
  );
}

export function CloudGate({ store, onBack }: { store: Store; onBack: () => void }) {
  const { cloud, cloudActions, localPlan, joinCode } = store;
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
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
        <h1>{joinCode ? 'Join a shared plan' : 'Sign in'}</h1>
        {sent ? (
          <p className="lead">
            Check {email} for a sign-in link. Open it on this device and you’ll land back here, signed in{joinCode ? ' and joined' : ''}.
          </p>
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
            <p className="lead">We’ll email you a link. No password.</p>
            <label className="field">
              <span className="label">Email</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button type="submit" className="primary wide" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a sign-in link'}
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
      <h1>Set up a shared plan</h1>
      <p className="lead">Signed in as {cloud.email}. Start a plan your partner can join, or join theirs.</p>
      <div className="welcome-actions">
        {localPlan ? (
          <button type="button" className="primary wide" disabled={busy} onClick={() => void run(() => cloudActions.create(localPlan))}>
            Share the plan on this phone ({localPlan.name})
          </button>
        ) : null}
        <button type="button" className={localPlan ? 'wide' : 'primary wide'} onClick={() => setSetup(true)}>
          Start a new shared plan
        </button>
        <form
          className="join-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => cloudActions.join(code));
          }}
        >
          <label className="field">
            <span className="label">Or paste an invite code from your partner</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 4f9c2a17b3" />
          </label>
          <button type="submit" disabled={!code.trim() || busy}>
            Join
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
        <button type="button" className="wide ghost" onClick={() => void cloudActions.signOut()}>
          Sign out
        </button>
      </div>
    </main>
  );
}
