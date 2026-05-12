**Goal**: Implement the multisemantic v0.3 MVP scope (`docs/multisemantic_v0_3_dayplanner.md` §8) using the UI substrate chosen in `docs/decisions/001-multisemantic-ui-substrate.md`.
**Project state**: Phases 0–5 shipped on `dev`. MVP complete; fast-follows (lineage-repair wizard, open-loop tray, archive view, review mode) remain available pending need.
**Task status**: All five phases complete. Plan edits below reflect what actually shipped.

## What shipped in Phases 0–5 (vs. plan)

Cross-cutting facts the later phases should treat as established:

- **`LINEAGE_LEVELS` constant** (`multisemantic-db.js:12`) is the single source of truth on the server side. On the client, **`LINEAGE_KEYS`** (`src/services/lineageKeys.ts:4`) is the TS twin used by retrieval, the tool handler, and any future Phase 4 client that iterates lineage fields. Keep both in sync if the list ever changes; do not redefine the four levels anywhere else.
- **Schema additions beyond spec**: `transcript_text` is a denormalized FTS-friendly column (not `json_extract`); `deleted_at` already exists on `segments`. Phase 4 merge/split therefore needs **no migration**.
- **FTS5 escaping** (`escapeFtsQuery` in `multisemantic-db.js:249`) wraps each whitespace-delimited token as a quoted phrase, so arbitrary user/LLM text (identifiers, punctuation, ∀) flows safely through `recall_segments`. Don't re-implement.
- **`focusKey()` helper** (`utils/ids.ts:31`) produces a stable string from a `ResolvedFocus`. Used by Phase 1 for thread rotation. Phase 3 did NOT end up using it: a retrieval-result cache was attempted but unreachable (every send appends a new user message → key always changes) and was removed during the post-review simplification.
- **`lineageFromResolved()` helper** (`src/utils/focus.ts`) — single producer of `SegmentLineage` from a `ResolvedFocus`. Consumed by `useChatSummarizer` (segment write) AND `multisemanticRetrieval` (search query). Reuse in Phase 4 anywhere lineage is built from focus.
- **Segment POST is fire-and-forget** (`useChatSummarizer.ts:73`): `fetch(...).catch(console.error)`, never awaited. `retrieval_feedback` POST adopts the same pattern (`multisemanticRetrieval.ts:recordRetrievalFeedback`). Phase 4 merge/split POSTs should follow the same rule.
- **`insertSegment` returns `{segment, inserted}`** (`multisemantic-db.js:150`) and uses `INSERT OR IGNORE`. Phase 4 merge/split endpoints should mirror this contract.
- **`buildSystemContext` signature** (`src/services/aiContext.ts`) is now `(conversation, data, { mode?, focus?, retrieved? })` — an options object, not positional. Phase 4 has no direct interaction with this, but any tests that touch it should use the options form.
- **`Message.retrievalState`** (`src/services/types.ts`) carries `{segmentIds, lineage, freshness}` and is stashed on assistant turns post-injection. **Phase 4's `LineageBreadcrumb` reads from here, not LLM self-report.** This is the H7' load-bearing wire (decision 001 consequences §4). It is `undefined` when retrieval didn't fire or returned nothing — render accordingly.
- **Endpoints already live**: `POST /api/segments`, `GET /api/segments/search`, `GET /api/segments/counts` (signature: `?level=X&ids=a,b,c`), `POST /api/retrieval_feedback` (preferred body: `{query, cited_ids, uncited_ids}`; legacy `{query, segment_ids, helpful}` still works), `POST /api/segments/merge`, `POST /api/segments/split`, `GET /api/segments/eval-snapshot?since=&until=`. Phase 4's `useSegmentCounts` consumes the counts endpoint as-is.
- **`recall_segments` tool** (`src/services/toolRegistry.ts`) returns summaries-only by default; pass `includeTranscript: true` to attach transcripts. The API itself always returns full segments — the tool reshapes the LLM-facing payload.
- **`enableRelevantPastContext` toggle** lives on `LLMConfig` (persisted via `useLLMConfig` localStorage) and is exposed in `SettingsModal`. Default **off**. Decision doc 002 has shipped; the toggle is now gated on the corpus-size trigger in that doc's §Window (≥30 segments with non-empty lineage OR lineage-repair wizard) rather than on the doc itself.
- **Top-K is hardcoded to 3** (`multisemanticRetrieval.ts:TOP_K`) for system-prompt injection — matches spec §10.1 default. `recall_segments` tool calls accept their own `limit` (default 10).
- **Citation heuristic** (`detectCitedSegments` in `multisemanticRetrieval.ts`) — literal segment-id mention OR ≥20-char substring of segment transcript appearing in assistant text. Iterates 20-char windows of (typically shorter) assistant text. Post-Phase-5, `recordRetrievalFeedback` is fire-and-forget on **every** retrieval-augmented turn (not just turns with citations) — the uncited segments are recorded with `helpful=0` so the §6.3 denominator is honest.
- **Empirical corpus today: 0 segments**. No `logs/chat_archive_*.jsonl` exist yet, so the cold-start importer ran with no input. With the toggle still defaulting off, retrieval does not fire in normal use; the snapshot endpoint correctly returns zeros. Window-opening criteria are pre-registered in `docs/decisions/002-multisemantic-retrieval-eval.md` §Window — the `Window opened: <unset>` line is the trigger to flip on.
- **`buildSearchUrl` is the canonical FTS URL builder** (`src/services/multisemanticRetrieval.ts`). Exported during Phase 4's /simplify pass so three call sites converge: retrieval-injection (`recallRelevantSegments`), the `recall_segments` tool, and `SegmentPopover`. Any future search-fronting UI should call it rather than rebuilding the query string.
- **`makeSegmentId` is the canonical server-side segment id generator** (`multisemantic-db.js`): `seg-${randomUUID()}`. Used by `mergeSegments`, `splitSegment`, and `scripts/import_archives.js`. Don't reinline `seg-${randomUUID()}` anywhere.
- **Custom-node factoring**: a single `BaseNode` (`src/components/Planner/nodes/BaseNode.tsx`) with a `showBadge` prop drives all four lineage levels. `GraphView.tsx`'s module-scope `nodeTypes` map registers four inline arrow components — adding a node type (or moving badges to Value/Goal in the fast-follow) is a one-line change to that map, not a new file.
- **Popover anchor is mouse coords**, not xyflow node ref. `SegmentPopover` accepts `{x, y}` captured from the badge click's `event.clientX/Y`. Phase 5 / fast-follows that need to open the popover programmatically (e.g., a breadcrumb-click → popover deep-link) will need a different anchor strategy (probably xyflow `useReactFlow().getNode(id)` → DOM rect).
- **`useSegmentCounts` is dedupe-stable** (`src/hooks/useSegmentCounts.ts`): on each poll it shallow-compares before calling `setCounts`, so unchanged results don't propagate identity churn into `useGraphData` (which would otherwise re-run dagre layout every poll). Callers can wire it without worrying about thrashing.
- **`/api/segments/merge` and `/api/segments/split` endpoints**: atomic via `db.transaction`. Inputs are soft-deleted (`deleted_at`), new segments inherit lineage/thread_id/archive_file from the first input. Return shape mirrors `insertSegment`: `{success, segment, mergedFrom}` for merge, `{success, segments, splitFrom}` for split. Both go through the `MULTISEMANTIC_LOCK_KEY` lock.
- **`recordRetrievalEvent(db, {query, citedIds, uncitedIds, contributingIndexes?})`** (`multisemantic-db.js`) is the canonical retrieval-event recorder. One `db.transaction`, one shared `retrieved_at` across cited (helpful=1) and uncited (helpful=0) rows — that shared timestamp is load-bearing for the §6 snapshot. Legacy `recordRetrievalFeedback({segmentIds, helpful})` now delegates to it; new code should call `recordRetrievalEvent` directly.
- **`getEvalSnapshot(db, {since?, until?})`** (`multisemantic-db.js`) is a single SQL query using `COUNT(DISTINCT CASE WHEN helpful=1 THEN ... END)` to compute both `events_total` and `events_cited` in one pass. Schema now carries `idx_rf_retrieved_at` so the window filter is index-backed.
- **`LineageBreadcrumb` renders inside a `<Fragment key={idx}>`** in `DayPlanner.tsx`'s message map — no wrapper div. Only fires when `message.retrievalState?.segmentIds.length > 0`.
- **§9 tests already shipped** (move out of later-phase test lists):
  - Phase 0: `fts-finds-newly-written-segment`, `fts-tokenizer-handles-identifiers`, `lineage-filter-returns-only-matching-segments`.
  - Phase 1: `summarization-produces-segment-with-lineage-from-focus-state`, `archive-write-precedes-segment-insert`.
  - Phase 2: `cold-start-import-is-idempotent`.
  - Phase 3: `recall_segments` tool roundtrip (summaries default + transcript opt-in + lineage filter passthrough), `buildSystemContext` injection on/off, retrieval lineage-filter query construction, `Message.retrievalState` stash, citation-heuristic feedback POST, `/api/retrieval_feedback` insert + reject.
  - Phase 4: merge endpoint (concat transcripts + soft-delete inputs + reject malformed), split endpoint (boundary + soft-delete + reject out-of-range), `useSegmentCounts` (per-level fetch + refetch + empty short-circuit), `SegmentPopover` (lineage-filtered fetch + Merge enables only with ≥2 selected + POSTs to /merge), `LineageBreadcrumb` (names from current planner state + segment count + empty-state + partial lineage), `useGraphData` segmentCount threading.
  - Phase 5: `/api/retrieval_feedback` new-shape POST roundtrip (cited+uncited atomically recorded with shared timestamp), new-shape both-arrays-empty rejection, `/api/segments/eval-snapshot` empty-corpus zeros, multi-turn cite-rate computation, since/until window filter. Client side: `recordRetrievalFeedback` posts cited_ids on citation AND posts uncited_ids when nothing cited (implicit-negative signal for §6.2).

