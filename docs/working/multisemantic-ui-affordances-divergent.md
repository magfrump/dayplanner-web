**Goal**: Brainstorm UI affordances for the segment store + retrieval features described in `docs/multisemantic_v0_3_dayplanner.md`, using divergent design.
**Project state**: Pre-implementation ideation for multisemantic v0.3 MVP · standalone (no branch yet) · not blocked.
**Task status**: in-progress (diverge + diagnose + tradeoff matrix drafted; tentative recommendation pending user sign-off)

---

## Context

`docs/multisemantic_v0_3_dayplanner.md` lays out a chat-segment store with BM25/FTS retrieval, lineage filtering, and feedback capture. The MVP is mostly backend (SQLite, FTS5, segment write hook). The doc explicitly defers the "sensemaking surface" UI (§3.5) but leaves several UI hooks ambiguous or under-specified:

- `RELEVANT PAST CONTEXT:` injection into system prompt — should the user see what was injected? (§3.1, §6.5)
- Per-segment `open_loop: boolean` is "user-settable" but no UI is described (§2.1)
- Retrieval freshness signal — "UI badges deferred" (§3.4)
- Explicit thumbs up/down "deferred until UI exists for it" (§3.6)
- §6.4 confounding mitigation explicitly anticipates a "separate UI panel" experiment
- Cold-start importer leaves `lineage = {}` for historical archives — no described path to repair them
- `thread_id` rotates on conversation clear — purely automatic; no user control surface
- The `recall_segments` tool is exposed to the LLM but not directly to the user

The blue sky vision (`docs/blue_sky_vision.md`) sharpens what the user actually cares about:
- Verifying structured data is *all there* — fear of forgetting goals/values
- Context that *moves* between facets, never silently deletes ("I would prefer not to ignore or delete it entirely!")
- Visual designs that shift shape based on what's being represented (tree vs. iteration cycle)
- LLM context cleanup as a first-class concern

This brainstorm is about the *interface* layer that sits above the retrieval substrate.

## 1. Diverge — candidate UI directions

20 candidates. Spans visibility (always-on / on-demand / never), placement (chat-inline / panel / graph / separate view), interactivity (passive / clickable / drag-drop / editable), and primary metaphor (citation / annotation / timeline / graph).

1. **Pure transparency (do-nothing)** — no UI changes. Retrieval shows up only inside the system prompt, invisible to the user. Existing Trace modal is the only debugging surface.
2. **Trace-modal expansion** — when retrieval injects segments, the chat shows a small `[N past segments included]` link above the assistant turn; clicking opens TraceModal scrolled to the retrieval block. Reuses existing infrastructure.
3. **Inline citation chips** — when the assistant cites or quotes a retrieved segment, render a numbered footnote at the end of the message. Click to expand the segment summary. Mirrors how Claude.ai surfaces citations.
4. **Always-on memory pane** — dedicated right-side panel showing "what the AI is currently aware of": top-K retrieved segments with relevance scores, lineage badges, freshness, thumbs up/down. Visible during execution mode.
5. **xyflow segment overlay** — extend the existing graph: each Project/Task node gains a "segment count" badge; clicking opens an inline timeline of that node's segments. Open-loop segments glow.
6. **Review mode (Mode 4)** — new top-level mode alongside mapping/focusing/execution. Segment timeline becomes the primary surface; chat collapses. Lineage filter, time scrubber, full-text search.
7. **Archive-presence markers on chat** — every message with an archived counterpart shows a subtle dot/marker; tooltip names the segment. Lets the user verify nothing important got dropped during summarization.
8. **Open-loop tray** — small persistent surface (top-of-chat or bottom-right) listing user-flagged open loops. One-click "resume" loads the segment as context for the next turn.
9. **Conversational interface** — no new UI. User interacts with segments via chat ("show past segments about X", "mark this as open loop"). Tool calls do everything.
10. **Drag-from-graph-into-chat** — dragging a node from the xyflow graph into the chat pre-loads matching segments as system context for the next turn.
11. **Heatmap on graph** — graph node color-saturation reflects recency × frequency of segment matches. Passive awareness of where the AI's attention has been clustering.
12. **Per-segment cards in archive view** — dedicated `/archive` route showing every segment as a card (summary, lineage chips, timestamp, key facts). Sortable, filterable. No graph integration.
13. **Lineage breadcrumbs above retrieved replies** — when the system prompt injects past context, the chat renders `Bringing in: Project X › Task Y · 4 days ago` as an ephemeral header above the assistant turn. Inline, no panel.
14. **Notebook-style margin** — chat is the body; segments are listed in a margin (book-annotation style). Active segments highlight in real time as the assistant references them.
15. **Voice-of-the-past visual diff** — the assistant's reply visually distinguishes content drawn from retrieved segments (different background tint or italic) versus fresh thinking. Hover reveals the source segment.
16. **Open-loop digest in daily refresh** — no real-time UI for open loops; the existing daily refresh / RefreshReviewModal surfaces "you have N open loops untouched for a week" with one-click resume actions.
17. **Implicit feedback only** — skip explicit thumbs up/down; rely entirely on the cite-rate signal §6 already plans. UI shows nothing about feedback.
18. **"Why did you bring that up?" affordance** — single button on each assistant message that asks the LLM to explain which retrieved segments shaped the answer. Lazy on-demand transparency, no upfront UI cost.
19. **Manual segment merge/split** — archive-view operation: user can merge two segments (one continuous thread split across summarizations) or split a segment that covered two unrelated topics.
20. **Lineage repair wizard** — surfaces unlineaged segments (cold-start imports with `lineage = {}`) one at a time and asks the user to assign Value/Goal/Project/Task. Optionally batched.

