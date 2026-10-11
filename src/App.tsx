import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { addDays, formatRange, todayISO, type ISODate } from './engine/dates';
import type { Trip } from './engine/types';
import { newId } from './data/ids';
import { daysOffFromTrips, tripsFromDaysOff } from './engine/plan';
import { useStore } from './data/store';
import { CloudGate, Welcome } from './components/Entry';
import { Onboarding } from './components/Onboarding';
import { PlanView } from './components/PlanView';
import { RulesView } from './components/RulesView';
import { SettingsView } from './components/SettingsView';
import { TripEditor } from './components/TripEditor';
import { TripsView } from './components/TripsView';

type Tab = 'plan' | 'trips' | 'rules' | 'settings';

const TABS: { id: Tab; label: string; icon: ReactElement }[] = [
  { id: 'plan', label: 'Plan', icon: <path d="M5 5h14v15H5zM5 9h14M9 3v4M15 3v4M9 13h2M13 13h2M9 16h2" /> },
  { id: 'trips', label: 'Time off', icon: <path d="M4 7h16v4a2 2 0 000 4v4H4v-4a2 2 0 000-4zM14 7v12" /> },
  { id: 'rules', label: 'My rules', icon: <path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h3" /> },
  { id: 'settings', label: 'Settings', icon: <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4" /> },
];

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
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          Runway
        </span>
        <span className="household-name">{household.name}</span>
        {mode === 'cloud' ? <span className={`sync ${cloud.error ? 'bad' : ''}`}>{cloud.error ? 'Not saved' : cloud.saving ? 'Saving…' : 'Synced'}</span> : null}
      </header>

      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {t.icon}
            </svg>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <main className="content">
        {tab === 'plan' ? (
          <PlanView household={household} today={today} update={update} />
        ) : null}
        {tab === 'trips' ? <TripsView household={household} today={today} onOpenTrip={openTrip} onPlanTrip={planTrip} /> : null}
        {tab === 'rules' ? <RulesView household={household} update={update} /> : null}
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