---

## Inputs

- **Spec**: `docs/multisemantic_v0_3_dayplanner.md` (§8 MVP scope is the contract).
- **UI decision**: `docs/decisions/001-multisemantic-ui-substrate.md` (Cluster E, ~85% confidence).
- **DD exploration**: `docs/working/multisemantic-ui-affordances-divergent.md` (reference for pruned alternatives if a sub-decision arises).

## Codebase landmarks (verified against current state)

- `storage-server.js` — Express on 3002; per-key locks. New SQLite handle + `/api/segments` endpoint land here.
- `src/hooks/useChatSummarizer.ts:29-92` — summarization fires `/api/log/archive`; the segment write hook attaches *after* that POST.
- `src/services/aiContext.ts` — `buildSystemContext` assembles system prompt; injects `RELEVANT PAST CONTEXT:` block. Mode-aware visibility filtering already exists.
- `src/services/toolRegistry.ts` — single tool registry (spec mentions a stale `plannerTools.ts` path; the registry is the real target). `recall_segments` registers here.
- `src/components/Planner/GraphView.tsx` — uses default xyflow nodes with no `nodeTypes`. Custom node components must be introduced for segment-count badges.
- `src/hooks/useGraphData.ts` — produces nodes/edges; needs to thread `type` and segment counts into node `data`.
- `src/utils/focus.ts` — `resolveEffectiveFocus`. Called once more during summarize to populate `lineage`.
- `src/services/types.ts` — `Message` type. `id` needs to be populated at producer time, not via migration.

