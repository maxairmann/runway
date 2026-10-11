import { useEffect, useState } from 'react';
import { formatDate } from '../engine/dates';
import { listInvitees, removeInvitee, sendInvite, type Invitee } from '../data/sync';

const day = (iso: string) => formatDate(iso.slice(0, 10), 'medium');

/**
 * Admin only: add people and see who has signed in. For anyone else the endpoint
 * answers 403 and this section doesn't render. Plans stay private either way.
 * Nothing is emailed: you get a temporary password to text them.
 */
export function Invites() {
  const [people, setPeople] = useState<Invitee[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string; existed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = () =>
    listInvitees()
      .then(setPeople)
      .catch((e: Error & { status?: number }) => {
        if (e.status === 403 || e.status === 404 || e.status === 501) setHidden(true);
        else setError(e.message);
      });

  useEffect(() => {
    void load();
  }, []);

  if (hidden) return null;

  const site = window.location.origin;
  const message = (i: { email: string; password: string; existed: boolean }) =>
    i.existed
      ? `Your new temporary Runway password is ${i.password}\n\nSign in at ${site} with ${i.email}, and you'll be asked to choose your own password.`
      : `I set you up on Runway, a planner for your PTO: ${site}\n\nEmail: ${i.email}\nTemporary password: ${i.password}\n\nOn iPhone: open the link in Safari, tap Share → Add to Home Screen, then open Runway from your home screen and tap "Sign in to sync your plan". You'll choose your own password after signing in.`;

  const issue = async (to: string) => {
    setBusy(to);
    setError(null);
    setCopied(false);
    try {
      const r = await sendInvite(to);
      setIssued({ email: to, password: r.password, existed: r.existed });
      setEmail('');
      setConfirming(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (to: string) => {
    setBusy(to);
    setError(null);
    try {
      await removeInvitee(to);
      setConfirming(null);
      if (issued?.email === to) setIssued(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    if (!issued) return;
    const text = message(issued);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {
      return; // share sheet dismissed
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError('Couldn’t copy. Select the message and copy it by hand.');
    }
  };

  return (
    <section className="invites">
      <h2>Invites</h2>
      <p className="hint">
        Only people you add can sign in. You get a temporary password to text them; they choose their own on first sign-in. Each person’s
        plan is private.
      </p>
      <form
        className="row end"
        onSubmit={(e) => {
          e.preventDefault();
          const to = email.trim().toLowerCase();
          if (to) void issue(to);
        }}
      >
        <label className="field">
          <span className="label">Their email</span>
          <input id="invite-email" type="email" required autoComplete="off" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" className="primary" disabled={busy !== null || !email.trim()}>
          {busy === email.trim().toLowerCase() ? 'Adding…' : 'Add person'}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}

      {issued ? (
        <div className="issued" role="status">
          <p>
            <strong>{issued.existed ? `New temporary password for ${issued.email}` : `${issued.email} can sign in now`}</strong>
          </p>
          <p className="issued-pass">
            <span className="label">Temporary password</span>
            <code>{issued.password}</code>
          </p>
          <textarea readOnly rows={5} value={message(issued)} aria-label="Message to send" />
          <div className="button-row">
            <button type="button" className="primary" onClick={() => void share()}>
              {copied ? 'Copied' : 'Text it to them'}
            </button>
            <button type="button" className="ghost" onClick={() => setIssued(null)}>
              Done
            </button>
          </div>
          <p className="hint">You won’t see this password again. If it’s lost, give them a new one below.</p>
        </div>
      ) : null}

      {people === null ? (
        <p className="hint">Loading…</p>
      ) : people.length === 0 ? (
        <p className="hint">No one yet.</p>
      ) : (
        <ul className="plain-list invite-list">
          {people.map((p) => (
            <li key={p.email}>
              <span className="invite-who">
                <strong>{p.email}</strong>
                <small>{p.lastSignIn ? `Last signed in ${day(p.lastSignIn)}` : `Added ${day(p.invitedAt)} · hasn’t signed in yet`}</small>
              </span>
              {confirming === p.email ? (
                <span className="invite-actions">
                  <button type="button" className="danger" disabled={busy !== null} onClick={() => void remove(p.email)}>
                    {busy === p.email ? 'Removing…' : 'Remove and delete their plan'}
                  </button>
                  <button type="button" className="link" onClick={() => setConfirming(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <span className="invite-actions">
                  <button type="button" className="link" disabled={busy !== null} onClick={() => void issue(p.email)}>
                    {busy === p.email ? 'Working…' : 'New password'}
                  </button>
                  <button type="button" className="link danger-link" onClick={() => setConfirming(p.email)}>
                    Remove
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
