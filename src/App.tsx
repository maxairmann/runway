import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { addDays, todayISO, type ISODate } from './engine/dates';
import type { Trip } from './engine/types';
import { newId } from './data/ids';
import { useStore } from './data/store';
import { CloudGate, Welcome } from './components/Entry';
import { ForecastView } from './components/ForecastView';
import { Onboarding } from './components/Onboarding';
import { PeopleView } from './components/PeopleView';
import { SettingsView } from './components/SettingsView';
import { TripEditor } from './components/TripEditor';
import { TripsView } from './components/TripsView';

type Tab = 'forecast' | 'trips' | 'people' | 'settings';

const TABS: { id: Tab; label: string; icon: ReactElement }[] = [
  {
    id: 'forecast',
    label: 'Forecast',
    icon: <path d="M3 17l5-6 4 3 6-8M3 21h18" />,
  },
  {
    id: 'trips',
    label: 'Trips',
    icon: <path d="M4 7h16v4a2 2 0 000 4v4H4v-4a2 2 0 000-4zM14 7v12" />,
  },
  {
    id: 'people',
    label: 'People',
    icon: <path d="M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3 3-5 6-5s6 2 6 5M16 11a3 3 0 100-6M18 20c0-2-1-4-3-4.6" />,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4" />,
  },
];

export default function App() {
  const store = useStore();
  const { mode, household, update, choose, startLocal, cloud } = store;
  const [tab, setTab] = useState<Tab>('forecast');
  const [editor, setEditor] = useState<{ trip: Trip; isNew: boolean } | null>(null);
  const today: ISODate = useMemo(() => todayISO(), []);

  useEffect(() => {
    document.title = household ? `${household.name} – Runway` : 'Runway';
  }, [household]);

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

  const openTrip = (id: string) => {
    const trip = household.trips.find((t) => t.id === id);
    if (trip) setEditor({ trip, isNew: false });
  };
  const planTrip = (prefill?: { start: ISODate; end: ISODate; memberIds: string[] }) => {
    const start = prefill?.start ?? addDays(today, 30);
    setEditor({
      isNew: true,
      trip: {
        id: newId('trip'),
        title: '',
        start,
        end: prefill?.end ?? addDays(start, 4),
        memberIds: prefill?.memberIds ?? household.members.map((m) => m.id),
        hoursPerDay: null,
        status: 'tentative',
      },
    });
  };

  return (
    <div className={`shell tab-${tab}`}>
      {mode === 'demo' ? (
        <div className="demo-banner" role="note">
          <span>Demo with sample data. Edit anything; it resets when you ask.</span>
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
        {tab === 'forecast' ? (
          <ForecastView household={household} today={today} onOpenTrip={openTrip} onPlanTrip={() => planTrip()} onSeeTrips={() => setTab('trips')} />
        ) : null}
        {tab === 'trips' ? <TripsView household={household} today={today} onOpenTrip={openTrip} onPlanTrip={planTrip} /> : null}
        {tab === 'people' ? <PeopleView household={household} update={update} /> : null}
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
            update((h) => ({ ...h, trips: h.trips.filter((t) => t.id !== id) }));
            setEditor(null);
          }}
          onSave={(t) => {
            update((h) => ({ ...h, trips: h.trips.some((x) => x.id === t.id) ? h.trips.map((x) => (x.id === t.id ? t : x)) : [...h.trips, t] }));
            setEditor(null);
          }}
        />
      ) : null}
    </div>
  );
}
