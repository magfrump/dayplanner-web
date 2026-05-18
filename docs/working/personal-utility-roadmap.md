# Personal-utility roadmap (1 month → 1 quarter)

**Goal**: A phased, MVP-per-phase plan for the next 1–3 months of dayplanner-web work, organized around the user's currently-experienced blockers and the candidate features selected in the Diamond 2 divergence.

**Project state**: Standalone planning artifact · feeds future feature branches · not blocked.

**Task status**: in-progress (draft v4 — all picks resolved; #7 reframed as the boring-alternative baseline for #10; phase 3 gated on a trigger-bound decision rule built from #7's empirical results).

## Context and inputs

Upstream artifact: [`docs/working/purpose-framings-dayplanner.md`](./purpose-framings-dayplanner.md). The chosen framing is composite A — personal-utility, with sub-purposes #1 (morning momentum), #2 (anti-forgetting), #3 (next-action triage), #4 (project journal), #7 (recurring reminders), #13 (focus protection).

### User-stated blockers (actually experienced friction)

- **B1. Phone access with same data** — the app exists on a laptop. The user wants to use it from a phone with the same data view. Note: `vite.config.ts` already binds `0.0.0.0` and the recent "responsive layout" commit suggests some mobile work has happened, so this is *incomplete* mobile usability, not *absent*.
- **B2. Bulk-import project status from other work surfaces** — project state lives partly outside the app (other tools, files, notes); the user wants to pull it in without retyping. Strong overlap with the chosen #9 (auto-imported folder per project) and #10 (document RAG).
- **B3. Clean transitions between the planner and direct work surfaces** — the user opens the planner, then leaves to work in CAD, terminal, browser, etc. Returning without losing context is currently friction.

### Candidates selected by the user from Diamond 2 step 1

- **#7. Tags + saved filters** — orthogonal organization across the tree.
- **#9. Auto-imported folder per project** — files in a watched folder auto-attach to the project as journal entries.
- **#10. Document RAG with tree-of-summaries** — per-project recursive document indexing (no vector store).
- **#13. Time-of-day-aware nudges** — gentle reminders for recurring tasks at appropriate times.

### Mismatch surfacing

The blockers and the picks don't fully line up. To avoid quietly picking, here is the explicit mapping:

| User blocker | Picked candidate that addresses it | Coverage |
|---|---|---|
| B1 phone access | (none) | **Gap** — needs an added candidate. |
| B2 bulk import | #9 auto-import, #10 RAG | Strong. |
| B3 clean transitions | #9 partially (re-importing artifacts you produced elsewhere is one form of clean transition) | **Partial** — execution-mode hardening / parking (Diamond-1 candidate #15) would more directly serve this. |

Picked candidates that don't map to a stated blocker but were chosen anyway: #7 (tags + filters) and #13 (nudges). These are consistent with the chosen framing, so they stay in the plan, but they should be sequenced *after* blocker-driven work unless the user disagrees.

### Added candidates (to close the blocker gap)

- **#21a. Mobile usability + Tailscale (chosen)** — close out responsive UI gaps and reach the storage server from the phone via Tailscale's WireGuard mesh. ~6–10 hours of working time including responsive polish. Accepted tradeoff: the laptop must be on and awake when the phone reaches in. If that turns out to be a frequent miss in practice, revisit options are an always-on home box (middle option from the conversation) or hosted-with-auth (originally listed as #21b — discarded for this quarter; pulls in ~20–40h and an auth attack surface we don't need yet).
- **#22. Per-project context brief (since-last-focus exporter)** *(reshaped from the earlier session-handoff framing, which didn't fit)* — for each project, track a "last delivered brief" timestamp; on demand, compile a versioned update note containing every change accumulated since that timestamp (offhand chat mentions, files imported via #9, structural changes like new sub-tasks). The brief is what gets handed to an external tool — the typical workflow is opening the project in Antigravity, launching Claude Code in a terminal there, and feeding the brief in so Claude Code can compare current code/notes against what the planner has been accumulating. **MVP**: produce the brief and put it on the clipboard or write it to a file the workspace can read; expected-empty for many projects early on, becoming useful as #9 imports accumulate. **Stretch (out of MVP)**: a one-click launcher that opens the workspace and starts Claude Code with the brief preloaded. ~10–15h for MVP; launcher is deferred and not in this quarter's budget.

---

## Diagnose — constraints

Constraints derived from the chosen framing, the blockers, and known properties of the codebase. **H** = hard (must satisfy), **S** = soft (prefer to satisfy).

- **H1**. Personal data must never be committed (already enforced by `.gitignore`; planning must not weaken it).
- **H2**. Must not actively break existing modes (mapping / focusing / execution) — the chosen framing retains all of #1, #2, #3, #4, #7, #13 as live sub-purposes.
- **H3**. No guilt-tracking, streak-punishment, or other depression-hostile affordances. (From `blue_sky_vision.md`: user has noted depression and the venting problem; nudges must be dismissible without consequence.)
- **H4**. Solo maintenance — every feature must be supportable by one person; no infra that requires ongoing ops attention. (Means: prefer Tailscale over self-hosted-auth-server when both work.)
- **H5**. Each phase ships an *experienceable* MVP — the user's explicit phrasing was "iterate and experience MVPs." Each phase must end with a surface the user can actually use for ≥1 week before the next phase starts.
- **S1**. Token-budget awareness — features that interact with the LLM (#10 especially) must respect existing fallback chain and not blow up the system-prompt size.
- **S2**. LAN access remains intentional (`vite.config.ts` proxies — see project CLAUDE.md). Anything that breaks LAN access is a hard no; anything that *adds* a remote path is fine.
- **S3**. Therapeutic venting (#5) and longitudinal coherence (#12) should not be *broken* by any feature, even though they aren't primary success criteria.
- **S4**. Lint tolerance for `any` is intentional for now — don't waste a session removing existing ones, but don't introduce new ones in production paths.

### Non-obvious dependencies

- **#9 needs a place to land files**. The codebase already has `documents[]` per project (per CLAUDE.md, `read_project_documents` tool reads them) — so #9 can ride on that surface initially without needing the full #8 (journal feed per node). MVP path: extend the existing project-documents UI to accept a folder import and a watch-toggle.
- **#13 needs a recurrence primitive**. Without one, "nudges" reduce to "fire once at a time-of-day," which is the wrong shape. The recurrence primitive (Diamond-1 candidate #12) is a small data-model addition that #13 piggy-backs on.
- **#10 is the biggest by far**. Recursive summarization + tree traversal + chat-context integration is realistically 25–60 hours of working time even at MVP scope. It must come last in any 1-quarter plan, or scope-cut aggressively (e.g., "just index one project's three documents and serve via the existing tool").

---

## Match and prune (compressed — user already pruned)

The user pre-pruned the Diamond 2 candidates to {7, 9, 10, 13}; the gap analysis above adds {21, 22}. No further pruning needed.

| Candidate | B1 phone | B2 bulk import | B3 transitions | #1 morning | #2 anti-forget | #3 triage | #4 journal | #7 recurring | #13 focus |
|---|---|---|---|---|---|---|---|---|---|
| #7 tags + filters | ✗ | ~ | ✗ | ~ | ✓ | ~ | ~ | ✗ | ✗ |
| #9 auto-import folder | ✗ | ✓ | ~ | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ |
| #10 doc RAG | ✗ | ✓ | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ | ~ |
| #13 time-of-day nudges | ✗ | ✗ | ✗ | ~ | ~ | ✓ | ✗ | ✓ | ✗ |
| #21a Tailscale + responsive *(chosen)* | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| #22 per-project context brief | ✗ | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ~ |

Reading: **#21a is a multiplier on every other feature** — once the app works on phone, the value of every other feature increases because the access surface widens. That argues for putting it first regardless of how the rest sequences.

---

## Tradeoff matrix with effort estimates and falsifiable hypotheses

Effort estimates are *soft predictions, not caps*, per the DD workflow. Stated in "working hours" (focused time, not calendar time).

| Candidate | Effort (hours) | Risk | Core coverage | Falsifiable hypothesis |
|---|---|---|---|---|
| #21a Tailscale + responsive polish *(chosen)* | 6–10 | Low — Tailscale is well-trodden, responsive work already partly done | B1 fully, modulo laptop-on-and-awake | If we ship, within 2 weeks I'll have opened the app from my phone ≥5 times unprompted *and* the laptop-off failure mode will fire ≤1 time per week; counter-evidence: I never reach for it on mobile, I always switch back to laptop within 30 sec, or laptop-off blocks me ≥3 times per week. The laptop-uptime counter-evidence triggers the always-on-home-box revisit. |
| #7 tags + saved filters | 8–15 | Low — data-model addition, isolated UI | Anti-forget breadth; **also serves as the cheap baseline for #10 retrieval** | Two-part: (a) within 2 weeks I'll have created ≥3 saved filters I actually reuse — counter-evidence: I tag a few items then never define a filter; (b) by end of phase 2, the residual "I needed to find something and tags+filters didn't help" cases are identifiable, recurring, and would survive recursive document summarization — counter-evidence: tags+filters covers retrieval well enough that #10's marginal value is small. Part (b) is the input to the phase 2→3 gate. |
| #9 auto-import folder per project | 12–20 | Med — file-watching reliability across OS, conflict with existing `documents[]` UI | B2 bulk import; #4 journaling | If we ship, within 2 weeks I'll have ≥1 project that absorbs new files automatically and I refer to the imported feed during chat sessions; counter-evidence: imports happen but I never look at them. |
| #13 + recurrence primitive | 10–18 | Med — depression-friendly UX is the hard part, not the code | #7 recurring | If we ship, within 2 weeks the meal/cat/cleaning nudges are firing at the right times and being dismissed or acted on without negative emotional load; counter-evidence: I disable nudges within a week, or the nudges feel like guilt-tracking. |
| #22 per-project context brief (MVP) | 10–15 | Med — depends on what counts as "context since last focus" (chat mentions, imports, structural changes — at least these three need a unified collector) | B3 transitions, plus B2 (imports become consumable, not just stored) | If we ship, within 2 weeks of phase 2 closing I'll have generated a brief ≥3 times and at least one will have produced content I actually fed into Claude Code (or equivalent) during real workspace work; counter-evidence: every brief is empty when I check it, or non-empty briefs surface noise I don't want to forward. The empty-brief case is expected early; only counts as counter-evidence if briefs *remain* empty after ≥2 weeks of phase-1 imports flowing. |
| #10 doc RAG (MVP scope) | 25–50 | High — biggest by 2-3×; recursive summarization is iteration-heavy. Build gated on phase 2→3 decision rule (see below) | B2 deep, #2, #4 | Phase 3 commits to #10 only if the gate's "Continue" branch fires. If it does: within 4 weeks of phase 3 closing I'll ask grounded questions of the chosen project's docs ≥5 times with usable answers; counter-evidence: answers cite the wrong sections, or I never trust the answers enough to use them. |

### Stress-test pass (2 moves applied)

- **Boring alternative** (applied to #10 RAG): Is there a simpler approach that gets 80%? Yes — just attach docs and let the existing chat read them inline when execution-mode pulls them in via `read_project_documents`. The recursive summary tree is a *quality* improvement; the basic "read this doc" works without it. **Mitigation**: scope #10's MVP to "improve the existing `documents[]` flow to handle larger docs via section-by-section reading" rather than "build a full tree-of-summaries indexer." Saves ~10–20 hours in phase 3.
- **Failure-driven** (applied to #13 nudges): What new failure category does this introduce? Answer: depression-relapse coupling. If nudges arrive on a low day and feel like nagging, the failure isn't "feature didn't work" — it's "feature actively harmed the user." H3 (no guilt-tracking) is the constraint, but the mitigation needs to be in the UX itself: dismiss is one tap, no count of dismissals shown anywhere, no "you've skipped this 3 days in a row" framing. **Mitigation**: bake the "dismiss is free, no consequences shown" rule into the #13 MVP from day 1; falsifiable hypothesis includes "without negative emotional load."

---

## The phased plan

Three phases, sized to a quarter. Each phase ends with a *usable surface* the user can live with for ≥1 week (H5).

### Phase 1 (weeks 1–3 of working time): Reach + breadth

**Working-hours budget: ~20–35.**

1. **#21a Mobile access via Tailscale + responsive polish** (6–10h). Install Tailscale on phone and laptop; verify storage server reachable; close visible responsive gaps in `DayPlanner.tsx` and the modes that render on small screens. Deliverable: app works from phone over Tailscale.
2. **#7 Tags + saved filters** (8–15h). Data-model addition: optional `tags: string[]` on V/G/P/T entities. Tag input UI. Named filter views in mapping mode. Deliverable: I can tag and filter the tree.
3. **Slim form of #9 — folder-pick-and-attach** (6–10h). Reuse the existing project-documents surface; add "attach all files in this folder" and "watch this folder" toggle. *No journal-feed UI yet* — files land in the existing `documents[]`. Deliverable: I can pull a folder's worth of files into a project without retyping.

**End of phase 1 you can:** use the app from your phone, tag and filter your tree, and bulk-import a folder into a project. Two blockers (B1, partial B2) reduced, anti-forgetting widened.

**Live with it for ≥1 week before starting phase 2.** Falsifiable check at the end of that week: did I reach for the phone version unprompted ≥5 times? Did I use a saved filter ≥3 times? Did I import a real folder?

### Phase 2 (weeks 4–7): Recurring + transitions

**Working-hours budget: ~20–35.**

1. **#13 nudges + recurrence primitive** (10–18h). Data-model addition: `recurrence` on Task. Time-of-day-aware surfacing during normal app use; optional in-app banners (no push at first — push needs phase 1's hosting story to be finalized if it's anything beyond LAN). Apply the failure-driven mitigation: free dismiss, no consequence counters, no nagging framing. Deliverable: meals/cats/cleaning fire at the right times.
2. **#22 per-project context brief — MVP** (10–15h). Three pieces:
   - **Last-focus timestamp per project** — small data-model addition; updates when the focus-detection in `aiContext.ts` settles on a project for ≥2 turns (reusing the threshold the multisemantic substrate already uses for `thread_id` rotation, per project CLAUDE.md).
   - **Since-last-focus collector** — gathers chat mentions of the project (substring match against item name, same as existing focus detection), files imported into the project's folder after the timestamp (depends on phase 1 #9), and child entities created after the timestamp.
   - **Brief renderer + export** — markdown template ("Project X: context added since [timestamp]"); copy-to-clipboard button and a "save to file" option for the workspace; a "mark as delivered" action that advances the timestamp so the next brief is a clean delta.
   Stretch (out of MVP, out of this quarter): one-click launcher that opens Antigravity to the workspace, spawns a terminal with Claude Code, and preloads the brief. Worth scoping after the MVP proves the underlying brief is useful.
   Deliverable: per-project versioned briefs I can hand off to Claude Code in real workspace work.

**End of phase 2 you can:** be nudged about recurring tasks without depression-coupled side effects, and produce a versioned context brief for any project to hand off to Claude Code or another external tool. Blocker B3 reduced (the planner now feeds the workspace where the actual work happens), B2 deepened (imports become consumable, not just stored), sub-purpose #7 (recurring) directly served.

**Live with it for ≥1 week before evaluating the phase 2→3 gate.**

### Phase 2 → 3 gate: is #10 (RAG) worth building?

By the end of phase 2 you'll have lived with #7 (tags + filters) for ~7 weeks across both phases. #7 is the boring-alternative baseline for #10's retrieval value — if tags + filters covers most of "find context across the tree," #10's marginal value shrinks.

Apply this trigger-bound decision rule before committing phase 3 working time:

| Branch | Trigger | Action |
|---|---|---|
| **Continue (build #10 as planned)** | I can name ≥3 specific, recurring retrieval needs that tags+filters can't meet — needs that *would* be met by recursive document summarization (e.g., "what did I conclude about X across these three docs," "which file describes Y"). | Proceed with phase 3 as scoped — RAG MVP for one chosen project via extended `read_project_documents`. |
| **Revisit (re-scope #10)** | tags+filters covers 60–80% of retrieval, but there's a *specific narrow gap* (e.g., only deep document Q&A on long files, not cross-tree). | Before phase 3 begins, re-scope #10 down to that narrow gap — possibly halving the budget. The resulting feature is named in the re-scope; falsifiable hypothesis is rewritten against the narrower target. |
| **Reverse (drop #10 from this quarter)** | #7 has effectively closed the retrieval gap — the cases I notice are either non-recurring or wouldn't be solved by RAG anyway. | Redirect the ~25–50h phase 3 budget to **scoping up #22 to include the one-click Antigravity launcher** (the deferred stretch goal). Rationale: this serves a confirmed blocker (B3) at a confirmed working surface, vs. building RAG into uncertain marginal value. |

Each trigger is *observable* by end of phase 2: I can either name the recurring gaps or I can't. The Reverse fallback is pre-named (the #22 launcher), so reversal at the gate is a binary check rather than a fresh strategy debate under deadline pressure.

### Phase 3 (weeks 8–13): branch-dependent

**Working-hours budget: ~25–50.** The deliverable depends on which gate branch fired.

- **Continue branch — #10 Doc RAG, scoped MVP** (25–50h). Apply the boring-alternative mitigation: do **not** build a full tree-of-summaries indexer. Instead:
   - Pick *one* high-value project's documents as the MVP target.
   - Build a recursive section-summarization pass over those docs (cached to disk).
   - Wire the summaries into `read_project_documents` so the existing tool serves grounded responses on that project.
   - If the MVP works on one project, extend to all projects in a phase 3b that runs after the ≥1 week live-with period.
- **Revisit branch — narrowed #10** (re-scoped during gate evaluation; budget likely 10–25h). Targets only the specific gap the gate identified. Remaining time goes back into the pool for #22 launcher, #15 (execution-mode hardening), or whatever has surfaced as most pressing by week 8.
- **Reverse branch — #22 launcher scope-up** (25–40h estimated). Build the one-click Antigravity launcher that was deferred from phase 2's #22 MVP: workspace-open URL or shell command, terminal + Claude Code spawn, brief preloaded via file the workspace can read. Deliverable: clicking a button in the planner opens the workspace with the brief already in Claude Code's context.

**End of phase 3 you can:** depending on branch — ask grounded questions about one project's docs (Continue), have a narrowly-targeted retrieval improvement (Revisit), or click one button to go from planner to Claude-Code-in-workspace with a context brief preloaded (Reverse). Sub-purposes deepened vary by branch but the chosen-framing coverage is preserved either way.

**End of quarter:** all three named blockers reduced; sub-purposes #1/#2/#3/#4/#7 all touched. Sub-purpose #13 (focus protection) is *partially* served by #22 but not by execution-mode hardening (#15) — that remains a candidate for a future quarter.

### Total working-hours budget

~65–120 working hours over 13 weeks. At 5–10 hours/week of focused project time, this is achievable in a quarter with room to slip.

---

## Resolved

- **Phone access (B1)**: Tailscale + responsive polish (#21a). Accepted tradeoff: laptop must be on and awake. Revisit triggers recorded in #21a's hypothesis row above.
- **#22 reshape**: the session-handoff framing was wrong. Replaced with the per-project context-brief exporter (versioned update notes consumable by Claude Code in Antigravity). MVP in phase 2; launcher is the pre-named Reverse fallback for the phase 2→3 gate, not a commitment.
- **#10 RAG scope-cut**: confirmed. Phase 3 ships the boring-alternative version (extend `read_project_documents` to handle one project's larger docs section-by-section). The recursive-summary tree from the vision doc is deferred to a future quarter.
- **#13 nudges**: confirmed high-value pick.
- **#7 tags + filters**: confirmed, *and* reframed as the boring-alternative empirical baseline for #10. Living with #7 across phases 1–2 generates the evidence that decides the phase 2→3 gate (Continue / Revisit / Reverse on #10). This is why #7 stays in phase 1 despite not mapping to a stated blocker — it's load-bearing for the quarter's biggest scope decision.

Plan is ready to commit. Phase 1 can start whenever you want to kick it off.

---

## Phase 1 implementation progress

| Sub-task | Status | Notes |
|---|---|---|
| #21a Tailscale + responsive polish | **Done (uncommitted)** — narrow-width fixes applied; Tailscale install remains a user-side action | Section rows (Values/Goals/Projects/Tasks) now use `min-w-0`/`shrink-0` so long names and tag chips don't push edit/delete buttons off-screen. `EditItemModal` paired grids collapse to a single column below `sm:` (importance/urgency, deadline/recurrence). Documents list entry uses `min-w-0` so `truncate` actually engages. `FolderAttach` row wraps (input takes full line on narrow, buttons sit together). Tab row (Plan/Data/Map/History) has `flex-wrap` instead of horizontal clipping. Full suite (122) still passes. |
| #7 Tags + saved filters | **Done (uncommitted)** — code + tests on disk, lint and full test suite pass | Data model: `tags?: string[]` on V/G/P/T plus `SavedFilter`. UI: `TagInput` in `EditItemModal`, `TagChips` rows in every section, `TagFilterBar` above the data sections with AND-semantics filter + named saved filters persisted to `planner-saved-filters`. Tests: `src/utils/tags.test.ts`, `src/components/Planner/TagFilterBar.test.tsx`. |
| #9 Slim folder-pick-and-attach | **Done (uncommitted)** — code + tests on disk, lint and full test suite (122) pass | Backend: `GET /api/list-folder?path=<absolute>` in `storage-server.js` (non-recursive, dotfile-filtered, capped at 500). Type: `watchedFolders?: string[]` on Project. UI: `FolderAttach` in the project branch of `EditItemModal` (folder path + Attach + Watch toggle). Hook: one-shot rescan in `usePlannerData` that merges new files into `documents[]` on initial load. Tests: `list-folder.test.js`, `src/services/folderImport.test.ts`, `src/components/Planner/FolderAttach.test.tsx`. |

**Phase 1 status: complete on the code side, uncommitted.** The Tailscale install step is the only remaining bit and is a user-side action (install + auth on phone and laptop). Phase 1 is ready for the live-with period the plan calls for (≥1 week before Phase 2 starts).

Hypothesis check at end of phase-1 live-with (per the plan's falsifiable rows):
- Did I reach for the phone version unprompted ≥5 times? (#21a)
- Did I create and reuse ≥3 saved filters? (#7)
- Did a real folder import land useful content? (#9)

Next iteration starting points (no urgent work; all Phase 1 code is shipped):
1. **Review + commit** the uncommitted Phase 1 work (single squash commit or three feature commits — recommended split: `feat: phase 1.1 tags + saved filters`, `feat: phase 1.2 folder import + rescan`, `chore: phase 1.3 narrow-width layout fixes`).
2. **Phase 2 prep** — confirm phase 1's hypotheses are tracking, then begin the data-model addition for #13 nudges (recurrence primitive on Task — already exists as a free-text `recurrence?: string` field; needs structured shape for time-of-day scheduling).

