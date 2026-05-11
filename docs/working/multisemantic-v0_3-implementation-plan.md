**Goal**: Implement the multisemantic v0.3 MVP scope (`docs/multisemantic_v0_3_dayplanner.md` §8) using the UI substrate chosen in `docs/decisions/001-multisemantic-ui-substrate.md`.
**Project state**: Phases 0–2 shipped on `dev` (commits `f193840`, `2a72dc2`, `1615e95`, plus post-review simplification `907566f`). Phase 3 next.
**Task status**: Phases 0–2 complete; Phase 3 ready to start. Plan edits below reflect what actually shipped and adjust Phases 3–5 accordingly.

## What shipped in Phases 0–2 (vs. plan)

Cross-cutting facts the later phases should treat as established:

- **`LINEAGE_LEVELS` constant** (`multisemantic-db.js:12`) is the single source of truth for `(column, payload-key)` pairs. Phases 3+ import it — do not redefine the four levels anywhere else.
- **Schema additions beyond spec**: `transcript_text` is a denormalized FTS-friendly column (not `json_extract`); `deleted_at` already exists on `segments`. Phase 4 merge/split therefore needs **no migration**.
- **FTS5 escaping** (`escapeFtsQuery` in `multisemantic-db.js:249`) wraps each whitespace-delimited token as a quoted phrase, so arbitrary user/LLM text (identifiers, punctuation, ∀) flows safely through `recall_segments`. Don't re-implement.
- **`focusKey()` helper** (`utils/ids.ts:31`) produces a stable string from a `ResolvedFocus`. Phase 1 uses it for thread rotation; Phase 3 should reuse it for per-turn injection dedupe.
- **Segment POST is fire-and-forget** (`useChatSummarizer.ts:73`): `fetch(...).catch(console.error)`, never awaited. Failure does not block the user-visible summarization flow. Phase 3's `retrieval_feedback` POST adopts the same pattern.
- **`insertSegment` returns `{segment, inserted}`** (`multisemantic-db.js:150`) and uses `INSERT OR IGNORE`. Phase 4 merge/split endpoints should mirror this contract.
- **Endpoints already live**: `POST /api/segments`, `GET /api/segments/search`, `GET /api/segments/counts` (signature: `?level=X&ids=a,b,c`). Phase 4's `useSegmentCounts` consumes the counts endpoint as-is.
- **Empirical corpus today: 0 segments**. No `logs/chat_archive_*.jsonl` exist yet, so the cold-start importer ran with no input. Phase 3 retrievals will return empty for some period after toggle-flip until organic summarizations accumulate. This shapes Phase 5 measurement timing — see Phase 5 caveat below.
- **§9 tests already shipped** (move out of later-phase test lists):
  - Phase 0: `fts-finds-newly-written-segment`, `fts-tokenizer-handles-identifiers`, `lineage-filter-returns-only-matching-segments`.
  - Phase 1: `summarization-produces-segment-with-lineage-from-focus-state`, `archive-write-precedes-segment-insert`.
  - Phase 2: `cold-start-import-is-idempotent`.

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

## Phase 3 — Retrieval surfaces (closes spec §3.1, §3.6, §8.5-6)

Goal: LLM has access to past segments via tool + optional system-prompt injection.

1. **Register `recall_segments`** in `src/services/toolRegistry.ts`. Inputs: `query` (string), optional `lineageFilter` (subset of `{valueId, goalId, projectId, taskId}`), optional `limit` (default 10), optional `includeTranscript` (default `false`). Handler fetches from `/api/segments/search`.
   - **Default output is summaries only**: `{id, thread_id, summary, lineage, created_at, archive_file}`. Full transcripts inflate the LLM context budget and are rarely needed turn-over-turn.
   - When `includeTranscript: true`, attach `transcript` to each result. This is the path for "I want to read the whole thing" follow-up calls.
2. **System-prompt injection** in `aiContext.buildSystemContext`: behind a config toggle (`enableRelevantPastContext`, default off in production until §6.5 baseline run completes), call the search endpoint with the resolved focus lineage and the last user turn as query. Inject top-3 summaries under `RELEVANT PAST CONTEXT:`. Default no BM25 floor (per §10.1). Use `focusKey()` from `utils/ids.ts` to detect "focus unchanged since last injection" and skip recomputing on rapid turns.
   - **Lineage filter is strict AND in focus mode**: every set lineage field on the focus state must match the segment's corresponding field exactly (null/unset on the segment never satisfies a set focus field). Already shipped in `multisemantic-db.js:230`. Per user direction, the expected evolution is *stricter* filters (e.g., recency cutoffs, exact-tag match), not looser; do not pre-build an OR fallback.
   - **Spec wording update is a sub-task**: `docs/multisemantic_v0_3_dayplanner.md` §3.1 currently says "any of valueId/goalId/projectId/taskId matches." Replace with "all set lineage fields must match." `CLAUDE.md` already documents this; the spec itself is stale.
