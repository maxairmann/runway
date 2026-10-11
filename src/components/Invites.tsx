import { useEffect, useState } from 'react';
import { formatDate } from '../engine/dates';
import { listInvitees, removeInvitee, sendInvite, type Invitee } from '../data/sync';

const day = (iso: string) => formatDate(iso.slice(0, 10), 'medium');

/**
 * Admin only: invite people by email and see who has signed in. For anyone else the
 * endpoint answers 403 and this section doesn't render. Plans stay private either way.
 */
export function Invites() {
  const [people, setPeople] = useState<Invitee[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = () =>
    listInvitees()
      .then(setPeople)
      .catch((e: Error & { status?: number }) => {
        if (e.status === 403 || e.status === 404 || e.status === 501) setHidden(true);
        else setNote({ text: e.message, bad: true });
      });

  useEffect(() => {
    void load();
  }, []);

  if (hidden) return null;

  const invite = async (to: string) => {
    setBusy(to);
    setNote(null);
    try {
      const r = await sendInvite(to);
      setNote({ text: r.resent ? `Sent ${to} a new sign-in code.` : `Invited ${to}. They’ll get an email with a sign-in code.` });
      setEmail('');
      await load();
    } catch (e) {
      setNote({ text: (e as Error).message, bad: true });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (to: string) => {
    setBusy(to);
    setNote(null);
    try {
      await removeInvitee(to);
      setNote({ text: `Removed ${to}.` });
      setConfirming(null);
      await load();
    } catch (e) {
      setNote({ text: (e as Error).message, bad: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="invites">
      <h2>Invites</h2>
      <p className="hint">Only people you invite can sign in. Each person gets their own private plan; you see who’s joined, not their plans.</p>
      <form
        className="row end"
        onSubmit={(e) => {
          e.preventDefault();
          const to = email.trim().toLowerCase();
          if (to) void invite(to);
        }}
      >
        <label className="field">
          <span className="label">Email</span>
          <input id="invite-email" type="email" required autoComplete="off" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" className="primary" disabled={busy !== null || !email.trim()}>
          {busy === email.trim().toLowerCase() ? 'Sending…' : 'Send invite'}
        </button>
      </form>
      {note ? <p className={note.bad ? 'error' : 'ok-line'}>{note.text}</p> : null}

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
                <small>
                  {p.lastSignIn ? `Joined · last signed in ${day(p.lastSignIn)}` : `Invited ${day(p.invitedAt)} · hasn’t signed in yet`}
                </small>
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
                  {!p.lastSignIn ? (
                    <button type="button" className="link" disabled={busy !== null} onClick={() => void invite(p.email)}>
                      {busy === p.email ? 'Sending…' : 'Resend'}
                    </button>
                  ) : null}
                  <button type="button" className="link danger-link" onClick={() => setConfirming(p.email)}>
                    Remove
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="hint">The code in an invite works for an hour. After that, they can ask for a new one on the sign-in screen.</p>
    </section>
  );
}
