# Reminders & nudges (#13) — design

**Goal**: gentle, time-aware nudges for recurring life-rhythm things, surfaced during normal app use, with a depression-safe UX (free dismiss, no counters, no nagging). Implements roadmap item #13 ([`personal-utility-roadmap.md`](./personal-utility-roadmap.md)), reshaped after the user supplied five real examples that span more than the original "meals/cats/cleaning" framing.

**Status**: design approved via brainstorming; implementation deferred to a fresh session.

## Scope (locked)

Build **Kind A (scheduled cadence)** + **Kind B (in-session interval)**. Defer **Kind C (neglect/imbalance)** to its own follow-up design.

| Example | Kind | In MVP? |
|---|---|---|
| Stretch break (every 15–45 min, check in with body) | B interval | ✅ |
| Stop for meals (time-of-day window) | A cadence | ✅ |
| Check calendar (daily, before first event / evening) | A cadence | ✅ (time-based; calendar-anchoring deferred) |
| Call Dad (~weekly, may text first) | A cadence | ✅ (optional linked task) |
| Write fiction (haven't in months → imbalance) | C neglect | ⛔ deferred |

## Decisions (locked)

- **Separate `Reminder` entity** on a new `planner-reminders` storage key — *not* `Task.recurrence`. The tree (V→G→P→T) is untouched. The existing `Task.recurrence` + `checkRecurrence` "recreate completed task" flow is left as-is (orthogonal concern).
- **Surfacing**: a dismissible **banner** when something is due, during normal app use, + a **Reminders panel** to create/edit/enable/delete. One nudge shown at a time (queue the rest).
- **In-app only** — no push/OS notifications this iteration (roadmap: "no push at first"). Consequence: cadence nudges only appear while the app is open during their window. Stated as an accepted limitation.

## Data model

`src/types/planner.ts`:

```ts
export type ReminderWindow = 'morning' | 'midday' | 'evening' | 'anytime';

export type ReminderTrigger =
  | { kind: 'cadence'; everyDays: number; window?: ReminderWindow; time?: string /* 'HH:MM' */ }
  | { kind: 'interval'; minMinutes: number; maxMinutes?: number };

export interface Reminder {
  id: number;            // timestamp at creation, like other entities
  name: string;          // banner title, e.g. "Stretch & check in"
  message?: string;      // optional longer prompt in the banner
  trigger: ReminderTrigger;
  enabled: boolean;      // toggle off without deleting
  lastDoneAt?: string;   // ISO; set by "Did it"
  lastFiredAt?: string;  // ISO; cadence "shown/dismissed today" + interval pacing
  snoozedUntil?: string; // ISO; banner suppressed until this time
  linkedTaskId?: number; // optional; for multi-step ones like "Call Dad"
}
```

Window → hour ranges (local time), defined in one place:
- `morning` 06:00–11:00 · `midday` 11:00–15:00 · `evening` 17:00–22:00 · `anytime` all day.

Example reminders:
- Stretch: `{ kind:'interval', minMinutes:15, maxMinutes:45 }`
- Lunch: `{ kind:'cadence', everyDays:1, window:'midday' }`
- Check calendar: `{ kind:'cadence', everyDays:1, time:'08:30' }` (or `window:'evening'`)
- Call Dad: `{ kind:'cadence', everyDays:7, window:'anytime' }`, `linkedTaskId` optional

## Due logic — `src/utils/reminderLogic.ts` (pure, unit-tested)

`computeDueReminders(reminders: Reminder[], now: Date, appFocused: boolean): Reminder[]`

For each reminder, skip if `!enabled` or `snoozedUntil` is in the future. Then:

- **cadence**: due when
  1. never done, or `now − lastDoneAt ≥ everyDays` (a day late is fine — no nagging, just "due"), **and**
  2. `now` is within `window` (or past `time` if set; `anytime`/no-time ⇒ condition (2) is always true), **and**
  3. not already dismissed today — i.e. `lastFiredAt` is not today. (Dismissing hides it until tomorrow; "Did it" advances `lastDoneAt`.)
- **interval**: due when `appFocused` **and** (`lastFiredAt` is unset or `now − lastFiredAt ≥ minMinutes`). `maxMinutes` randomizes the *next* interval so it doesn't feel mechanical.

Returns due reminders; the banner shows the first, others queue.

`nextIntervalMinutes(trigger)` → random in `[minMinutes, maxMinutes]` (or `minMinutes` if no max).

## Surfacing

### `useReminders` hook (`src/hooks/useReminders.ts`)
- Owns the `reminders` array (loaded/persisted via `window.storage` on `planner-reminders`, mirroring `usePlannerData`'s pattern).
- A `setInterval` ticking every ~30–60s recomputes due reminders; also listens to `visibilitychange` so interval nudges only count time while the tab is focused.
- Exposes: `reminders`, CRUD setters, `dueReminder` (the head of the queue), and actions `markDone(id)` (sets `lastDoneAt=now`, clears from queue), `snooze(id, minutes)` (`snoozedUntil=now+minutes`), `dismiss(id)` (cadence: `lastFiredAt=now` ⇒ hidden till tomorrow; interval: reset pacing from now).

### `ReminderBanner` (`src/components/Planner/ReminderBanner.tsx`)
- Rendered near the top of `DayPlanner`. Shows `dueReminder.name` (+ `message`), with **Did it** / **Snooze** / **✕**.
- Gentle styling — *not* red/alert. No "overdue", no counts.
- Snooze default: 30 min (or "until next window" for windowed cadence).

### `RemindersPanel` (`src/components/Planner/RemindersPanel.tsx`)
- A new **Reminders** tab alongside Plan / Data / Map / History (discoverable; consistent with existing nav).
- Lists reminders with an enable toggle, edit, delete. Create form: name, message, trigger kind, and kind-specific fields (everyDays + window/time, or min/max minutes).

## H3 compliance (depression-safe) — hard rules

- Dismiss is **one tap** and free; **no** count of dismissals or skips is stored or shown anywhere.
- **No** "you haven't done this in N days", no streaks, no red/overdue styling. Due simply means "offered."
- Snooze and disable are one action each.
- One nudge at a time (no wall of overdue items).
- Copy is invitational ("Time to check in with your body?"), never imperative/guilt-laden.

## Testing (TDD)

- `src/utils/reminderLogic.test.ts`: window mapping; cadence due/not-due across (never done / done today / done > everyDays ago / outside window / dismissed today / snoozed / disabled); interval due/not-due across (appFocused false, < min, ≥ min); `nextIntervalMinutes` bounds.
- `ReminderBanner.test.tsx`: renders due reminder; Did it / Snooze / Dismiss fire the right callbacks; renders nothing when no due reminder.
- `RemindersPanel.test.tsx`: create (each trigger kind), edit, toggle enabled, delete.
- `useReminders` — light test of done/snooze/dismiss state transitions (timer behavior can be exercised via `vi.useFakeTimers`).

## Out of scope (this iteration)

- **Calendar anchoring** for "check calendar before first event" — no calendar integration exists; model as a daily `time`/`window`. Future: read the user's calendar to anchor.
- **Neglect/imbalance detector (Kind C)** — write-fiction; own design pass (likely tied to workType balance over a long window).
- **Push / OS notifications** — in-app only for now.
- **Multi-step automation** ("text Dad before calling") — just a reminder; `linkedTaskId` is the only nod to it.
- **Multiple windows per reminder** (e.g. one "meals" with 3 windows) — create separate reminders instead.

## Effort

Roadmap budget ~10–18h. This MVP (model + pure due-logic + hook + banner + panel + tests) sits in that range; interval (B) is the cheap part, cadence windows + panel CRUD are the bulk.