### Generation health check

- **Clustering**: groups exist around graph integration (5/10/11), chat-side annotation (7/13/14/15), list-style archive views (12/19/20), and panel-based memory surfaces (4/8). Distribution is broad; no cluster dominates >5 candidates on the same dimension.
- **Missing perspectives**: do-nothing (#1, #17) and naive list (#12) covered. "Ideal if effort were free" represented by #4, #6, #14. Newcomer-style suggestion: #14 (notebook margin) — the kind of thing someone reaching for a familiar metaphor would propose.
- **Vagueness**: each candidate names a specific surface, trigger, and behavior. None should fail step 3 specificity.
- **Dimensional anchoring**: candidates move on at least four distinct dimensions (visibility, placement, interactivity, metaphor). Not anchored on one lever.

Health check passes; no additional candidates added.

## 2. Diagnose — concrete problems and constraints

### Constraint revision (after user pass, 2026-05-05)

User clarified five constraint reads. Revisions:
- **H2 → soft.** xyflow as central surface is not fully adopted by the user. Replacing or extending it is on the table.
- **H3 → reframed.** Token budget is large in absolute terms; this is no longer a *technical* constraint. The hard constraint is **explicit user control over what's loaded for UX/transparency reasons** — not capacity. Renamed to H3'.
- **H5 → soft.** Cold-start lineage backfill is valuable but optional. Lineage repair wizard (#20) is *not* MVP-blocking.
- **H7 → elevated and clarified.** Verification is critical *because LLM output cannot be trusted programmatically.* Any affordance that depends on the model accurately reporting state (citations, "explain what you used", model-mediated archive descriptions) fails this. Verification must come from the system, not the LLM.
- **S5 → removed.** §3.5 sensemaking-surface deferral was waiting for *this* design discussion, not a later one. Building the sensemaking surface now is in scope.

Open question answers (from §4):
- **Q3 (injection aggressiveness)**: scale with validated retrieval quality. Low-friction default for the case where retrieval is good; explicit control for the case where it isn't (which is the expected case early on).
- **Q4 (open loops in MVP)**: fast-follow, *not* MVP. But likely a "killer feature" — design must leave room.
- **Q5 (lineage repair wizard MVP)**: not blocking.

### Hard constraints (revised)

- **H1. Single-user, local-first.** No cloud round-trips for navigation.
- **H3'. Explicit user control over loaded context is required for transparency UX.** The user must be able to see *programmatically* (not via LLM self-report) what segments are in the current system prompt, and override that selection. Aggressiveness of automatic injection must scale with measured retrieval quality.
- **H4. False-positive retrievals will happen.** UI must let the user notice them and *correct* (not just dismiss) — fix lineage, merge/split, demote, etc.
- **H7'. Verification must be programmatic, independent of LLM output.** Because model calls have no programmatic guarantees, any "is everything I worked on still tracked?" affordance has to be backed by the system reading SQLite/archives directly, not by asking the model.
- **H8. Open-loop fast-follow path must be unblocked by MVP shape.** Open loops are post-MVP, but the chosen UI substrate must extend to surface them once they ship — without rebuilding the substrate.

### Soft constraints (revised)

- **S1. Avoid feature-flag debt.** One instrumented pattern, not two gated by toggle.
- **S2. Match existing visual idiom.** Sparse, dense, utility-first.
- **S3. Preserve focus during execution mode.** At most a single passive indicator while execution mode is active.
- **S4. Cognitive load is low.** User is doing focused work, not research.
- **S6. Cold-start lineage backfill should be possible.** Not blocking, but the architecture should leave a path.
- **S7. Context that "moves", not "disappears".** Retired/relocated segments should remain discoverable.
- **S8. Don't make new commitments to xyflow unless they earn their keep.** H2-soft means the graph is *available* as a surface, but pinning the design to it should justify the bet.

### Constraints dropped from prior pass

- ~~H2 hard~~ → soft S8
- ~~H3 (token budget)~~ → reframed as H3'
- ~~H5 (cold-start blocking)~~ → soft S6
- ~~H6 (cite-rate measurement integrity)~~ → still valuable, but no longer hard. The user prioritized verification over clean measurement.
- ~~S5 (defer §3.5)~~ → removed per user direction

## 3. Compatibility matrix (revised against new constraints)

| # | Candidate | H3' explicit ctrl | H4 correctable | H7' programmatic verify | H8 fast-follow path | S2 idiom | S3 exec mode | S6 backfill | S7 moves not deletes |
|---|-----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | Pure transparency | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| 2 | Trace-modal expansion | ✓ | ~ | ✓ | ~ | ✓ | ✓ | ✗ | ~ |
| 3 | Inline citation chips | ~ | ~ | ⚠ relies on LLM | ✗ | ✓ | ✓ | ✗ | ✗ |
| 4 | Always-on memory pane | ✓ | ✓ | ✓ | ✓ | ~ | ✗ | ~ | ✓ |
| 5 | xyflow segment overlay | ~ | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✓ |
| 6 | Review mode (Mode 4) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7 | Archive-presence markers | ~ | ~ | ✓ | ~ | ✓ | ~ | ~ | ✓ |
| 8 | Open-loop tray | ~ | ~ | ✓ | ✓ first-class | ✓ | ~ | ~ | ✓ |
| 9 | Conversational interface | ✗ | ~ | ⚠ relies on LLM | ✗ | ✓ | ✓ | ~ | ✗ |
| 10 | Drag-from-graph-into-chat | ✓ | ✓ | ~ | ~ | ~ | ~ | ~ | ~ |
| 11 | Heatmap on graph | ~ | ~ | ✓ | ✓ | ~ | ✓ | ~ | ✓ |
| 12 | Archive cards view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 13 | Lineage breadcrumbs | ✓ | ~ | ✓ programmatic | ~ | ✓ | ✓ | ✗ | ~ |
| 14 | Notebook margin | ~ | ✓ | ✓ | ~ | ✗ doesn't fit idiom | ✗ | ~ | ~ |
| 15 | Voice-of-past visual diff | ~ | ~ | ~ system-tracked OK | ✗ | ~ | ✓ | ✗ | ✗ |
| 16 | Open-loop digest | ~ | ~ | ✓ | ✓ first-class | ✓ | ✓ | ~ | ✓ |
| 17 | Implicit feedback only | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| 18 | "Why did you bring that up?" | ~ | ~ | ⚠ relies on LLM | ✗ | ✓ | ✓ | ✗ | ✗ |
| 19 | Manual merge/split | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ |
| 20 | Lineage repair wizard | ~ | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ |

Key: ✓ addresses well · ~ partial/uncertain · ✗ doesn't address · ⚠ actively makes worse.

### Reads from the revised matrix

- **LLM-mediated transparency now fails H7'** — #3 (citation chips), #9 (conversational), #18 ("why did you bring that up?") all depend on the model accurately reporting what it used. Discard.
- **§3.5 sensemaking-surface candidates are now first-class** — #5 (graph overlay), #6 (review mode), #11 (heatmap) are no longer pre-builds. They go from flagged to viable.
- **H7' specifically rewards system-driven views** — #4 (memory pane), #5 (graph overlay), #6 (review mode), #12 (archive cards), #19 (merge/split), #20 (lineage repair). All read SQLite directly.
- **H8 (open-loop fast-follow) discriminates between substrates**: #5 (graph) and #6 (review mode) extend naturally into open-loop visualization; #2 (Trace modal) does not — it's a debug surface, not a navigation one. This is the key tiebreaker between graph-based and modal-based clusters.

### Surviving candidate clusters

**Cluster E (NEW — graph-as-substrate)**: #5 (xyflow segment overlay) + #13 (lineage breadcrumbs in chat for "what's loaded right now") + #19 (merge/split via segment view). Graph is the verification surface; chat gets a thin transparency strip. Open-loop tray (#8) drops onto the graph as glow/badges in fast-follow.

**Cluster F (NEW — review mode)**: #6 (Mode 4 Review) + #5 (graph badges as breadcrumb to review mode) + #19. Dedicated mode for segment work; doesn't intrude on focusing/execution. Heavier upfront cost; clearer separation of concerns.

**Cluster G (chat-side transparency, graph untouched)**: #4 (always-on memory pane) + #12 (archive cards view at `/archive`) + #19. Doesn't bet on xyflow at all — respects S8. Pane gives explicit control; archive view gives navigation; merge/split for correction.

**Cluster A (deprecated — minimal touch)**: was #2 + #8 + #20. Drops out: fails H8 (Trace modal doesn't extend to open-loop surfacing) and H7' (sufficient verification requires more than a modal).

## 4. Tradeoff matrix on surviving clusters

| Cluster | Effort estimate | Risk | Core coverage | Key downside | Falsifiable hypothesis |
|---------|-----------------|------|---------------|--------------|------------------------|
| **E. Graph-as-substrate** (#5 + #13 + #19) | ~3-5 days. xyflow node decoration + segment-list popover + breadcrumb component + merge/split form. Reuses existing Project/Task nodes. | Medium. Bets on xyflow being the right substrate (S8 — user hasn't fully adopted it). Mitigation: graph extension provides tangible verification value, which may be exactly what makes it stick. | H3'✓ H4✓ H7'✓ H8✓ S6✓ S7✓ | If user disengages from the graph, all segment navigation loses its home. Visual density on graph nodes climbs as segments accumulate. | "If we ship cluster E, within 6 weeks the user will use the graph (vs. archive view fallback) for ≥60% of segment-inspection actions, and the count of segments unverified after a day's work drops to 0. Counter: user reports never opening segment popovers, or repeatedly asks 'is X tracked?' despite popovers being a click away." |
| **F. Review mode** (#6 + #5 + #19) | ~5-8 days. New mode infra, route, layout, segment list/filter/timeline, plus cluster-E's graph badges as entry points. | Low-medium. Cleanly separated, doesn't crowd existing modes. Heavier upfront. Risk: mode might rarely be entered → wasted build. | H3'✓ H4✓ H7'✓ H8✓ (dedicated home for open loops) S6✓ S7✓ | Highest upfront cost. Adds a fourth mode to a three-mode UX that's still settling. May defer "verify during normal flow" because verification lives behind a mode switch. | "If we ship cluster F, within 6 weeks the user will enter review mode at least 2× per active week and complete merge/split or lineage edits in ≥30% of those visits. Counter: review mode entered fewer than 1×/week, or only entered to leave again." |
| **G. Chat-side transparency** (#4 + #12 + #19) | ~2-4 days. Right-side memory pane component, `/archive` route with cards, merge/split form. No xyflow changes. | Low. Doesn't bet on graph adoption (S8 ✓). Risk: violates S3 (always-on pane competes with focus during execution mode); pane real estate disputes with chat width. | H3'✓ H4✓ H7'✓ S6✓ S7✓ — but H8 weak: open-loop tray would need yet another surface, since archive view and pane don't naturally extend to "unresolved threads scattered across lineages." | Pane consumes screen real estate during execution. Archive view is the second navigation surface (after planner data view). H8 weakest of the three — open loops need their own surface, can't ride this one. | "If we ship cluster G, within 6 weeks the user will reference the memory pane during ≥40% of focused chat sessions and never report 'I thought something was lost'. Counter: pane gets minimized/ignored, or H7' anxieties recur." |

### Stress-test pass

Applied **boring alternative**, **invert thesis**, **revealed preferences**, **push to extreme** — selected because the decision is consequential, has a leading candidate (E), and depends on user behavior (revealed preferences) and growth (push to extreme).

- **Boring alternative**: Could a lighter version of E work? E.g., #2 (Trace-modal expansion) + #19 only, no graph badges. Verdict: insufficient. Loses H7' (can't see "all my segments by lineage at a glance") and H8 (Trace modal is a debug surface, not a navigation substrate). Boring version fails the constraint that made the user prioritize this work.

- **Invert thesis (argue for G over E)**: User said xyflow not yet committed-to (S8). Cluster G respects that — no further xyflow bets. Pane + archive view is also more familiar UX. Counter: H8 says open loops are a likely killer feature. Open loops naturally surface as glow/badges on graph nodes (E) but require a *new* surface in G. Building G now and then a second graph integration later for open loops doubles surface area. **Inversion does not survive H8.**

- **Revealed preferences**: User extends what they already use, even imperfectly. xyflow is currently used during planner-data-view sessions. Adding *meaningful* segment information to it is the kind of extension that converts tentative use into adoption — vs. building a parallel surface (G) that competes with the graph for attention. This *strengthens* E. But noted: if the user is actively migrating away from the graph, E becomes a sunk-cost bet.

- **Push to extreme**: At 1000+ segments accumulated over a year+, can the graph hold up? Per-node segment counts scale fine; popovers need pagination/filter. Archive view is still useful as a fallback when popover navigation breaks down. Add to E's plan: archive view (#12) as a fast-follow companion to graph navigation, but not MVP-blocking — popover lists with a "see all" link is enough at MVP scale.

### Tradeoff matrix update from stress-test

- **Cluster E modified**: scope-of-MVP includes graph badge + popover + breadcrumb + merge/split. Archive view (#12) reclassified as fast-follow, after first batch of segments accumulates and popover scaling becomes felt.
- **Cluster G**: H8 weakness is now confirmed-fatal at MVP scope — picking G means committing to a second UI build for open loops.
- **Cluster F**: still viable, but the boring alternative within F (just enter review mode for everything) loses verification-during-flow. F also requires E's graph-badge work to even know review mode is worth entering. So F is essentially "E + a bigger separate room for segments." **F effectively becomes a fast-follow extension of E**, not an alternative.

### Tentative recommendation (pending user sign-off)

**Cluster E (Graph-as-substrate)** at ~85% confidence.

Concrete MVP composition:
1. **#5 — xyflow segment overlay**: each Project/Task node shows a segment count badge. Click opens an inline popover listing recent segments (summary, timestamp, key facts). Segments without lineage get a special "unlineaged" surface (the optional cold-start backfill UI, but lazy — only shown when the user clicks into it).
2. **#13 — lineage breadcrumbs in chat**: when retrieval injects past context, render `Loading: Project X › Task Y · 4 days ago · 3 segments` as an ephemeral, *system-generated* (not LLM-generated) header above the assistant turn. This satisfies H3' explicit-control by being legible, programmatic, and click-through to the popover from #5.
3. **#19 — manual merge/split** from the segment popover.

Fast-follow (deliberately not MVP):
- **#8 — open-loop tray**: implemented as glow/badge on graph nodes whose segments are flagged `open_loop = true`. Reuses E's substrate.
- **#12 — archive cards view** at `/archive`: when segment count outgrows popover navigation.
- **#6 — review mode**: when segment-management workload justifies a dedicated mode.
- **#20 — lineage repair wizard**: when cold-start import lands and there's a backlog to triage.

Axis of disagreement (E vs. G): *bet on graph adoption vs. preserve graph optionality.* No prior stated preference; the tiebreaker is H8 — open loops as a fast-follow killer feature need a substrate that extends to them, and only the graph does so cheaply.

## 5. Pruned candidates (anti-portfolio note)

How to read: each entry is `[candidate-#]: one-line reason for discard`. Future DDs in adjacent areas can grep this to avoid regenerating already-pruned approaches.

`[1]: silent retrieval — fails H3' explicit control and H7' verification. [3]: citations come from LLM — fails H7' (can't be programmatically verified). [9]: conversational-only — same H7' failure as #3. [14]: notebook margin doesn't fit visual idiom (S2) and fights execution mode (S3). [15]: voice-of-past visual diff would need system-tracked source attribution to pass H7'; even then, marginal value over breadcrumbs (#13). [17]: implicit feedback only — no path to correct (H4) and no verification surface (H7'). [18]: "why did you bring that up?" — relies on LLM self-report, fails H7'. [10]: drag-from-graph — interesting but unfocused; behavior pattern unclear without explicit control surface. [11]: heatmap — passive awareness without actionability; better as a fast-follow visualization on top of E.`

Cluster-level: `[A minimal-touch]: deprecated after H8 elevation — Trace modal is debug, not navigation. [G chat-side]: H8 fatal — would require a separate substrate for open-loop fast-follow. [F review mode]: reabsorbed as fast-follow extension of E rather than a competing cluster.`

## 6. Next steps

1. **User confirms cluster E** (or names which axis they want to revisit — most plausibly: "I'm actively migrating away from the graph, pick G").
2. If confirmed: write `docs/decisions/NNN-multisemantic-ui-substrate.md` formalizing the choice and pointing back to this working doc.
3. Move to RPI plan phase for the MVP composition (badges, popovers, breadcrumb component, merge/split form).
4. Update `docs/multisemantic_v0_3_dayplanner.md` §3.5 to remove the "deferred" framing — sensemaking surface is being built, just scoped narrowly.

---

*Drafted as Steps 1–4 of `workflows/divergent-design.md`. Step 5 (decision record) deferred until user confirms cluster E or directs otherwise.*