---

## Phase 0 — Substrate setup (no behavioral change) — **SHIPPED** (`f193840`)

Goal: dependency in, schema present, `/api/segments` exists but unused.

**Deviations from this plan that shipped intentionally**: `transcript_text` denormalized for FTS instead of `json_extract`; `deleted_at` added pre-emptively for Phase 4; per-token FTS5 phrase escaping; explicit `synchronous = NORMAL` pragma.

1. Add `better-sqlite3` to `package.json`. Note native compile step in CLAUDE.md if it bites.
2. At `storage-server.js` startup, open `data/multisemantic.sqlite`, run schema from spec §3.3 (segments, segments_fts trigram, segments triggers, retrieval_feedback). Idempotent: only run `CREATE TABLE IF NOT EXISTS`.
3. Mirror existing rollback discipline: write `multisemantic.sqlite.last-good` snapshot on server startup after migrations, **and** at least once per 24 hours during long-running sessions. Implementation: lazy check on segment-insert path — if the last-good file's mtime is >24h old, snapshot before inserting. Cheap (a stat call) and avoids needing a scheduled task.
4. Add `/api/segments` POST and `/api/segments/search` GET endpoints. Stub bodies: POST inserts a segment row, GET runs BM25 with optional lineage `AND`. No frontend caller yet.
5. Tests: `storage-server.test.js` additions for schema creation, segment insert/select roundtrip, FTS finds inserted segment (covers `fts-finds-newly-written-segment` from §9).

