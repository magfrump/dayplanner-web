**Goal**: Pre-register the decision rule for the multisemantic v0.3 retrieval evaluation, so the §6 measurement is not adjudicated after the fact.
**Project state**: Phases 0–4 of `docs/working/multisemantic-v0_3-implementation-plan.md` are shipped on `dev`. This decision doc is the first half of Phase 5; the other half is the `/api/segments/eval-snapshot` endpoint.
**Task status**: complete (rule pre-registered; window not yet open — see §Window start).

---

## Context

`docs/multisemantic_v0_3_dayplanner.md` §6.6 requires the §6.3 decision criteria to be recorded in a decision doc *before* measurement begins. Phase 3 shipped the `RELEVANT PAST CONTEXT` injection path behind the `enableRelevantPastContext` toggle (default off); flipping that toggle without a pre-registered rule would let the rule drift to match whatever outcome the data produces. This document is the lock-in.

The rule is reproduced verbatim from spec §6.3. The window-start trigger is set per the Phase 5 caveat: the segments table is empty today and the first weeks of toggle-on use would be too sparse to evaluate.

## Pre-registered decision criteria (§6.3, verbatim)

**Keep `RELEVANT PAST CONTEXT` injection in system prompt** if, over the window:
- ≥30 system prompts include retrieved segments AND
- ≥30% of those include a retrieved segment that gets cited in the subsequent assistant turn

Otherwise: reduce injection frequency or move retrieval behind an explicit `recall_segments` tool call only.

**Keep lineage filter** if, in retrievals where focus is active, lineage-filtered top-K differs from unfiltered top-K AND the filtered version has a higher cite rate.

Otherwise: drop the lineage AND, return to BM25-only.

## Ground-truth signal (§6.2, verbatim)

- **Implicit positive**: retrieved segment quoted/referenced in subsequent assistant turns within 5 messages.
- **Implicit negative**: retrieved segment present in system prompt but not referenced.
- Explicit signals deferred (no UI).

Operational mapping: the citation heuristic in `src/services/multisemanticRetrieval.ts:detectCitedSegments` is the implicit-positive detector. It writes `retrieval_feedback` rows with `helpful=1` for cited segments via `recordRetrievalFeedback`. Implicit negatives are the retrieved-but-not-fed-back rows; the snapshot endpoint computes the cite rate from this difference.

## Window

Three months of regular use, opening when **either** of the following first becomes true:

1. `SELECT COUNT(*) FROM segments WHERE deleted_at IS NULL AND (value_id IS NOT NULL OR goal_id IS NOT NULL OR project_id IS NOT NULL OR task_id IS NOT NULL) ≥ 30` — i.e., ≥30 segments with non-empty lineage have accumulated.
2. The lineage-repair wizard fast-follow ships and backfills cold-start-imported segments with lineage.

When one of those triggers fires, append the date as a `Window opened:` line below, and only then flip `enableRelevantPastContext` on for production use. The three-month clock starts on that date.

`Window opened: <unset>`

Rationale for the trigger (Phase 5 caveat in the implementation plan): backdating the window to the moment the toggle flips on would make the first weeks dominated by empty-retrieval calls, dragging the cite-rate denominator down for reasons unrelated to retrieval quality. The threshold is set low (30 segments) so the wait is bounded; the lineage-repair-wizard alternative is the parallel path for accelerating it.

## Confounding mitigation (§6.4)

Halfway through the window (i.e., week 6), run a 2-week period where retrieved segments are surfaced more prominently in the UI. The current substrate makes this cheap: the lineage breadcrumb above retrieved-context assistant turns can be expanded into a tray showing the retrieved segments themselves, behind a feature flag that auto-disables at the 2-week mark. Engagement during that period feeds the same §6.3 decisions as a tiebreaker.

## Baseline (§6.5)

System prompt with no past-segment injection. Today's behavior with `enableRelevantPastContext = false` is the baseline. Retrieval must demonstrate value over baseline; the §6.3 thresholds are calibrated against it.

## Decision-rule integrity (§6.6)

This document is the pre-registration. Rule changes mid-measurement reset the window (i.e., the three-month clock restarts and any prior snapshots are noted as pre-revision data, not deleted). Same defense as v0.3 §6.6.

If a rule clarification is needed (e.g., "what counts as a citation if the segment text appears via Markdown formatting?"), record it here in an addendum *before* the snapshot endpoint is consulted for that question. The addendum is what defines the rule from the moment it's written; prior data is bucketed separately if the clarification was load-bearing.

## Snapshot endpoint

`GET /api/segments/eval-snapshot?since=<ISO>&until=<ISO>` returns the counts the §6.3 rule consumes:

- `retrievalEvents` — distinct `(query_hash, retrieved_at)` tuples in the window.
- `citedRetrievals` — retrievals where at least one segment was cited (`helpful = 1`).
- `citeRate` — `citedRetrievals / retrievalEvents` (or 0 when no events).
- `segmentsRetrieved` — total `retrieval_feedback` rows in the window.
- `segmentsCited` — rows with `helpful = 1`.
- `lineageActive` / `lineageInactive` retrieval counts are out of scope for the primary endpoint — the second §6.3 rule (lineage-filter keep/drop) needs a comparative experiment, not just a snapshot. Track separately when the comparative arm is set up.

Window defaults: if `since`/`until` omitted, returns all-time. Recommended use is to pass `since = <Window opened: date>` once the window opens.

## Consequences

**Easier:**
- Once the window opens, deciding whether to keep injection becomes a single endpoint call followed by a threshold check.
- Rule integrity is verifiable: this file's git history is the audit log for any rule change.

**Harder:**
- The two §6.3 rules differ in measurability. Rule 1 (injection threshold) maps cleanly to the snapshot endpoint. Rule 2 (lineage filter) needs a paired-comparison setup that does not exist yet; that setup is deferred to §6.4 confounding-mitigation week.
- The window cannot open until the corpus grows. If the lineage-repair wizard slips, the user is paying for retrieval-code maintenance without the data to evaluate it.

## Revisit triggers

How to read: each entry is a concrete, observable condition that should prompt re-evaluating this decision. Future readers can grep this section when their context changes.

`if segment count reaches 30 with non-empty lineage and lineage-repair wizard has not shipped (window-opening trigger 1 has fired — set Window opened: date and flip toggle). if lineage-repair wizard ships before threshold 1 (open the window on wizard-completion date instead). if the cite-rate denominator at week 6 of the window is <10 retrieval events (the window opened too early — restart the clock or accept that the §6.4 mitigation is the primary signal). if rule 2 (lineage filter) needs to be measured before the §6.4 confounding-mitigation window (build the comparative arm; do not infer from rule 1 data). if a citation-heuristic edge case (Markdown formatting, paraphrase) is found to materially change the cite count (record the clarification here before re-running the snapshot).`

## Pruned candidates and why

How to read: each entry is `[candidate]: one-line reason for discard`.

`[hard-code today as window start]: bakes in the warm-up-sparsity problem the Phase 5 caveat warned against. [tie window start to toggle flip]: same problem in different clothing — the toggle flips with an empty corpus. [drop the §6.3 thresholds and rely on author judgment]: defeats the §6.6 pre-registration purpose; the rule must precede the data.`
