import { useRef, useState } from 'react';
import { formatDate } from '../engine/dates';
import type { Household } from '../engine/types';
import type { Store } from '../data/store';

function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function looksLikeHousehold(x: unknown): x is Household {
  const h = x as Household;
  return !!h && typeof h.name === 'string' && Array.isArray(h.members) && Array.isArray(h.trips);
}

export function SettingsView({ store }: { store: Store }) {
  const { household, mode, cloud, cloudActions, cloudConfigured, update, choose, resetDemo, startLocal } = store;
  const [invite, setInvite] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  if (!household) return null;

  const makeInvite = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const link = await cloudActions.invite();
      setInvite(link);
      if (navigator.share) {
        await navigator.share({ title: 'Join our PTO plan', text: 'Plan our time off with me in Runway:', url: link }).catch(() => undefined);
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings">
      <h1>Settings</h1>

      <section>
        <h2>Plan</h2>
        <label className="field">
          <span className="label">Plan name</span>
          <input value={household.name} onChange={(e) => update((h) => ({ ...h, name: e.target.value }))} />
        </label>
      </section>

      <section>
        <h2>Where it’s saved</h2>
        {mode === 'demo' ? (
          <>
            <p>This is the demo. Changes stay in this browser and you can reset them anytime.</p>
            <div className="button-row">
              <button type="button" onClick={resetDemo}>
                Reset the demo
              </button>
              <button type="button" className="primary" onClick={() => choose(null)}>
                Start my own plan
              </button>
            </div>
          </>
        ) : mode === 'local' ? (
          <>
            <p>Saved on this phone only. Nothing leaves this device.</p>
            {cloudConfigured ? (
              <button type="button" className="primary" onClick={() => choose('cloud')}>
                Share with a partner
              </button>
            ) : (
              <p className="hint">Sharing isn’t switched on for this copy of the app. Back up your plan below to move it between devices.</p>
            )}
          </>
        ) : (
          <>
            <p>
              Shared and synced{cloud.email ? `, signed in as ${cloud.email}` : ''}.{' '}
              {cloud.saving ? 'Saving…' : cloud.savedAt ? `Last saved ${formatDate(cloud.savedAt.slice(0, 10), 'medium')}.` : ''}
            </p>
            {cloud.error ? <p className="error">{cloud.error}</p> : null}
            <div className="button-row">
              <button type="button" className="primary" disabled={busy} onClick={() => void makeInvite()}>
                Invite your partner
              </button>
              <button type="button" onClick={() => void cloudActions.signOut()}>
                Sign out
              </button>
            </div>
            {invite ? (
              <div className="invite">
                <p>Send this link. It works once and expires in 14 days.</p>
                <input readOnly value={invite} onFocus={(e) => e.target.select()} aria-label="Invite link" />
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(invite).then(() => setMessage('Link copied.'));
                  }}
                >
                  Copy link
                </button>
              </div>
            ) : null}
            {message ? <p className="hint">{message}</p> : null}
          </>
        )}
      </section>

      <section>
        <h2>Put it on your home screen</h2>
        <ul className="plain-list steps">
          <li>
            <strong>Android, Chrome:</strong> menu (⋮), then Install app or Add to Home screen.
          </li>
          <li>
            <strong>iPhone, Safari:</strong> Share, then Add to Home Screen.
          </li>
        </ul>
      </section>

      <section>
        <h2>Backup</h2>
        <p className="hint">A backup is a small file with everyone’s rules and trips. Restoring one replaces this plan.</p>
        <div className="button-row">
          <button type="button" onClick={() => download(`${household.name.replace(/[^\w-]+/g, '-') || 'runway'}-backup.json`, JSON.stringify(household, null, 2))}>
            Download backup
          </button>
          <button type="button" onClick={() => file.current?.click()}>
            Restore from backup
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const parsed: unknown = JSON.parse(await f.text());
                if (!looksLikeHousehold(parsed)) throw new Error('That file isn’t a Runway backup.');
                if (mode === 'local') startLocal(parsed);
                else update(() => ({ ...parsed, id: household.id }));
                setMessage(`Restored ${parsed.name}.`);
              } catch (err) {
                setMessage((err as Error).message);
              }
            }}
          />
        </div>
      </section>

      {mode !== 'demo' ? (
        <section>
          <h2>Switch</h2>
          <div className="button-row">
            <button type="button" onClick={() => choose('demo')}>
              Open the demo
            </button>
            <button type="button" className="ghost" onClick={() => choose(null)}>
              Back to the start screen
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