**Gate**: tests pass; existing planner-JSON flow unaffected; SQLite file appears in `data/` after startup.

## Phase 1 — Segment write path (closes spec §4.3, §5) — **SHIPPED** (`2a72dc2`)

Goal: every summarization event produces a `segments` row.

**Deltas worth carrying forward**:
- Segment POST is fire-and-forget; archive POST remains awaited (we need its `archive_file` response field).
- `archive_file` is read from the server's `/api/log/archive` response, not synthesized client-side — avoids client/server midnight-UTC drift.
- `FOCUS_DEBOUNCE_TURNS = 2` lives at the top of `usePlannerAI.ts:15`. The debounce mechanism uses three refs (`lastFocusKeyRef`, `pendingFocusKeyRef`, `pendingFocusTurnsRef`); empty `focusKey()` is a no-op so off-topic turns don't reset the counter.

1. In `useChatSummarizer.summarizeConversation`, after the existing `/api/log/archive` POST:
   - Resolve effective focus via `resolveEffectiveFocus` over `summarizeSlice`.
   - POST to `/api/segments` with `{id, thread_id, transcript, summary, lineage, archive_file}`.
   - Attach the returned `id` onto the in-conversation summary message's `summaryData.segmentId` so future tool calls can re-fetch.
2. Introduce `thread_id` as conversation-level state — `useState` in `usePlannerAI`. **Rotates on focus change** (when `resolveEffectiveFocus` output differs from the previous turn's focus), not on conversation clear. Threaded into `useChatSummarizer` via prop (don't reach for context). Risks to watch (per user direction): (a) thread fragmentation if focus thrashes — keep a debounce or only rotate when the new focus persists ≥2 turns; (b) latency on focus change if rotation does anything heavy — keep rotation to a UUID assignment only, defer any segment-store work to the next summarization event.
3. Fix `Message.id` backfill: ensure user/assistant message producers (chat append paths) assign a stable id at creation. Touch `usePlannerAI` send path and `useChatSummarizer` summary-message construction. Do not run a migration — accept that old in-state messages lack ids.
4. Tests:
   - `summarization-produces-segment-with-lineage-from-focus-state` (§9)
   - `archive-write-precedes-segment-insert` (§9) — assert order via a spy on `fetch`.
   - Existing `useChatSummarizer` tests must still pass.

**Gate**: triggering summarize in dev produces a row in SQLite, lineage matches the active focus, the in-conversation summary message carries `segmentId`.

## Phase 2 — Cold-start importer (closes spec §4.3 cold-start) — **SHIPPED** (`1615e95`)

Goal: existing `logs/chat_archive_*.jsonl` corpus indexed.

**Deltas worth carrying forward**:
- Importer wraps each archive's worth of inserts in `db.transaction(...)` — orders of magnitude faster at scale than per-row commits.
- Per-archive-file thread grouping: all entries in one `chat_archive_YYYY-MM-DD.jsonl` share a generated `thread_id` (they were one continuous session prior to the importer existing).
- Lineage is left empty on imported segments — historical focus state isn't in the archives. The lineage-repair wizard fast-follow is the path to fill it.
- **Empirical state today**: no archive files exist locally → 0 segments imported. Phase 5 measurement window must account for this (see Phase 5).

