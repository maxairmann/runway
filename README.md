# Runway

**Tap the days you want off and see right away whether you'll have the PTO.**

Runway is a personal PTO planner. Enter your balance and how your employer accrues time off. Then pick days on a calendar: each workday shows how many days you'll have banked that day, and any day that would put you below zero later turns red. Tap again for a half day; save and back-to-back days become one trip.

It started as a Google Sheet my wife and I used to plan a year of time off. The sheet listed every payday and its balance, but it ignored caps and year-end resets and only checked the balance on paydays. Runway checks every day, under your employer's real rules.

**Try the demo:** open the app and choose *Try the demo with sample data*. No sign-up.

## What it does

- **Plan on a calendar.** Tap workdays to take them off; tap again for a half day. Weekends and holidays are free. On a phone you see one month plus the next month's first week; on a laptop, three months.
- **Know before you book.** Every workday shows the days you'll have banked. Days that would put you below zero, now or after a later trip, turn red, and the summary names the date it would break.
- **Real employer rules.** Weekly, biweekly, semi-monthly, monthly, or annual accrual; rate changes on a date; maximum balance; carryover cap with a reset date; borrowing below zero.
- **Holidays labeled, not assumed.** US holidays (and optionally Jewish holidays) are labeled on the calendar but stay ordinary workdays until you mark the ones your employer actually gives off. Veterans Day can be a workday for you and a paid day off for someone else.
- **Sick days.** Press and hold a day (or right-click) to mark it sick. Sick days come out of PTO by default; if your employer gives sick time separately, turn on a separate sick balance, earned each payday or granted once a year (optionally resetting), with its own running balance.
- **Jewish holidays (optional).** Rosh Hashanah through Purim, computed from the Hebrew calendar (`src/engine/hebrew.ts`, tested against published dates), labeled on the calendar so you can plan around them.
- **Use-it-or-lose-it warnings.** "You forfeit 9.3 days on Jan 1 unless you use them first," updated as you pick days.
- **When can I go?** Ask for N workdays and get the first stretch that fits, counting trips already planned.
- **Paystub corrections.** Enter your real balance on any date and the forecast re-anchors there.
- **Undo.** Deleting a trip or clearing your picks can be undone.
- **Accounts (invite-only).** People request an account from the landing page; the admin approves it and sends a temporary password, and they choose their own on first sign-in. They stay signed in on that device. No email service needed.
- **Installable.** Add it to an Android or iPhone home screen; it opens full-screen and works offline.

## How the forecast works

The engine (`src/engine/forecast.ts`) is a pure, dependency-free TypeScript simulation that runs in the browser. For each person, each day:

```
balance(d) = min(maxBalance, balance(d−1) + accrual(d)) − hoursUsed(d) − forfeited(d)
```

Within a day: the year-end reset forfeits anything above the carryover cap, then accrual is added (clipped at the max balance, with lost hours logged), then time off is subtracted on each workday that isn't a holiday, then a paystub checkpoint overrides the result if there is one.

The calendar asks the engine, for every workday on screen, "would taking this day still keep me at or above zero for the next two years?" That's about 70 two-year simulations per tap, so the daily loop avoids allocating dates and caches holiday sets; a full check takes a few milliseconds.

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
| Sync | Supabase (Postgres, auth, realtime) | Email-link sign-in, row-level security, live updates across devices |
| Hosting | Vercel | Static site, HTTPS, preview deploys |

**Data model.** A plan is one JSON document. Saves are last-write-wins with a 700 ms debounce, and Supabase realtime pushes each save to your other devices. Access control lives in Postgres: row-level security means you can only read or write your own plan (`supabase/schema.sql`).

**Modes.** *Demo* (sample data, resettable) and *your account* (Supabase). Without Supabase keys, the app keeps plans on the device instead.

## Run it

```
npm install
npm run dev
```

Open the printed URL. To try it on your phone on the same Wi-Fi, run `npm run dev -- --host` and open the network URL.

## Turn on accounts (invite-only)

Accounts are invite-only. Anyone can ask for one from the landing page (`api/request.js` stores the email); the admin sees a badge, approves or declines in Settings → People, and gets a temporary password to pass on (text it, say it). The person chooses their own password the first time they sign in and stays signed in on that device. Nothing is emailed, so there's no email service to set up. Each person's plan is private.

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/schema.sql`.
3. Under Authentication → Users, add yourself: Add user → Create new user, with your email and a password, and auto-confirm on.
4. Turn off "Allow new users to sign up" (Authentication → Sign In / Providers), so only people the admin adds can get in.
5. Set the environment variables (in Vercel, or `.env.local` for the app):
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the publishable key) from Project Settings → API Keys.
   - `SUPABASE_SERVICE_ROLE_KEY`: the secret key. Server only, for `api/invite.js`; never prefix it with `VITE_`.
   - `ADMIN_EMAIL`: the email you sign in with. It's only an identifier; nothing is sent to it.

Invites go through a Vercel serverless function (`api/invite.js`). It checks the caller's sign-in against `ADMIN_EMAIL`, then creates the account or resets its password. `npm run dev` doesn't run it, so the Invites section only appears on Vercel (or under `vercel dev`).

## Deploy

1. Push the repo to GitHub.
2. Import it in Vercel. It detects Vite; the defaults are right.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under Settings → Environment Variables if you turned on sync, then redeploy.

For a public demo link, deploy a second Vercel project from the same repo with `VITE_START_IN_DEMO=true` and no Supabase keys. Visitors land in the sample household, and nothing they do leaves their browser.

## Project layout

```
api/            invite endpoint (Vercel serverless function)
src/engine/     forecast engine, planning (picks to trips), holidays, date math, tests
src/data/       app state, persistence, Supabase sync, demo data
src/components/ screens: plan calendar, trips, trip editor, rules, settings
supabase/       database schema and security policies
public/         manifest, icons, service worker
```

## Not yet

- Home-screen widget and push notifications
- Calendar export
- Shift schedules (10- and 12-hour days)
- Import directly from a spreadsheet
