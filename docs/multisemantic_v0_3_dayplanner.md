# Multisemantic v0.3 — dayplanner-web Adaptation

**Status:** Draft. Adapts the abstract `Multisemantic v0.3` design (drafted in `Multisemantic_v0_3.md`, May 2026) to the current state of `dayplanner-web`. Mirrors v0.3's section numbering so the two can be diffed.

**Standing resolutions** (departures from v0.3, justified by this project's scale and constraints):

- SQLite is added for **segments + FTS only**. Planner data (`planner-values`, `planner-goals`, `planner-projects`, `planner-tasks`, `planner-capacity`) stays on the existing per-key JSON files in `storage-server.js`. No migration of working data.
- **Cross-encoder rerank is deferred** out of MVP. v0.3 brings it forward to honor SmartSearch's benchmark; that benchmark is over thousands of long segments. This app will accumulate a few hundred. BM25 + trigram over that volume is the right starting point.
- **Domain is the only facet in MVP.** It maps onto the existing Value/Goal/Project/Task hierarchy and needs no classification or vocabulary design. Relation-to-Self and Abstraction are deferred until Domain proves the substrate works.
- **Sensemaking surface is in MVP, narrowly scoped to the existing graph.** Per `docs/decisions/001-multisemantic-ui-substrate.md`, the xyflow graph is the substrate: per-node segment-count badges + popovers, a system-generated lineage breadcrumb above retrieved-context-augmented assistant turns, and manual merge/split from the popover. Open-loop tray, archive cards view, dedicated review mode, and lineage-repair wizard are explicit fast-follows.
- **Cold-start import is in MVP**, not deferred — the existing `logs/chat_archive_*.jsonl` corpus is small enough to import in one pass.

---

## 1. Overview

A **chat-segment store with retrieval**, layered into the existing dayplanner-web storage server. Conversations get sliced at summarization time into stable, addressable, full-text-indexed segments tagged with the planner-hierarchy lineage that was active at slice time. Future LLM turns can pull relevant past segments by lineage + content match instead of scrolling through the conversation array.

### 1.1 Central thesis (specialized)

1. **Stable segment IDs + a single ground-truth segment store** are the addition. The existing `chat_archive_*.jsonl` becomes the v0.3 "archives = authoritative for compressed content" tier; a new `segments` table holds the post-summarization view with stable IDs.
2. **BM25 over segment transcripts via SQLite FTS5 (trigram)** is the primary retrieval surface. No rerank in MVP. Domain-facet AND filtering uses the existing planner hierarchy.
3. **The Domain facet is free.** It is the existing Value→Goal→Project→Task hierarchy already maintained in `planner-*.json`. No classification step is needed; segment placement is the focus lineage at the time the segment closes (`resolveEffectiveFocus` in `src/utils/focus.ts`).

### 1.2 What problem this solves for dayplanner-web specifically

Today, every chat session starts cold. Past conversation about a project is either (a) still in the active conversation array (summarized inline or not), (b) compressed into a system-message summary that lives in conversation state, or (c) archived to `logs/chat_archive_*.jsonl` and lost to the LLM. The LLM sees neither (b) below the most-recent summary nor (c) at all on a new session.

The retrieval problem this solves: "when the user references project X (detected via focus), surface relevant prior segments tagged with project X's lineage so the LLM has continuity across sessions."

The sensemaking problem (v0.3 §1.2's other half) is addressed narrowly in MVP — see §3.5 and `docs/decisions/001-multisemantic-ui-substrate.md`.

---

## 2. Data Model

### 2.1 Leaf Nodes (Segments) — NEW

```typescript
interface Segment {
  id: string;                    // stable UUID, never changes
  thread_id: string;             // groups segments from one continuous session/focus span
  transcript: Message[];         // post-compression view (matches the in-conversation summary)
  created_at: string;            // ISO timestamp
  updated_at: string;
  summary?: string;              // copy of the summary message body
  lineage: SegmentLineage;       // domain-facet placement (free from focus state)
  metadata: SegmentMetadata;
}

interface SegmentLineage {
  valueId?: number | null;
  goalId?: number | null;
  projectId?: number | null;
  taskId?: number | null;
}

interface SegmentMetadata {
  // facet vocab beyond Domain is deferred; flag stays so it's cheap to add later
  needs_classification: boolean;
  open_loop: boolean;            // user-settable; defaults false in MVP
  archive_file: string;          // pointer back to chat_archive_<date>.jsonl
}
```

Notes:
- `Message` reuses `src/services/types.ts:Message` plus the `summaryData` extension already added in `useChatSummarizer.ts`. The `id` field on `Message` may need to be backfilled — see §2.3.
- `lineage` is the v0.3 Domain facet, denormalized onto the segment for cheap filtering. Cardinality is small; this avoids a join for the common query.
- `RetrievalFeedback` lives in its own table (§3.6).

### 2.2 Ground-truth regime

Three tiers, jointly authoritative:

- **`data/multisemantic.sqlite`** — the new SQLite store, sole runtime source for segment lookup, FTS, and retrieval feedback.
- **`logs/chat_archive_<date>.jsonl`** — already exists. Append-only. Authoritative for the **pre-summarization** message content of any segment whose transcript has been compressed. The current archive entry shape (`{timestamp, summary_id, messages}`) is already segment-aligned; only `summary_id` needs to become the segment UUID.
- **`data/<key>.json` per-key planner files** — unchanged. Authoritative for planner state. Not touched by the segment system except by read.

To reconstruct a segment's full pre-compression transcript: read the segment row, resolve `metadata.archive_file`, scan that JSONL for the entry whose `summary_id == segment.id`.

If `multisemantic.sqlite` is destroyed: rebuild segments table by replaying `chat_archive_*.jsonl`. Lineage placements need to be re-derived; FTS rebuilds from segment transcripts. Lossy only for any segment that wasn't archived (i.e., live conversation that hadn't summarized yet).

### 2.3 Messages

Use the existing `Message` type from `src/services/types.ts`. Two changes needed:

- Ensure every `Message` has a stable `id` at creation time (`useChatSummarizer.ts` already does this for summary messages; user/assistant messages currently don't always carry one — fix on the producer side, not as a migration).
- The existing `summaryData.key_facts` and `summaryData.timestamp_*` fields already match v0.3's shape. `compressed_from` (message IDs within the segment) needs to be populated when summarization runs, requiring step above.

### 2.4 Segment boundaries

**Boundary trigger (MVP) = summarization event.** When `useChatSummarizer.summarizeConversation` fires (auto at 25 messages, or manual via Archive button at ≥5):

- The `summarizeSlice` becomes one Segment.
- `thread_id` is the session ID at that point (newly introduced — see below).
- `lineage` is the focus lineage resolved against `summarizeSlice` (call `resolveEffectiveFocus` over those messages).

**Thread ID** is a new piece of conversation-level state. Initial proposal: `thread_id` is generated on app load and rotates when the user starts a fresh conversation (existing UI: clearing chat). Inter-segment links (v0.3 `relation: "continues"`) are unnecessary in MVP because we don't split a single summarization slice across segments.

User-signaled segmentation (`/segment` command, focus-change auto-split) is deferred. The current single-trigger model works.

---

## 3. Retrieval Architecture

### 3.1 Default retrieval pipeline (MVP)

1. **Recall stage**:
   - BM25 over `segments_fts` via SQLite FTS5, trigram tokenizer
   - Domain lineage filter AND'd in if a focus is active (any of `valueId`, `goalId`, `projectId`, `taskId` matches)
   - Optional temporal filter (e.g., "last 30 days") — surfaced as a query param, not on by default
2. **No rerank stage in MVP.** Top-K from BM25 is returned directly. Latency budget for adding rerank later is fine; the gating question is whether top-K from BM25 is good enough at this scale, which is empirically unknown.
3. **Score-adaptive truncation** to fit context budget (existing system prompt has a budget; segment text counts against it).

This pipeline is consumed by:
- `aiContext.buildSystemContext` — when building the system prompt, optionally include top-N retrieved segments under a new `RELEVANT PAST CONTEXT:` header.
- A new tool (`recall_segments`) that the LLM can call explicitly when it wants more historical context.

### 3.2 Facets: retrieval filter vs. navigation surface

- **Retrieval filter**: Domain (lineage) is AND'd into recall. That's it for MVP.
- **Navigation surface**: deferred (§3.5).

Relation-to-Self and Abstraction facets are deferred entirely. The vocabulary, the classifier prompts, the placement tables, and the measurement infrastructure all wait until Domain-only retrieval is proven valuable in normal use.

### 3.3 Storage backend

SQLite, embedded, accessed from `storage-server.js`. New dependency: `better-sqlite3` (synchronous, fits Express's request handler model with the existing per-key lock pattern).

```sql
CREATE TABLE segments (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  transcript_json TEXT NOT NULL,
  summary TEXT,
  value_id INTEGER,
  goal_id INTEGER,
  project_id INTEGER,
  task_id INTEGER,
  needs_classification INTEGER NOT NULL DEFAULT 0,
  open_loop INTEGER NOT NULL DEFAULT 0,
  archive_file TEXT NOT NULL
);

CREATE INDEX idx_segments_thread ON segments(thread_id);
CREATE INDEX idx_segments_created ON segments(created_at);
CREATE INDEX idx_segments_project ON segments(project_id);
CREATE INDEX idx_segments_open ON segments(open_loop, updated_at);

CREATE VIRTUAL TABLE segments_fts USING fts5(
  transcript_text,
  content='segments',
  content_rowid='rowid',
  tokenize = 'trigram'
);

-- triggers to keep FTS in sync
CREATE TRIGGER segments_ai AFTER INSERT ON segments BEGIN
  INSERT INTO segments_fts(rowid, transcript_text)
  VALUES (new.rowid, json_extract(new.transcript_json, '$') );
END;
-- (similar for update/delete)
```

**Trigram tokenizer rationale (preserved from v0.3)**: trigram handles snake_case, identifier-style tokens, Unicode math, and degrades gracefully on prose. Decision is baked at table creation; switching means rebuild.

LMDB and JSON-flat-file alternatives rejected for the same reasons as v0.3 plus: SQLite is the lowest-friction add given the storage server is already a single Node process holding per-key locks.

### 3.4 Retrieval freshness signal

Each retrieval result carries `(bm25_score, segment.updated_at, lineage_match: boolean)`. Surfaced in retrieved-segment blocks within the system prompt as a one-line metadata header. UI badges deferred with the sensemaking surface.

### 3.5 Sensemaking Surface — IN MVP, NARROWLY SCOPED

Per `docs/decisions/001-multisemantic-ui-substrate.md` (graph-as-substrate, ~85% confidence), the existing `@xyflow/react` graph in `DayPlanner.tsx` is the substrate for the Domain-facet sensemaking surface. Scope:

**MVP (in this release):**
- **Per-node segment overlay** — Project and Task nodes display a segment-count badge. Click opens a popover listing segments tagged with that lineage (summary, timestamp, key facts).
- **Lineage breadcrumb above retrieved replies** — when retrieval injects past context, an ephemeral header (`Loading: Project X › Task Y · 4 days ago · 3 segments`) renders above the assistant turn. The header is constructed from the system's record of what was injected, not from LLM self-report — this is what makes it satisfy the H7' "no LLM trust" verification constraint.
- **Manual merge/split** — surfaced from the segment popover; provides the correctability path for false-positive lineage placements.

**Fast-follow (deferred but unblocked):**
- Open-loop tray as glow/badges on graph nodes whose segments are flagged `open_loop = true`.
- `/archive` cards view (#12 from the DD pass) when segment volume outgrows popover navigation.
- Review mode (#6) if segment-management workload justifies a dedicated mode alongside mapping/focusing/execution.
- Lineage-repair wizard (#20) for backfilling cold-start-imported segments with `lineage = {}`.

Relation-to-Self / Abstraction views from v0.3 §3.5 remain absent because their facets do not exist yet. The graph substrate chosen here extends to those facets when they ship — segments would gain additional placement axes; the popover and breadcrumb generalize.

See `docs/working/multisemantic-ui-affordances-divergent.md` for the full divergent-design exploration including pruned alternatives.

### 3.6 Retrieval feedback — own table (per v0.3)

```sql
CREATE TABLE retrieval_feedback (
  id INTEGER PRIMARY KEY,
  query_hash TEXT NOT NULL,
  query_text TEXT NOT NULL,
  segment_id TEXT NOT NULL REFERENCES segments(id),
  retrieved_at TEXT NOT NULL,
  helpful INTEGER,
  contributing_indexes TEXT NOT NULL,
  UNIQUE(query_hash, segment_id, retrieved_at)
);

CREATE INDEX idx_rf_segment ON retrieval_feedback(segment_id);
CREATE INDEX idx_rf_query ON retrieval_feedback(query_hash);
```

Auto-population: when a retrieved segment's `id` is referenced in a subsequent assistant message (heuristic: literal ID mention, or a quoted substring of the segment's transcript), record `helpful = 1`. Explicit thumbs up/down deferred until UI exists for it.

In MVP, this table can be populated but doesn't need to drive any decisions — it accumulates the signal needed for the §6 measurement.

---

## 4. Index Structure

### 4.1 Primary indexes (always on)

- `segments` — see §3.3.
- `segments_fts` — FTS5, trigram, BM25.
- `retrieval_feedback` — see §3.6.
- `chat_archive_<date>.jsonl` — already exists. Authoritative for compressed pre-summarization content.

Tag table is omitted in MVP (no free-form tags yet; lineage is denormalized on segment row).

### 4.2 Facet indexes — DEFERRED

`{relation,abstraction}_placement` and `{relation,abstraction}_paths` are not built in MVP because those facets don't exist yet. When added, they follow v0.3's closure-table pattern and live in the same SQLite file.

Domain "placement" is denormalized onto `segments` (`value_id`/`goal_id`/`project_id`/`task_id`) since it has bounded depth and is set at segment-close time.

### 4.3 Placement policy

**Synchronous (write path, on segment close = summarization event):**

Add to the existing flow in `useChatSummarizer.summarizeConversation`, after the `/api/log/archive` POST:

1. POST to a new `/api/segments` endpoint with the full segment payload.
2. Storage server: insert into `segments`, FTS trigger fires automatically.
3. No classification call needed in MVP — Domain is from focus lineage, already known.
4. `needs_classification` defaults to `false` because there's no Relation/Abstraction work to do; flag exists for forward compatibility.

If the segment-write fails, the existing summary still happens (the in-conversation summary message and the archive write proceed). Segment-write failure is logged; manual repair via a future `multisemantic reclassify` CLI re-derives missing segment rows from `chat_archive_*.jsonl`.

**Cold-start import (in MVP):**

One-shot script `scripts/import_archives.js`: reads every `logs/chat_archive_*.jsonl`, for each entry constructs a Segment with `id = entry.summary_id` (or generated UUID if missing), `thread_id = derived from date`, `lineage = {}` (no historical focus available), and inserts. FTS rebuilds. Total entry count is small (low hundreds at most), so this runs in seconds.

---

## 5. Context Management (Periodic Commit)

The existing flow in `useChatSummarizer.ts:29-92` already implements v0.3 §5 closely. The needed changes:

1. **Archive write happens first** — already does (`/api/log/archive` is called before `setConversation` replaces the slice in state). Good.
2. **Segment row write happens after archive** — new step (§4.3.1).
3. The replacement summary message in conversation state (the `summaryMessage` constructed at line 51) carries `summaryData` already; add the segment's `id` so future tool calls can re-fetch the full archived transcript on demand.

Ground-truth statement: `chat_archive_*.jsonl` ∪ `multisemantic.sqlite` ∪ live conversation state. Archive is authoritative for any content compressed out of conversation state.

If archives are lost, all pre-compression content for compressed segments is lost (segments table retains the summary). Same property as v0.3, same threat model.

---

## 6. Measurement Plan

The v0.3 plan's facet decisions are mostly moot here because Relation-to-Self and Abstraction aren't shipping. What's left to measure:

### 6.1 Window

Three months of regular use. If retrieval (BM25 + lineage filter) isn't surfacing helpfully-cited segments by then, BM25-alone needs a redesign (probably toward the sensemaking surface) rather than waiting for stronger signal.

### 6.2 Ground-truth signal

- **Implicit positive:** retrieved segment quoted/referenced in subsequent assistant turns within 5 messages.
- **Implicit negative:** retrieved segment present in system prompt but not referenced.
- Explicit signals deferred (no UI).

### 6.3 Pre-registered decision criteria (Domain-facet retrieval only)

**Keep `RELEVANT PAST CONTEXT` injection in system prompt** if, over the window:
- ≥30 system prompts include retrieved segments AND
- ≥30% of those include a retrieved segment that gets cited in the subsequent assistant turn

Otherwise: reduce injection frequency or move retrieval behind an explicit `recall_segments` tool call only.

**Keep lineage filter** if, in retrievals where focus is active, lineage-filtered top-K differs from unfiltered top-K AND the filtered version has a higher cite rate.

Otherwise: drop the lineage AND, return to BM25-only.

### 6.4 Confounding mitigation

Halfway through the window, run a 2-week period where retrieved segments are surfaced more prominently (e.g., as a separate UI panel rather than only inside the system prompt). Engagement during that period feeds the same decisions in §6.3 as a tiebreaker.

### 6.5 Baseline

System prompt with no past-segment injection (current state). Retrieval must demonstrate value over current behavior.

### 6.6 Decision-rule integrity

Pre-registered rule lives in `docs/decisions/NNN-multisemantic-retrieval-eval.md` before measurement starts. Rule changes mid-measurement reset the window. Same defense as v0.3 §6.6.

---

## 7. Storage Layout

```
data/
  multisemantic.sqlite             # NEW: segments + FTS + retrieval_feedback
  multisemantic.sqlite.last-good   # mirror the existing last-good rollback pattern
  <key>.json                       # unchanged: planner-values, planner-goals, etc.
  <key>.last-good.json             # unchanged
  uploads/                         # unchanged

logs/
  chat_history.jsonl               # unchanged: every LLM call trace
  chat_archive_<date>.jsonl        # unchanged shape; entries become segment-aligned
  data_updates.jsonl               # unchanged
```

Recovery semantics:
- **Lose `multisemantic.sqlite`:** rebuild segments + FTS from `chat_archive_*.jsonl` via the cold-start importer. Lineage placements are lost (no historical focus signal). Retrieval feedback is lost.
- **Lose archives:** segments table retains summary + transcript-as-of-compression; pre-compression detail is gone for compressed slices.
- **Lose planner JSON files:** unrelated; existing per-key `last-good` rollback handles this.

---

## 8. MVP Scope

In:
1. `better-sqlite3` dependency, `multisemantic.sqlite` provisioned by `storage-server.js` at startup.
2. `segments` table with denormalized lineage columns; `segments_fts` (trigram); `retrieval_feedback` table.
3. New `/api/segments` POST endpoint, called from `useChatSummarizer.summarizeConversation` after the existing archive write.
4. Cold-start importer `scripts/import_archives.js` for existing `chat_archive_*.jsonl`.
5. `recall_segments` tool exposed to the LLM (BM25 query + optional lineage filter, returns top-K).
6. Optional system-prompt injection of top-K segments matching the resolved focus lineage (gated behind a config toggle so the §6.5 baseline run is straightforward). Injection state is recorded so the §3.5 breadcrumb can render programmatically.
7. `Message.id` populated at producer time for user/assistant messages.
8. `thread_id` introduced as conversation-level state, rotates on conversation clear.
9. Pre-registered §6 decision rule in `docs/decisions/`.
10. **UI substrate per decision 001**: xyflow per-node segment-count badge + popover; system-generated lineage breadcrumb above retrieved-context assistant turns; manual merge/split from the popover.

Out (fast-follow, not blocking MVP):
- Open-loop tray (graph badges/glow on `open_loop = true` segments).
- Archive cards view at `/archive`.
- Dedicated review mode (Mode 4 alongside mapping/focusing/execution).
- Lineage-repair wizard for cold-start-imported segments with empty lineage.

Out (deferred indefinitely):
- Cross-encoder rerank.
- Relation-to-Self and Abstraction facets (vocabulary, classifier, placement tables).
- Dense embeddings.
- `/segment` command, focus-change auto-split, semantic boundary detection.
- Cross-segment link inference.
- `multisemantic export` named operation (the per-key JSON pattern already gives planner data this property; segments-only export waits until needed).
- Multi-user, cloud sync, login.

---

## 9. Property Tests

Net-new tests for the segment store:

- `segment-id-stable-across-rewrites` — updating a segment row preserves `id`.
- `segment-thread-id-groups-correctly`.
- `archive-write-precedes-segment-insert` — order invariant in summarization flow.
- `archive-recovery-reconstructs-pre-compression-transcript` — pulls original messages back via `archive_file` + `summary_id`.
- `cold-start-import-is-idempotent` — re-running the importer produces no duplicates.
- `fts-finds-newly-written-segment` — synchronous FTS visibility after `/api/segments` returns.
- `fts-tokenizer-handles-identifiers` — `Nat.add_succ`, snake_case, `∀` etc. all findable.
- `lineage-filter-returns-only-matching-segments`.
- `retrieval-feedback-attached-to-correct-segment-via-table-join`.
- `summarization-produces-segment-with-lineage-from-focus-state`.

Existing planner-state tests are unaffected — the segment system is additive.

---

## 10. Open Questions / Accepted Risks

### 10.1 Open design questions

- **`thread_id` semantics:** rotate on conversation clear is the proposal. Alternatives: rotate on app restart, rotate on focus change, rotate manually. Pick after first month of use.
- **System-prompt injection threshold:** how many segments? what BM25 score floor? Defaults to be tuned during the §6 measurement window; start at top-3 with no floor.
- **Retrieval freshness vs. relevance tradeoff:** MVP weights pure BM25. A recency boost is straightforward to add later if old segments dominate retrieval.
- **Lineage filter strictness:** AND vs. OR across `valueId`/`goalId`/`projectId`/`taskId`. AND is too narrow when only a top-level focus exists; OR with weighting is probably right. Pin down before §6 starts.

### 10.2 Carryover risks (from v0.3)

- **Summary-mediated recall:** if a segment summary loses key terms, FTS won't find them via the segment row. Mitigation: `key_facts` array in `summaryData` already preserves high-salience terms; archive is reachable via cold-start importer or a future archive-search command. Risk accepted.
- **Single-user assumptions:** the per-key lock pattern in `storage-server.js` and the in-process SQLite handle both assume single-user. No change.
- **Vocabulary archaeology:** moot in MVP since the only facet vocabulary is the planner hierarchy itself, which the user already maintains. Re-emerges if Relation/Abstraction ship.
- **Feature-flag debt:** the system-prompt-injection toggle (§8.6) is a real flag. If §6 measurement says drop injection, the flag should be removed entirely.

### 10.3 Resolved by this adaptation

- Storage backend → SQLite for segments; per-key JSON unchanged for planner data.
- Ground-truth regime → segments + archives + planner-JSON tiers, each with its own recovery path.
- Tokenizer → trigram, baked at table creation.
- Rerank in MVP → no, deferred per scale argument.
- Facet count in MVP → one (Domain), free from existing planner hierarchy.
- Sensemaking surface → in MVP, narrowly scoped to the xyflow graph per decision 001 (badges + popover + breadcrumb + merge/split).
- Cold-start import → in MVP, trivial at this corpus size.
- Where the segment-write hook fires → inside `useChatSummarizer.summarizeConversation`, after `/api/log/archive`.

---

## 11. References

Same reference list as `Multisemantic_v0_3.md` §11. Most directly load-bearing for this adaptation:

- **SmartSearch** (Derehag et al., 2026) — informs §3.1 BM25-as-primary, but the rerank-in-MVP recommendation is *not* adopted here for scale reasons.
- **Faceted Search** (Tunkelang; Wei et al.) — informs the deferred sensemaking surface direction; Domain-as-filter alone in MVP.
- **Pyserini** (Lin et al., 2021) — preserved as upgrade path if SQLite FTS5 hits a ceiling.
- **Engaging vs. Engagement** (Owen, 2026) — informs the §6 measurement framing (cite-rate as signal, not raw retrieval count).

---

*Drafted from `Multisemantic_v0_3.md` + current `dayplanner-web` state, May 2026. Mirrors v0.3 section structure for diff-against-original.*