1. Create `scripts/import_archives.js` (new directory — `scripts/` doesn't exist yet).
2. For each entry: build a Segment with `id = entry.summary_id` (else generated UUID), `thread_id` derived from date, `lineage = {}`, `archive_file` pointer. Insert via the storage server's segment-insert path (import the module directly; don't HTTP-call the server from a script).
3. Idempotency: `INSERT OR IGNORE` on `id` (test: `cold-start-import-is-idempotent` from §9).
4. Run once locally to seed; document re-run path in `CLAUDE.md` working notes.

**Gate**: importer succeeds against real archives; rerunning is a no-op.

## Phase 3 — Retrieval surfaces (closes spec §3.1, §3.6, §8.5-6) — **SHIPPED**

Goal: LLM has access to past segments via tool + optional system-prompt injection.

**Deltas worth carrying forward**:

- **`recall_segments` tool** ships with the planned shape: query + optional `lineageFilter` + `limit` (default 10) + `includeTranscript` (default false). Server response is always full segments; the tool reshapes for the LLM.
- **`focusKey`-based per-turn dedupe was attempted and removed.** A retrieval-result cache keyed on `(focusKey, lastUserText)` was introduced and then deleted during simplification — every `sendMessage` appends a new user message, so the key always differs and the cache never hit. Phase 4+ should not try to revive this without first identifying a real recurrence pattern.
- **Lineage filter strict-AND** is the focus-mode default (already shipped in `multisemantic-db.js:230`). Spec §3.1 wording updated in the same PR; §10.1 open question marked resolved. Stricter-not-looser remains the expected evolution direction.
- **Citation heuristic** lives client-side in `multisemanticRetrieval.ts:detectCitedSegments`. Iterates 20-char windows of the (typically shorter) assistant text against transcript text via `String.includes`. Single POST per turn batches all cited segment ids.
- **`enableRelevantPastContext` toggle** is on `LLMConfig` (persisted to localStorage via `useLLMConfig`), default off, exposed in `SettingsModal`. Phase 5 measurement window must not start until this is flipped on.
- **Three new files**: `src/services/multisemanticRetrieval.ts` (recall + cite + feedback helpers), `src/services/lineageKeys.ts` (TS twin of `LINEAGE_LEVELS`), and `lineageFromResolved` exported from `src/utils/focus.ts` (replaces inline literal in `useChatSummarizer`).
- **`buildSystemContext` signature changed** to options object: `(conversation, data, { mode?, focus?, retrieved? })`. Two existing call sites (`usePlannerAI`, `useRefreshSuggestions`) and 7 test cases were updated.

**Gate met**: toggle on → assistant turns conditioned on past context in dev; toggle off → §6.5 baseline behavior unchanged. Spec §3.1 wording updated in the same PR.

## Phase 4 — UI substrate (closes spec §3.5; decision 001 MVP) — **SHIPPED**

Goal: per-node segment badges + popover + lineage breadcrumb + manual merge/split.

**Deltas worth carrying forward**:

