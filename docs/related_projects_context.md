# Related Projects — Context and Incoming Feedback

Working notes synthesizing two adjacent projects whose feedback and design ideas
will shape dayplanner-web going forward.

## Source 1 — Metaformalism Copilot

A Live-Theory–flavored workspace (Aditya Adiga's project, Next.js) that turns
a single source artifact into multiple parallel formal representations: a
semiformal proof, Lean 4 code, a causal graph, a statistical model, property
tests, balanced perspectives, and user-defined custom artifact types. Built
around a few load-bearing ideas:

- **Generalization via inclusion, not exclusion.** Different contexts get
  different formalisms of the same insight rather than one lowest-common
  abstraction.
- **Decomposition graph.** The "Decomposition Panel" extracts propositions
  from a source into an interactive dependency graph; each node can be
  formalized independently with its own context.
- **Bidirectional/iterative refinement.** The user shapes outputs through
  selection, in-place edits, whole-text transformations, and a per-node
  detail view — not by accepting a one-shot generation.
- **Multi-panel workspace, sidebar nav, multiple persisted sessions.** State
  lives in localStorage; an Analytics panel logs every API call.
- **Verification where it can be grounded.** Lean 4 proofs go through a real
  type-checker (Dockerized service); the UI explicitly shows a "verifier
  offline" state instead of pretending verification happened.

## Source 2 — "Next Live Interface" critique list

Twenty-two criticisms/concerns of an HCI-for-AI design (the "MFC post draft
counterexamples" list). Themes that are directly relevant here:

- **Chat is not strictly worse.** Chat interfaces have HCI support; pushing
  everything into structured artifacts can hurt accessibility (#1, #2). Some
  affective use cases benefit from "sycophantic" warmth (#3).
- **Structure can mislead.** Some artifact structures invite misinterpretation
  (token weights ≠ confidence; #4). Auto-generated outputs can feel patronizing
  or act as anchors (#20).
- **Verification is harder than it looks.** Verification may be ill-defined
  in open domains (#5). It *cannot* be grounded in AI output (#12). Citation
  via abstract carries different confidence than via deep read (#14). Being
  honest about scrutiny level is hard (#15).
- **Scaffolding has costs.** Overhead when the model is already good (#6).
  Don't spell everything out every time — want transparent, flexible,
  domain-appropriate context that is *model input*, not necessarily *user
  text input* in the current session (#7, #7.1).
- **Decomposition isn't always clean.** Divergent (vs. convergent) steps must
  be handled gracefully (#8). Decomposition has both local and global
  constraints (#9). A series of small changes can obfuscate (#16).
- **Inspection and complexity hurt novices.** Inspection may be hard for
  novice users (#10). Interface complexity creates cognitive overhead (#18).
- **Cross-session is weak.** Tracing across sessions needs massive
  improvement, including the ability to recurse (#21). Exporting a single
  artifact must include all necessary parent context (#22).
- **Other notes.** How does this play with non-LLM models (#11)? Formal vs.
  practical compute complexity straddles different evaluation criteria (#13).
  Reliability of UXR studies is itself complex (#19). Need to clarify exact
  intentions to users and verify those via UXR (#17).

---

## What this means for dayplanner-web

Mapping the above onto the parts of dayplanner-web that already exist or are
planned in `blue_sky_vision.md` and `context_manager_options.md`.

### 1. The hierarchy *is* a decomposition graph

Value → Goal → Project → Task is functionally the same shape as
metaformalism's decomposition panel: a dependency graph where each node can
be reasoned about with its own context. This is already half-built; what it
*doesn't* yet do is:

- Allow a node to carry per-node context that modifies how the LLM treats it
  (metaformalism's "each node can be formalized independently with its own
  context"). Right now mode-aware visibility is global, not per-node.
- Visualize the graph dynamically when the shape isn't tree-like — exactly
  the issue flagged in `blue_sky_vision.md` ("playtesting various monsters …
  many items at different points in a write→test→analyze→rewrite cycle").
  Critique #8 ("divergent vs. convergent steps") is the same observation.

### 2. Modes are pluralistic representations

`focusing` / `mapping` / `execution` already implement the "generalization via
inclusion" idea: the same hierarchy gets a different formal projection in
each mode. The metaformalism framing suggests this is the right direction
and worth leaning into harder — modes aren't just visibility filters, they're
*different formalisms of the same underlying state*. Candidates worth
exploring later:

- A "narrative" or "venting" mode (matches Option 3 in
  `context_manager_options.md`).
- An "execution log" mode that surfaces the kind of mixed-media progress
  artifacts described in `blue_sky_vision.md` (drawings, CAD, playtest notes).

### 3. Chat stays — but isn't the only surface

Critiques #1–#2 push back on artifact-only interfaces. Dayplanner already
has chat as primary; the work is to add lightweight *structured surfaces*
(refresh suggestions, plan-controls panel, summary cards) without falling
into the trap of making chat feel obsolete. Keep chat first-class.

### 4. Context hygiene is exactly the cross-session-tracing problem

Critique #21 ("tracing across sessions needs massive improvement, ability to
recurse") and #22 ("export must include all necessary parent context") are
the same problem `context_manager_options.md` is trying to solve. The
current implementation (Option 1 / Periodic Summarizer in `usePlannerAI`)
matches the "Commit & Collapse" recommendation but is exposed to the
gaslighting risk from Option 2 — once a SummaryCard replaces 10 messages,
recursion back into "what was actually said" requires going to the archive
log, which the UI doesn't currently surface.

Concrete implications:

- The archive (`logs/chat_archive_*.jsonl`) needs a viewer in the app, not
  just on disk.
- A summary card should carry a pointer back to the archived slice so a
  click can re-expand it ("recursion" in the critique's sense).
- Exporting a single task or project should bundle the relevant summaries +
  archived slices, not just the current state.

### 5. Verification can't be grounded in the AI's own output

Critique #12 maps directly to anything that involves the LLM judging its
own suggestions — refresh review, capacity inference, focus-lineage detection.
The metaformalism approach is instructive: when verification *can* be
grounded externally (Lean 4 type-checker), do it; when it can't, make the
ungrounded state visible ("verifier offline" badge). Equivalent for
dayplanner: when a suggestion is purely AI-derived, the UI should make that
provenance visible rather than presenting it as a fact.

### 6. Inspection overhead and patronizing outputs

Critiques #10, #18, #20 are warnings against the path metaformalism is on —
multi-panel, deep inspection, lots of generated artifacts everywhere.
Dayplanner's MVP-y, single-pane chat-plus-list shape is closer to the
"don't make novices inspect everything" end of the spectrum. Worth keeping
in mind whenever a panel/modal/tab is proposed: does it pay for the
cognitive overhead it adds?

### 7. Per-node context and prompt specialization

Critique #7 ("transparent, flexible, domain-appropriate context — model
input not necessarily user input") and the `blue_sky_vision.md` note about
importing prompts from humanlayer point at the same gap: the system prompt
is currently centralized in `aiContext.ts` with mode-aware visibility, but
there's no notion of *node-local* prompt specialization. Compare metaformalism's
custom-artifact designer (LLM-assisted prompt creation per artifact type) —
something analogous for projects/tasks ("this project has its own prompt
that gets layered onto the system prompt when this lineage is in focus")
would line up with both the vision doc and the critique.

---

## Open questions to bring to the next conversation

1. Is the right move to lean further into the decomposition-graph framing
   (richer per-node context, dynamic non-tree layouts), or to keep the
   hierarchy as a simple skeleton and put richness in the chat layer?
2. How visible should AI-provenance be in the UI? Always-shown badges?
   Hover-only? Only on items that haven't been user-confirmed?
3. What's the right "recursion back to source" affordance for SummaryCards
   — click-to-expand inline, separate archive viewer, or export-bundle?
4. Should modes get explicit per-node overrides ("this project is always in
   execution mode"), or stay session-global?
