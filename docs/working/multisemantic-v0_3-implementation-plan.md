**Goal**: Implement the multisemantic v0.3 MVP scope (`docs/multisemantic_v0_3_dayplanner.md` §8) using the UI substrate chosen in `docs/decisions/001-multisemantic-ui-substrate.md`.
**Project state**: Pre-implementation. Spec frozen, UI substrate decided. No branch yet.
**Task status**: plan drafted; awaiting user sign-off on phasing and gate criteria.

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

## Phase 0 — Substrate setup (no behavioral change)

Goal: dependency in, schema present, `/api/segments` exists but unused.

1. Add `better-sqlite3` to `package.json`. Note native compile step in CLAUDE.md if it bites.
2. At `storage-server.js` startup, open `data/multisemantic.sqlite`, run schema from spec §3.3 (segments, segments_fts trigram, segments triggers, retrieval_feedback). Idempotent: only run `CREATE TABLE IF NOT EXISTS`.
3. Mirror existing rollback discipline: write `multisemantic.sqlite.last-good` snapshot on server startup after migrations, **and** at least once per 24 hours during long-running sessions. Implementation: lazy check on segment-insert path — if the last-good file's mtime is >24h old, snapshot before inserting. Cheap (a stat call) and avoids needing a scheduled task.
4. Add `/api/segments` POST and `/api/segments/search` GET endpoints. Stub bodies: POST inserts a segment row, GET runs BM25 with optional lineage `AND`. No frontend caller yet.
5. Tests: `storage-server.test.js` additions for schema creation, segment insert/select roundtrip, FTS finds inserted segment (covers `fts-finds-newly-written-segment` from §9).

**Gate**: tests pass; existing planner-JSON flow unaffected; SQLite file appears in `data/` after startup.

## Phase 1 — Segment write path (closes spec §4.3, §5)

Goal: every summarization event produces a `segments` row.

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

## Phase 2 — Cold-start importer (closes spec §4.3 cold-start)

Goal: existing `logs/chat_archive_*.jsonl` corpus indexed.

1. Create `scripts/import_archives.js` (new directory — `scripts/` doesn't exist yet).
2. For each entry: build a Segment with `id = entry.summary_id` (else generated UUID), `thread_id` derived from date, `lineage = {}`, `archive_file` pointer. Insert via the storage server's segment-insert path (import the module directly; don't HTTP-call the server from a script).
3. Idempotency: `INSERT OR IGNORE` on `id` (test: `cold-start-import-is-idempotent` from §9).
4. Run once locally to seed; document re-run path in `CLAUDE.md` working notes.

**Gate**: importer succeeds against real archives; rerunning is a no-op.

## Phase 3 — Retrieval surfaces (closes spec §3.1, §3.6, §8.5-6)

Goal: LLM has access to past segments via tool + optional system-prompt injection.

1. Register `recall_segments` in `src/services/toolRegistry.ts`. Inputs: `query`, optional `lineageFilter`. Output: top-K segments serialized as JSON. Handler fetches from `/api/segments/search`.
2. In `aiContext.buildSystemContext`: behind a config toggle (`enableRelevantPastContext`, default off in production until §6.5 baseline run completes), call the search endpoint with the resolved focus lineage and the last user turn as query. Inject top-3 under `RELEVANT PAST CONTEXT:`. Default no BM25 floor (per §10.1). **Lineage filter is strict AND in focus mode**: every set lineage field on the focus state must match the segment's corresponding field (null/unset on the segment never satisfies a set focus field). This contradicts the spec §3.1 wording "any of valueId/goalId/projectId/taskId matches" — replace that wording with "all set lineage fields must match" when this lands. Per user direction, the expected evolution is *stricter* filters (e.g., recency cutoffs, exact-tag match), not looser; do not pre-build an OR fallback.
3. Record injection state: when a system prompt includes retrieved segments, stash the `{segmentIds, lineage, freshness}` tuple on the assistant turn it precedes. This is what the breadcrumb (Phase 4) reads. **Critical**: pulled from system-side record, not LLM self-report — this is the H7' load-bearing wire (decision 001 consequences §4).
4. Auto-populate `retrieval_feedback`: when an assistant turn references an injected `segmentId` (literal id OR quoted ≥20-char substring of segment transcript), POST a `helpful=1` row. Cheap heuristic; deferred explicit thumbs.
5. Tests:
   - `lineage-filter-returns-only-matching-segments` (§9)
   - `fts-tokenizer-handles-identifiers` (§9) — `Nat.add_succ`, snake_case, `∀`.
   - `recall_segments` tool roundtrip (mocked LLM).
   - Snapshot test on `buildSystemContext` with toggle on/off.

**Gate**: toggle on → assistant turns are visibly conditioned on past context in dev; toggle off → §6.5 baseline behavior unchanged.

## Phase 4 — UI substrate (closes spec §3.5; decision 001 MVP)

