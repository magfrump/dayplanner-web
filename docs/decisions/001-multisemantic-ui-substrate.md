**Goal**: Choose the UI substrate for surfacing the multisemantic v0.3 segment store and retrieval features to the user.
**Project state**: Pre-implementation decision for multisemantic v0.3 MVP · standalone (no branch yet) · not blocked.
**Task status**: complete (decision recorded; RPI plan phase is the next step)

---

## Context

`docs/multisemantic_v0_3_dayplanner.md` specifies a chat-segment store with BM25/FTS retrieval, lineage filtering, and feedback capture. The MVP is mostly backend; the UI layer was under-specified, with multiple deferred or ambiguous surfaces:

- `RELEVANT PAST CONTEXT:` injection — should the user see what was injected?
- Per-segment `open_loop` flag is "user-settable" with no UI defined (§2.1)
- Retrieval freshness signal — UI badges deferred (§3.4)
- Explicit feedback (thumbs up/down) — deferred until UI exists (§3.6)
- §6.4 anticipates a "separate UI panel" experiment
- Cold-start importer leaves `lineage = {}` — no described repair path
- The §3.5 sensemaking surface was framed as deferred, but per user direction this design discussion is what that deferral was waiting for

The blue-sky vision (`docs/blue_sky_vision.md`) sharpens the requirement: the user wants to *verify* that nothing has been silently dropped, and views any model-mediated answer to "is everything still tracked?" as untrustworthy because LLM output has no programmatic guarantees.

Full divergent-design exploration: `docs/working/multisemantic-ui-affordances-divergent.md`.

## Options considered

Three surviving clusters from the DD pass:

- **Cluster E — Graph-as-substrate**: extend the existing xyflow graph with per-node segment counts and popovers; add a system-generated lineage breadcrumb above retrieved-context-augmented assistant turns; allow segment merge/split from the popover.
- **Cluster F — Review mode**: introduce a fourth top-level mode (alongside mapping/focusing/execution) dedicated to segment review, with timeline, filters, and full-text search. Includes graph badges as entry points.
- **Cluster G — Chat-side transparency, graph untouched**: an always-on memory pane in the chat showing currently-loaded segments; an `/archive` cards view; merge/split from the cards view.

## Decision and rationale

**Adopt Cluster E (Graph-as-substrate).** Confidence ~85%.

