import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, formatRange, todayISO, type ISODate } from './engine/dates';
import type { Trip } from './engine/types';
import { newId } from './data/ids';
import { daysOffFromTrips, tripsFromDaysOff } from './engine/plan';
import { useStore } from './data/store';
import { CloudGate, Welcome } from './components/Entry';
import { CorgiMark } from './components/Corgi';
import { Onboarding } from './components/Onboarding';
import { PlanView } from './components/PlanView';
import { SettingsView } from './components/SettingsView';
import { TripEditor } from './components/TripEditor';
import { TripsView } from './components/TripsView';

type Tab = 'plan' | 'trips' | 'settings';


interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

export default function App() {
  const store = useStore();
  const { mode, household, update, choose, startLocal, cloud } = store;
  const [tab, setTab] = useState<Tab>('plan');
  const [editor, setEditor] = useState<{ trip: Trip; isNew: boolean } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const today: ISODate = useMemo(() => todayISO(), []);

  useEffect(() => {
    document.title = household ? `${household.name} – Runway` : 'Runway';
  }, [household]);

  const showToast = (message: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, undo });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };

  if (mode === null) {
    return <Welcome cloudConfigured={store.cloudConfigured} hasLocal={store.localPlan !== null} onChoose={choose} />;
  }
  if (mode === 'local' && !household) {
    return <Onboarding onBack={() => choose(null)} onDone={(h) => startLocal(h)} />;
  }
  if (mode === 'cloud' && (cloud.phase !== 'ready' || !household)) {
    return <CloudGate store={store} onBack={() => choose(null)} />;
  }
  if (!household) return null;

  const me = household.members[0];

  const openTrip = (id: string) => {
    const trip = household.trips.find((t) => t.id === id);
    if (trip) setEditor({ trip, isNew: false });
  };
  const planTrip = (prefill?: { start: ISODate; end: ISODate }) => {
    const start = prefill?.start ?? addDays(today, 30);
    setEditor({
      isNew: true,
      trip: {
        id: newId('trip'),
        title: '',
        start,
        end: prefill?.end ?? addDays(start, 4),
        memberIds: [me.id],
        hoursPerDay: null,
        dayFraction: 1,
        status: 'confirmed',
      },
    });
  };

  return (
    <div className={`shell tab-${tab}`}>
      {mode === 'demo' ? (
        <div className="demo-banner" role="note">
          <span>You’re looking at sample data.</span>
          <button type="button" className="link" onClick={() => choose(null)}>
            Start my own plan
          </button>
        </div>
      ) : null}

      <header className="topbar">
        <span className="brand" aria-hidden="true">
          <CorgiMark className="brand-corgi" />
          Runway
        </span>
        <span className="household-name">{household.name}</span>
        {mode === 'cloud' ? <span className={`sync ${cloud.error ? 'bad' : ''}`}>{cloud.error ? 'Not saved' : cloud.saving ? 'Saving…' : 'Synced'}</span> : null}
      </header>

      <nav className="tabs" aria-label="Sections">
        <button
          type="button"
          className={`side list-tab ${tab === 'trips' ? 'on' : ''}`}
          aria-current={tab === 'trips' ? 'page' : undefined}
          aria-label="Time off as a list"
          onClick={() => setTab('trips')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" />
          </svg>
          <span>List</span>
        </button>
        <button
          type="button"
          className={`home ${tab === 'plan' ? 'on' : ''}`}
          aria-current={tab === 'plan' ? 'page' : undefined}
          aria-label="Calendar"
          onClick={() => setTab('plan')}
        >
          <span className="home-disc">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 5h14v15H5zM5 9h14M9 3v4M15 3v4" />
              <path d="M8.5 13h2M13.5 13h2M8.5 16.5h2" />
            </svg>
          </span>
          <span>Calendar</span>
        </button>
        <button
          type="button"
          className={`side ${tab === 'settings' ? 'on' : ''}`}
          aria-current={tab === 'settings' ? 'page' : undefined}
          aria-label="Settings"
          onClick={() => setTab('settings')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4" />
          </svg>
          <span>Settings</span>
        </button>
      </nav>

      <main className="content">
        {tab === 'plan' ? (
          <PlanView household={household} today={today} update={update} onShowList={() => setTab('trips')} />
        ) : null}
        {tab === 'trips' ? <TripsView household={household} today={today} onOpenTrip={openTrip} onPlanTrip={planTrip} /> : null}
        {tab === 'settings' ? <SettingsView store={store} /> : null}
      </main>

      {editor ? (
        <TripEditor
          key={editor.trip.id}
          household={household}
          trip={editor.trip}
          isNew={editor.isNew}
          today={today}
          onClose={() => setEditor(null)}
          onDelete={(id) => {
            const gone = household.trips.find((t) => t.id === id);
            update((h) => ({ ...h, trips: h.trips.filter((t) => t.id !== id) }));
            setEditor(null);
            if (gone) showToast(`Deleted ${formatRange(gone.start, gone.end)}.`, () => update((h) => ({ ...h, trips: [...h.trips, gone] })));
          }}
          onSave={(t) => {
            update((h) => {
              const others = h.trips.filter((x) => x.id !== t.id);
              const days = { ...daysOffFromTrips(others, me), ...daysOffFromTrips([t], me) };
              return { ...h, trips: tripsFromDaysOff(days, me, () => newId('trip')) };
            });
            setEditor(null);
          }}
        />
      ) : null}

      {toast ? (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.message}</span>
          {toast.undo ? (
            <button
              type="button"
              className="link"
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