- **Custom-node factoring simplified during /simplify pass**: the original plan was four separate `{Value,Goal,Project,Task}Node.tsx` files. Those were collapsed to a single `BaseNode` + four inline arrow components in `GraphView.tsx`'s module-scope `nodeTypes` map. The four wrappers added no semantic distinction (they differed only in `showBadge: true|false`). Adding a node type is now one line in that map; flipping Value/Goal badges on in the fast-follow is one flag flip per arrow.
- **`SegmentBadge` is its own component** (`src/components/Planner/nodes/SegmentBadge.tsx`): collapses to a dot at `count > 99` (decision 001 density mitigation). Clicks call `data.onBadgeClick(level, id, event)` which `GraphView` threads through `useGraphData` → node `data`.
- **`useSegmentCounts` returns a flat object** keyed `${level}:${id}` (not a `Map<(level, id), count>` as the plan described — the Map type was a conceptual signature, the implementation uses a plain Record for cheap React equality). Hook fires `Promise.all` over four `GET /api/segments/counts?level=X&ids=...` requests, one per non-empty lineage level. Empty levels short-circuit before the HTTP call.
- **Popover anchor is mouse coords, not xyflow node ref**: simpler than `useReactFlow().getNode(id) → DOM rect` and the badge always has a click `event` in hand. Cost: programmatic-open paths need a different anchor; see cross-cutting notes.
- **Popover fetch limit is 25, not 100**: paginates 20 per page client-side so 25 covers one full page plus a hint of "more available". If users hit the limit, lift it (or add a `Load more` button + offset).
- **Merge/split endpoints mirror `insertSegment`'s contract**: `{success, segment, mergedFrom}` and `{success, segments, splitFrom}` respectively. Both atomic via `db.transaction`, both behind the `MULTISEMANTIC_LOCK_KEY`. Inputs soft-deleted via `deleted_at`; new segments inherit lineage/thread_id/archive_file from the first input.
- **`makeSegmentId` extracted to `multisemantic-db.js`** during /simplify pass — `scripts/import_archives.js`, `mergeSegments`, and `splitSegment` all share one generator.
- **`buildSearchUrl` exported from `multisemanticRetrieval.ts`** during /simplify pass — `SegmentPopover` reuses it instead of inlining a URL builder.
- **`useSegmentCounts` dedupes `setCounts` calls** (added during /simplify pass) so the periodic poll doesn't propagate identity churn into `useGraphData` and re-run dagre layout when nothing changed.
- **No `ui-visual-review` skill in implementation session** — the plan's gate called for it but the skill wasn't loaded. Manual verification deferred to the user; the gate is **partially** met (lint + tsc-build + 89/89 tests pass; dev server boots cleanly; endpoints respond; visual diff not captured).

**Gate met (with caveat above)**: graph renders with custom nodes; segment counts thread through; merge/split endpoints return expected shapes; `LineageBreadcrumb` renders only when `Message.retrievalState` is set; popover paginates at 20. Manual visual review still owed.

## Phase 5 — Measurement plumbing (closes spec §6) — **SHIPPED**

Goal: pre-registered decision rule recorded; data flows to measure it.

**Deltas worth carrying forward**:

- **Decision doc shipped**: `docs/decisions/002-multisemantic-retrieval-eval.md` contains §6.3 verbatim. Window-start trigger set to "≥30 segments with non-empty lineage OR lineage-repair wizard ships" per the Phase 5 caveat — not backdated to toggle-flip. The doc has a literal `Window opened: <unset>` line to be filled in when the trigger fires.
- **`retrieval_feedback` auto-population was incomplete**: only cited segments (`helpful=1`) were being recorded. Spec §6.2 implicit-negatives (retrieved-but-not-cited) had no row, so the §6.3 denominator (retrieval events) could not be computed from the table. **Fixed** by reshaping the `/api/retrieval_feedback` payload to `{query, cited_ids, uncited_ids}`. Both arrays are written in one atomic `db.transaction` with one shared `retrieved_at`, so distinct `(query_hash, retrieved_at)` is the honest retrieval-event count. The legacy `{segment_ids, helpful}` shape is preserved (existing test passes unchanged).
- **`recordRetrievalEvent` is the new canonical recorder** (`multisemantic-db.js`). One transaction, one timestamp, both helpful classes. Legacy `recordRetrievalFeedback` delegates to it via `helpful ? citedIds : uncitedIds`, so the prepared-statement INSERT and the queryHash/contribStr boilerplate live in one place. The endpoint just translates request shapes — the "shared retrieved_at" invariant is no longer leaked into the HTTP layer. (This factoring landed during the /simplify pass; the earlier "optional retrievedAt param on recordRetrievalFeedback" approach was reverted.)
- **`getEvalSnapshot(db, {since?, until?})`** (`multisemantic-db.js`) is the single SQL surface for the §6.3 counts: `retrievalEvents`, `citedRetrievals`, `citeRate`, `segmentsRetrieved`, `segmentsCited`. Implemented as ONE query with `COUNT(DISTINCT CASE WHEN helpful=1 THEN ... END)` for the cited-events subset (collapsed from two queries during /simplify). Both `since` and `until` are inclusive ISO bounds; both optional.
- **`idx_rf_retrieved_at`** index added in the schema block — the snapshot's window filter is now index-backed instead of full-scan.
- **`GET /api/segments/eval-snapshot?since=&until=`** wraps the helper. Returned JSON shape matches the spec §6.3 vocabulary one-for-one.
- **Client `recordRetrievalFeedback`** (`src/services/multisemanticRetrieval.ts`) signature changed: `(query, citedIds, uncitedIds = [])`. Fire-and-forget pattern preserved. Caller in `usePlannerAI.ts:177-183` now computes `uncited = retrieved.segments.filter(s => !citedSet.has(s.id))` and passes both arrays.
- **Test deltas**: 5 new tests in `multisemantic-db.test.js` (new-shape POST roundtrip, snapshot empty-corpus, snapshot multi-turn cite-rate, snapshot since-window filter, new-shape both-empty rejection). 1 client test renamed and inverted in `usePlannerAI.retrieval.test.ts`: the previous "does not post when nothing cited" expectation was wrong relative to spec §6.2 — the test now asserts the uncited segment IS posted (with empty `cited_ids`). 94/94 tests pass.