MVP composition:
1. **Per-node segment overlay (#5)** — Project and Task nodes in the xyflow graph gain a segment-count badge. Click opens a popover listing segments tagged with that lineage (summary, timestamp, key facts).
2. **System-generated lineage breadcrumb (#13)** — when retrieval injects past context, an ephemeral header is rendered above the assistant turn (`Loading: Project X › Task Y · 4 days ago · 3 segments`). The breadcrumb is constructed from the system's record of what was injected, not from LLM self-report — this is what makes it satisfy H7' programmatic verification.
3. **Manual merge/split (#19)** — surfaced from the segment popover; covers the H4 "false positives must be correctable" constraint without requiring a separate management UI.

Fast-follow (deliberately not MVP):
- **Open-loop tray (#8)** as glow/badges on graph nodes whose segments are flagged `open_loop = true`. Reuses the same substrate; this is the H8 payoff.
- **Archive cards view (#12)** at `/archive` once segment volume outgrows popover navigation.
- **Review mode (#6)** if segment-management workload grows enough to justify a dedicated mode.
- **Lineage repair wizard (#20)** when cold-start import lands and there is a backlog to triage.

Rationale:
- **H7' (programmatic verification, no LLM trust)** is the load-bearing constraint. Cluster E satisfies it via system-driven graph badges and a system-generated breadcrumb. Clusters that depend on LLM-mediated transparency (citations, "why did you bring that up?") were discarded.
- **H8 (fast-follow path for open loops)** was the tiebreaker between E and G. Open loops are likely a killer feature, and the graph extends to them cheaply (a glow on the existing node). Cluster G would have required a second UI substrate for open loops.
- **S8 (don't over-bet on xyflow)** is real and noted, but the stress-test "revealed preferences" move favors *meaningful extensions* of an existing surface over building a parallel one. If the graph extension fails to land, the archive cards view (#12) is a planned fast-follow and absorbs the navigation role.
- **Token-budget concerns are not the driver.** H3 was reframed: the system prompt budget is large in absolute terms; what matters is *transparency* via explicit control. The breadcrumb gives the user that control without restricting injection.

## Consequences

**Easier:**
- Open-loop surfacing as a fast-follow — the substrate is already in place.
- Verification of "is everything tracked?" — every Project/Task node now visibly carries its segment count.
- Correcting wrong placements — merge/split lives where the user already navigates the hierarchy.
- Updating `docs/multisemantic_v0_3_dayplanner.md` §3.5 to remove the deferral framing; the sensemaking surface is being built, just narrowly scoped.

**Harder:**
- Graph node visual density — badges and segment popovers add load to nodes that were previously simple boxes. May require a "compact" mode if the graph is heavily populated.
- Future open-loop visualization conventions — glow vs. badge vs. color must be chosen consistently with the segment-count badge to avoid signal collision.
- If the user disengages from xyflow as the planner surface, segment navigation loses its primary home; the archive cards view (#12) fast-follow becomes mandatory rather than optional.
- The breadcrumb component must be wired to *system-recorded injection state*, not regenerated from LLM output. This requires plumbing in the chat send path to record what was loaded.

## Revisit triggers

How to read: each entry is a concrete, observable condition that should prompt re-evaluating this decision. Future readers can grep this section when their context changes to see whether earlier decisions still apply.

`if user opens segment popovers <60% of segment-inspection actions over 6 weeks (graph adoption failed). if segment count >500 and popover navigation becomes the dominant friction (archive view becomes MVP). if open-loop fast-follow gets descoped indefinitely (H8 was load-bearing in this decision). if user reports "I thought something was lost" after MVP ships (H7' verification didn't land — likely need #7 archive-presence markers added). if xyflow is replaced as the primary planner surface (substrate decision must be redone against the new surface). if segment volume per Project/Task node exceeds ~20 within a single popover render (need pagination or a list view).`

## Pruned candidates and why

How to read: each entry is `[candidate-ID]: one-line reason for discard`. Future DDs in adjacent areas can grep this to avoid regenerating already-pruned approaches.

`[1]: silent retrieval — fails H3' explicit control and H7' verification. [3]: LLM-mediated citations — fails H7' (cannot be programmatically verified). [4]: always-on memory pane — violates S3 exec-mode minimalism; pane competes with chat width. [9]: conversational-only — same H7' failure as #3. [10]: drag-from-graph — interesting but pattern unclear without an explicit control surface; reabsorb as a future affordance on top of E. [11]: heatmap — passive awareness without actionability; can be added on top of E later. [14]: notebook margin — doesn't fit visual idiom (S2) and fights execution mode (S3). [15]: voice-of-past visual diff — would need system-tracked source attribution to pass H7'; even then, marginal value over breadcrumbs (#13). [17]: implicit feedback only — no path to correct (H4) and no verification surface (H7'). [18]: "why did you bring that up?" — relies on LLM self-report, fails H7'. [Cluster A minimal-touch]: deprecated after H8 elevation — Trace modal is debug, not navigation. [Cluster G chat-side]: H8 fatal — would require a separate substrate for open-loop fast-follow. [Cluster F review mode]: reabsorbed as fast-follow extension of E rather than a competing cluster.`

## Stress-test mitigations

How to read: *Push to extreme* mitigation — extending E's logic to high segment counts (1000+) surfaced popover scaling as a soft cliff. Tradeoff matrix updated to reclassify archive cards view (#12) from "competing cluster" to "fast-follow companion to E," triggered when popover navigation breaks down rather than at MVP.

How to read: *Invert thesis* mitigation — sincerely arguing for cluster G (chat-side, graph untouched) made the H8 weakness explicit and turned what looked like a wash on the matrix into a clear discriminator. The recommendation hardened from "lean E" to ~85% confidence after this move.

How to read: *Revealed preferences* mitigation — the user noted xyflow is not yet committed-to (S8). The move surfaced the counter-pattern: users extend what they already use. This argued for E *over* G, on the grounds that meaningful graph extensions are likelier to drive adoption than parallel surfaces are. Risk noted in revisit triggers ("if xyflow is replaced as primary planner surface").