3. **Record injection state**: when a system prompt includes retrieved segments, stash the `{segmentIds, lineage, freshness}` tuple on the assistant turn it precedes. This is what the breadcrumb (Phase 4) reads. **Critical**: pulled from system-side record, not LLM self-report — this is the H7' load-bearing wire (decision 001 consequences §4).
4. **Auto-populate `retrieval_feedback`** (fire-and-forget, mirroring `useChatSummarizer.ts:73`): when an assistant turn references an injected `segmentId` (literal id OR quoted ≥20-char substring of segment transcript), POST a `helpful=1` row. Cheap heuristic; deferred explicit thumbs. `fetch(...).catch(console.error)` — never await.
5. Tests:
   - `recall_segments` tool roundtrip (mocked LLM, asserts summaries-only by default and transcripts when flag set).
   - Snapshot test on `buildSystemContext` with toggle on/off.
   - Injection-state roundtrip: assistant turn carries `{segmentIds, lineage, freshness}` after a retrieval-augmented send.
   - `retrieval_feedback` heuristic: assistant turn quoting a ≥20-char substring of an injected segment produces a `helpful=1` row.
   - (Note: `lineage-filter-returns-only-matching-segments` and `fts-tokenizer-handles-identifiers` already covered by Phase 0 tests — don't duplicate.)

**Gate**: toggle on → assistant turns are visibly conditioned on past context in dev; toggle off → §6.5 baseline behavior unchanged. Spec §3.1 wording updated in the same PR.

## Phase 4 — UI substrate (closes spec §3.5; decision 001 MVP)

Goal: per-node segment badges + popover + lineage breadcrumb + manual merge/split.

This phase is the largest behavior-visible change. It is also where decision 001's claims get tested.

1. **Custom xyflow nodes**:
   - Create `src/components/Planner/nodes/{ValueNode,GoalNode,ProjectNode,TaskNode}.tsx`.
   - Register a `nodeTypes` map in `GraphView.tsx`.
   - Thread `segmentCount` into node `data` from `useGraphData.ts`. Source: a new `useSegmentCounts(projects, tasks)` hook. The endpoint shipped is `GET /api/segments/counts?level=X&ids=a,b,c` (level-keyed, comma-separated ids), so the hook issues one request per level it needs counts for. Returns a `Map<(level, id), count>`.
   - Project and Task nodes render a small badge `[N]` in the upper-right. Value/Goal nodes get badges in a fast-follow, not MVP — keep the surface narrow.
2. **Segment popover**: clicking the badge opens an inline popover (positioned via xyflow's node ref) listing segments matching that lineage: summary, timestamp, key facts. Component: `src/components/Planner/SegmentPopover.tsx`. Data source: `/api/segments/search` with `lineageFilter` only, no query string.
3. **Lineage breadcrumb**: `src/components/Chat/LineageBreadcrumb.tsx`. Renders above assistant turns whose stashed injection state is non-empty (from Phase 3 step 3). Format: `Loading: Project X › Task Y · 4 days ago · 3 segments`. Resolves names from current planner state.
4. **Manual merge/split**: action buttons in the segment popover. Merge takes two selected segments → new segment with concatenated transcripts, both originals soft-deleted (`deleted_at`). Split prompts for a message-index boundary → two new segments. Both write through `/api/segments/merge` and `/api/segments/split`. Archive files are not touched. **No migration needed** — `deleted_at` already exists on `segments` from Phase 0. Endpoint return shape should match `insertSegment`: `{success, segment, ...}` with consistent `inserted`/`merged`/`split` flags so clients have one parse path.
5. **Visual density mitigation** (decision 001 consequences): badge collapses to a dot if `segmentCount > 99`; popover paginates at 20 (decision 001 revisit trigger).
6. Tests:
   - Component tests for `SegmentPopover` (renders, filters, merge action).
   - Component test for `LineageBreadcrumb` (reads injection state, formats lineage path).
   - `useSegmentCounts` hook test.
   - Manual merge/split: storage-server integration test asserting transcripts concat correctly and both inputs are soft-deleted.

**Gate**: open the graph in dev, segment counts visible on populated nodes, clicking a Project node opens a working popover, triggering a retrieval-augmented chat turn renders a breadcrumb. Run `ui-visual-review` skill before claiming done.

## Phase 5 — Measurement plumbing (closes spec §6)

Goal: pre-registered decision rule recorded; data flows to measure it.

1. Write `docs/decisions/002-multisemantic-retrieval-eval.md` containing the §6.3 rules verbatim plus measurement window start date. Per §6.6, this must exist **before** Phase 3's toggle is flipped on in production use.
2. Confirm `retrieval_feedback` auto-population works (Phase 3 step 4). Add a small `/api/segments/eval-snapshot` endpoint returning cite-rate counts for the window — enables ad-hoc inspection without writing SQL.

**Empirical-state caveat**: as of plan-edit time the segments table is empty and no `chat_archive_*.jsonl` files exist locally. The measurement window start date should not be backdated to the moment Phase 3's toggle flips on; the first weeks will be too sparse to evaluate. Set the window start *after* a usable corpus accumulates (heuristic: ≥30 segments with non-empty lineage), or after the lineage-repair wizard fast-follow backfills historical archives — whichever comes first.

**Gate**: decision doc exists, snapshot endpoint returns sensible numbers after a few injected turns in dev.

---

## Cross-cutting concerns

- **Concurrency**: SQLite writes from the Express server go through the existing per-key lock pattern — use a single lock key `"multisemantic"` (don't try per-segment locking; `better-sqlite3` is synchronous, lock is enough). Already wired in `/api/segments` POST.
- **Recovery**: if `multisemantic.sqlite` is destroyed, spec §7 says rebuild via cold-start importer (lossy on lineage and feedback). Documented in `CLAUDE.md` (`node scripts/import_archives.js`).
- **Reuse the `LINEAGE_LEVELS` constant** (`multisemantic-db.js:12`) anywhere lineage fields are iterated. Phase 3's tool input validator and Phase 4's `useSegmentCounts` are the obvious candidates.
- **Feature-flag debt**: the `enableRelevantPastContext` toggle is the spec §10.2 carryover. After §6 measurement completes, either remove the toggle or remove the injection path entirely.
- **Linting**: stick with the existing `no-explicit-any` tolerance; don't introduce new `any` in segment code.

## Order-of-implementation rationale

Phases are written in dependency order. Actual commit cadence so far:

- Phase 0 shipped standalone (`f193840`). Reversible: drop SQLite file.
- Phase 1 shipped standalone (`2a72dc2`). Reversible: revert; segments table accumulates orphans harmlessly.
- Phase 2 shipped standalone (`1615e95`), plus a three-agent review pass (`907566f`) and a tsc-build fixture fix (`8b08f2b`).
- Phase 3 — one PR. Reversible behind toggle (`enableRelevantPastContext` default off).
- Phase 4 — one PR, split if the custom-node introduction grows large.
- Phase 5 — one PR (decision doc + snapshot endpoint).

Each PR ends with the `pr-prep.md` workflow including the review-fix loop.

## Resolved sub-decisions

1. **`thread_id` rotation policy**: rotate on focus change (Phase 1 step 2). Watch for thread fragmentation and any latency on focus change. Debounce so a focus must persist ≥2 turns before rotating.
2. **Lineage filter strictness**: full AND in focus mode (Phase 3 step 2). Spec §3.1 wording must be updated when Phase 3 lands. Stricter-not-looser is the expected evolution direction.
3. **`multisemantic.sqlite.last-good` cadence**: daily minimum plus on startup, via a lazy mtime check at segment-insert time (Phase 0 step 3).

## Open questions remaining

1. **Value/Goal node badges** — defer to fast-follow unless during Phase 4 it becomes obvious that Value/Goal segments exist (segments only attach at task/project lineage levels in MVP, so likely fine).

## Revisit triggers

- Spec §3.1 BM25-as-primary holds only at low-hundreds segment count; cold-start imported 0 segments (no archives existed), so the low-hundreds assumption holds trivially today. Re-evaluate if organic accumulation passes ~500 segments before Phase 5 wraps.
- If Phase 4 custom-node work pushes `GraphView.tsx` past 300 lines, trigger the `CODE_HEALTH.md` pact.
- If retrieval injection adds >500ms to send-message latency in dev, move the BM25 search to a worker or precompute embeddings.
- **Thread fragmentation**: if `thread_id` count exceeds (segments per day) × (active days) by >3×, the focus-change rotation policy is producing dead threads — revisit toward a coarser trigger (e.g., rotate only on parent-level focus change).
- **Focus-change latency**: if rotation noticeably delays the UI (>100ms perceived), the rotation work has crept past UUID assignment — audit.
- **Empty-result rate from strict AND**: if Phase 3 retrieval returns empty >50% of the time when focus is active, lineage data is mostly missing (likely cold-start segments) rather than the filter being wrong — fix by surfacing the lineage-repair wizard fast-follow, not by relaxing the filter.
- **Warm-up sparsity** (new): if the first 2 weeks post-Phase-3-toggle return empty on >80% of retrieval attempts, segment volume is the bottleneck rather than retrieval quality — accelerate the lineage-repair wizard fast-follow, don't tune BM25.