**Empirical-state caveat (still applies)**: segments table empty today, no archive files exist locally. Window-opening trigger must fire before measurement begins; see decision doc 002 §Window. Until then the snapshot endpoint will return zeros, which is the correct signal that the rule cannot yet be evaluated.

**Gate met**: decision doc exists, snapshot endpoint returns sensible numbers (verified via the multi-turn snapshot test: 2 events, 1 cited, 0.5 cite rate, 4 segments retrieved, 1 cited). Lint + tsc-build + tests all clean.

---

## Cross-cutting concerns

- **Concurrency**: SQLite writes from the Express server go through the existing per-key lock pattern — use a single lock key `"multisemantic"` (don't try per-segment locking; `better-sqlite3` is synchronous, lock is enough). Already wired in `/api/segments` POST.
- **Recovery**: if `multisemantic.sqlite` is destroyed, spec §7 says rebuild via cold-start importer (lossy on lineage and feedback). Documented in `CLAUDE.md` (`node scripts/import_archives.js`).
- **Reuse the lineage constants** anywhere lineage fields are iterated: `LINEAGE_LEVELS` (`multisemantic-db.js:12`) on the server, `LINEAGE_KEYS` (`src/services/lineageKeys.ts`) on the client. Phase 4's `useSegmentCounts` and `SegmentPopover` both consume the client constant; `SegmentPopover` derives its lineage key via `` `${level}Id` as LineageKey `` rather than maintaining a parallel mapping.
- **Feature-flag debt**: the `enableRelevantPastContext` toggle is the spec §10.2 carryover. After §6 measurement completes, either remove the toggle or remove the injection path entirely.
- **Linting**: stick with the existing `no-explicit-any` tolerance; don't introduce new `any` in segment code.

## Order-of-implementation rationale

Phases are written in dependency order. Actual commit cadence so far:

- Phase 0 shipped standalone (`f193840`). Reversible: drop SQLite file.
- Phase 1 shipped standalone (`2a72dc2`). Reversible: revert; segments table accumulates orphans harmlessly.
- Phase 2 shipped standalone (`1615e95`), plus a three-agent review pass (`907566f`) and a tsc-build fixture fix (`8b08f2b`).
- Phase 3 shipped as one feat commit + plan revision. Reversible behind toggle (`enableRelevantPastContext` default off); reverting drops the new files but the `Message.retrievalState` field is additive and harmless if left in `services/types.ts`.
- Phase 4 shipped as one feat commit + /simplify pass + plan revision. Reversible: revert the commit; the new endpoints (`/api/segments/merge`, `/api/segments/split`) and UI components are additive and don't change the segment write/read contract that earlier phases rely on.
- Phase 5 shipped as decision doc + snapshot endpoint + auto-population fix + /simplify pass (`recordRetrievalEvent` factoring, single-query `getEvalSnapshot`, `idx_rf_retrieved_at` index). Reversible at the API layer (legacy `{segment_ids, helpful}` shape still works); the fix to record uncited segments is a one-line revert in `usePlannerAI.ts` if rolled back.

Each PR ends with the `pr-prep.md` workflow including the review-fix loop.

## Resolved sub-decisions

1. **`thread_id` rotation policy**: rotate on focus change (Phase 1 step 2). Watch for thread fragmentation and any latency on focus change. Debounce so a focus must persist ≥2 turns before rotating.
2. **Lineage filter strictness**: full AND in focus mode (Phase 3, shipped). Spec §3.1 wording updated. Stricter-not-looser is the expected evolution direction.
3. **`multisemantic.sqlite.last-good` cadence**: daily minimum plus on startup, via a lazy mtime check at segment-insert time (Phase 0 step 3).
4. **Per-turn retrieval cache**: not needed. Attempted in Phase 3 implementation, removed during simplification — the `(focusKey, lastUserText)` key changes every turn so the cache was unreachable. Each retrieval-augmented send re-issues the FTS query.
5. **Popover anchor strategy** (Phase 4, shipped): mouse coords (`event.clientX/Y` captured at badge click), not xyflow's `useReactFlow().getNode(id) → DOM rect`. Reason: simpler, no extra hook round-trip, and the badge always has a click event in hand. Cost: programmatic-open paths (e.g., breadcrumb → popover deep-link) will need the ref-based anchor.
6. **Custom-node factoring** (Phase 4, shipped): single `BaseNode` + four inline arrow components in `GraphView.tsx`'s module-scope `nodeTypes` map, not four separate node files. The /simplify pass collapsed four 3-line wrappers that differed only in a boolean flag.
7. **Popover fetch limit** (Phase 4, shipped): `limit=25` with client-side pagination at 20-per-page. Bumped from the initial 100 during /simplify (most of the payload was unused).

## Open questions remaining

1. **Value/Goal node badges** — still deferred to fast-follow. In MVP segments only attach at project/task lineage levels, so V/G nodes would show `0` everywhere. Revisit once Phase 5 measurement reveals whether users do attach segments to higher levels (unlikely without the lineage-repair wizard).
2. **Programmatic popover open** — if Phase 5 / fast-follows want a breadcrumb-click to scroll-to-graph + open the matching popover, the current mouse-coords anchor won't work. Track as a need-only-if-asked item; no work to do until then.

## Revisit triggers

- Spec §3.1 BM25-as-primary holds only at low-hundreds segment count; cold-start imported 0 segments (no archives existed), so the low-hundreds assumption holds trivially today. Re-evaluate if organic accumulation passes ~500 segments before Phase 5 wraps.
- `GraphView.tsx` is ~85 lines after Phase 4 (well under the 300-line `CODE_HEALTH.md` trigger). Re-check if a future phase grafts more behavior into it — popover state, drag-to-merge, or a second overlay would each push it past the threshold.
- If retrieval injection adds >500ms to send-message latency in dev, move the BM25 search to a worker or precompute embeddings.
- **Thread fragmentation**: if `thread_id` count exceeds (segments per day) × (active days) by >3×, the focus-change rotation policy is producing dead threads — revisit toward a coarser trigger (e.g., rotate only on parent-level focus change).
- **Focus-change latency**: if rotation noticeably delays the UI (>100ms perceived), the rotation work has crept past UUID assignment — audit.
- **Empty-result rate from strict AND**: if Phase 3 retrieval returns empty >50% of the time when focus is active, lineage data is mostly missing (likely cold-start segments) rather than the filter being wrong — fix by surfacing the lineage-repair wizard fast-follow, not by relaxing the filter.
- **Warm-up sparsity** (new): if the first 2 weeks post-Phase-3-toggle return empty on >80% of retrieval attempts, segment volume is the bottleneck rather than retrieval quality — accelerate the lineage-repair wizard fast-follow, don't tune BM25.
