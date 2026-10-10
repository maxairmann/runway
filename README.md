# Runway

**See how much PTO you'll have on any date, and whether a trip fits before you book it.**

Runway is a personal PTO forecaster. Enter your balance and how your employer accrues time off, then drag across the graph to try a trip. The app projects your balance day by day, under your employer's real rules, and tells you in one sentence whether the plan works. Planning with a partner? Add them and both balances share one graph.

It started as a Google Sheet my wife and I used to plan a year of time off. The sheet worked, but it ignored caps and year-end resets, only checked balances on paydays, and needed a second copy for a second person. Runway fixes all three.

**Try the demo:** open the app and choose *Try the demo with sample data*. No sign-up.

## What it does

- **The graph is the app.** Your balance for the next six months, a year, two years, or any dates you pick, in days (or hours), with your low point and cushion marked.
- **Add trips on the graph.** Press and hold, then drag across the days (on a computer, just drag). The line shows where your balance goes while you drag; let go to name the trip. Full, half, or partial days.
- **Real employer rules.** Weekly, biweekly, semi-monthly, monthly, or annual accrual; rate changes on a date; maximum balance; carryover cap with a reset date; borrowing below zero; US federal or common company holidays plus custom ones.
- **Try a trip before booking.** The trip editor shows each person's cost and remaining balance live, with a before/after chart, and flags anyone who would drop under their safety cushion or run out.
- **Earliest-date finder.** "When can we both take 10 workdays?" scans every start date and returns the first one that keeps everyone above their cushion, counting trips already planned.
- **Use-it-or-lose-it warnings.** "Jordan forfeits 78.7 h on Jan 1 unless those hours are used."
- **Paystub corrections.** Enter your real balance on any date and the forecast re-anchors there.
- **Add a partner (optional).** Each person keeps their own employer's rules on one graph; trips added on the graph ask who's going.
- **Shared plans.** Sign in with an email link, invite your partner with a one-time link, and edits sync live between phones.
- **Installable.** Add it to an Android or iPhone home screen; it opens full-screen and works offline.

## How the forecast works

The engine (`src/engine/forecast.ts`) is a pure, dependency-free TypeScript simulation that runs in the browser. For each person, each day:

```
balance(d) = min(maxBalance, balance(d−1) + accrual(d)) − hoursUsed(d) − forfeited(d)
```

Within a day: the year-end reset forfeits anything above the carryover cap, then accrual is added (clipped at the max balance, with lost hours logged), then time off is subtracted on each workday that isn't a holiday, then a paystub checkpoint overrides the result if there is one. Two people over two years is about 1,500 steps, so the whole forecast recomputes on every keystroke.

Dates are handled as whole UTC day numbers, so time zones and daylight saving never shift a day.

### Golden test

`src/engine/forecast.test.ts` replays the original spreadsheet (5.18 hours on 9/19/2026, 7.69 hours every other Saturday, five booked days) and checks the engine matches it on every payday through September 2028. It also checks what the sheet couldn't show: the real low point between paydays.

```
npm test
```

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| UI | React 19 + TypeScript, Vite | Fast to build, deploys anywhere as static files |
| Forecast | Plain TypeScript, no dependencies | Testable in isolation, runs offline |
| Chart | Hand-built SVG | Step lines, trip bands, cushion lines, and tap-to-inspect without a charting library |
| Sync | Supabase (Postgres, auth, realtime) | Email-link sign-in, row-level security, live updates |
| Hosting | Vercel | Static site, HTTPS, preview deploys |

**Data model.** A household's plan is one JSON document in `households.data`. Two people editing a vacation plan rarely collide, so saves are last-write-wins with a 700 ms debounce, and Supabase realtime pushes each save to the other device. Access control lives in Postgres: row-level security means you can only read or write households you're a member of, and joining requires a single-use invite code that expires in 14 days (`supabase/schema.sql`).

**Three modes.** *Demo* (sample data, resettable), *this phone* (localStorage, no account), and *shared* (Supabase). Without Supabase keys the app runs fully in the first two modes.

## Run it

```
npm install
npm run dev
```

Open the printed URL. To try it on your phone on the same Wi-Fi, run `npm run dev -- --host` and open the network URL.

## Turn on sharing (optional)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/schema.sql`.
3. Under Authentication → URL Configuration, set the Site URL to your deployed URL (and add `http://localhost:5173` for local testing).
4. Copy `.env.example` to `.env.local` and fill in the project URL and anon key from Project Settings → API.

## Deploy

1. Push the repo to GitHub.
2. Import it in Vercel. It detects Vite; the defaults are right.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under Settings → Environment Variables if you turned on sharing, then redeploy.

For a public demo link, deploy a second Vercel project from the same repo with `VITE_START_IN_DEMO=true` and no Supabase keys. Visitors land in the sample household, and nothing they do leaves their browser.

## Project layout

```
src/engine/     forecast engine, holidays, date math, tests
src/data/       app state, persistence, Supabase sync, demo data
src/components/ screens: forecast, trips, trip editor, people, settings
supabase/       database schema and security policies
public/         manifest, icons, service worker
```

## Not yet

- Home-screen widgets and push notifications
- Calendar export
- Shift schedules (10- and 12-hour days)
- Import directly from a spreadsheet