Goal: per-node segment badges + popover + lineage breadcrumb + manual merge/split.

This phase is the largest behavior-visible change. It is also where decision 001's claims get tested.

1. **Custom xyflow nodes**:
   - Create `src/components/Planner/nodes/{ValueNode,GoalNode,ProjectNode,TaskNode}.tsx`.
   - Register a `nodeTypes` map in `GraphView.tsx`.
   - Thread `segmentCount` into node `data` from `useGraphData.ts`. Source: a new `useSegmentCounts(projects, tasks)` hook that batches a single `/api/segments/counts?byLineage=...` request and returns a map keyed by `(level, id)`.
   - Project and Task nodes render a small badge `[N]` in the upper-right. Value/Goal nodes get badges in a fast-follow, not MVP — keep the surface narrow.
2. **Segment popover**: clicking the badge opens an inline popover (positioned via xyflow's node ref) listing segments matching that lineage: summary, timestamp, key facts. Component: `src/components/Planner/SegmentPopover.tsx`. Data source: `/api/segments/search` with `lineageFilter` only, no query string.
3. **Lineage breadcrumb**: `src/components/Chat/LineageBreadcrumb.tsx`. Renders above assistant turns whose stashed injection state is non-empty (from Phase 3 step 3). Format: `Loading: Project X › Task Y · 4 days ago · 3 segments`. Resolves names from current planner state.
4. **Manual merge/split**: action buttons in the segment popover. Merge takes two selected segments → new segment with concatenated transcripts, both originals soft-deleted (`deleted_at`). Split prompts for a message-index boundary → two new segments. Both write through `/api/segments/merge` and `/api/segments/split`. Archive files are not touched.
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

**Gate**: decision doc exists, snapshot endpoint returns sensible numbers after a few injected turns in dev.

---

## Cross-cutting concerns

- **Concurrency**: SQLite writes from the Express server go through the existing per-key lock pattern — use a single lock key `"multisemantic"` (don't try per-segment locking; `better-sqlite3` is synchronous, lock is enough).
- **Recovery**: if `multisemantic.sqlite` is destroyed, spec §7 says rebuild via cold-start importer (lossy on lineage and feedback). Document the rebuild command in `CLAUDE.md` once the importer lands.
- **Feature-flag debt**: the `enableRelevantPastContext` toggle is the spec §10.2 carryover. After §6 measurement completes, either remove the toggle or remove the injection path entirely.
- **Linting**: stick with the existing `no-explicit-any` tolerance; don't introduce new `any` in segment code.

## Order-of-implementation rationale

Phases are written in dependency order, but the natural commit cadence is:

- Phase 0 + 1 = one branch (substrate + write path), one PR. Reversible: toggle off, importer not yet run, segments table just accumulates.
- Phase 2 standalone, one PR. Reversible: delete the segments rows.
- Phase 3 = one PR. Reversible behind toggle.
- Phase 4 = one PR, possibly split if the custom-node introduction grows large.
- Phase 5 = one PR (decision doc + snapshot endpoint).

Each PR ends with the `pr-prep.md` workflow including the review-fix loop.

## Resolved sub-decisions

1. **`thread_id` rotation policy**: rotate on focus change (Phase 1 step 2). Watch for thread fragmentation and any latency on focus change. Debounce so a focus must persist ≥2 turns before rotating.
2. **Lineage filter strictness**: full AND in focus mode (Phase 3 step 2). Spec §3.1 wording must be updated when Phase 3 lands. Stricter-not-looser is the expected evolution direction.
3. **`multisemantic.sqlite.last-good` cadence**: daily minimum plus on startup, via a lazy mtime check at segment-insert time (Phase 0 step 3).

## Open questions remaining

1. **Value/Goal node badges** — defer to fast-follow unless during Phase 4 it becomes obvious that Value/Goal segments exist (segments only attach at task/project lineage levels in MVP, so likely fine).

## Revisit triggers

- Spec §3.1 BM25-as-primary holds only at low-hundreds segment count; if cold-start import surfaces >1000 segments, re-evaluate before Phase 3.
- If Phase 4 custom-node work pushes `GraphView.tsx` past 300 lines, trigger the `CODE_HEALTH.md` pact.
- If retrieval injection adds >500ms to send-message latency in dev, move the BM25 search to a worker or precompute embeddings.
- **Thread fragmentation**: if `thread_id` count exceeds (segments per day) × (active days) by >3×, the focus-change rotation policy is producing dead threads — revisit toward a coarser trigger (e.g., rotate only on parent-level focus change).
- **Focus-change latency**: if rotation noticeably delays the UI (>100ms perceived), the rotation work has crept past UUID assignment — audit.
- **Empty-result rate from strict AND**: if Phase 3 retrieval returns empty >50% of the time when focus is active, lineage data is mostly missing (likely cold-start segments) rather than the filter being wrong — fix by surfacing the lineage-repair wizard fast-follow, not by relaxing the filter.
