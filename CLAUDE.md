# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev:all          # storage server (3002) + Vite dev server (5173)
npm run server           # storage server only
npm run dev              # Vite only (binds 0.0.0.0 for LAN access)
npm run build            # tsc -b && vite build
npm run lint
npm test                 # vitest (jsdom)
npm test -- <pattern>    # run a single test file or matching test name
```

The README mentions port 3000 for the backend — that's stale. The storage server actually listens on **3002** (`storage-server.js`), and Vite proxies `/api/storage` and `/api/read-file` to it.

## High-level architecture

Three tiers run together via `npm run dev:all`:

### 1. Frontend (`src/`) — React 19 + Tailwind 4 + `@xyflow/react`

Entry: `src/DayPlanner.tsx`. Two custom hooks own all state:

- **`usePlannerData`** (`src/hooks/usePlannerData.ts`) — the Value → Goal → Project → Task hierarchy plus `Capacity`. Each level is stored in its own key on the storage server; the server is schema-agnostic.
- **`usePlannerAI`** (`src/hooks/usePlannerAI.ts`) — chat conversation, tool dispatch, refresh-suggestion generation, auto-summarization. Tool implementations are factored out into `src/services/plannerTools.ts`.

### 2. LLM layer (`src/services/`)

- **`llm.ts`** holds the provider registry (`anthropic`, `ollama`, `gemini`) and the **fallback chain**: `sendSmartMessage` tries the user's preferred provider first, then falls back through `FALLBACK_ORDER` (`anthropic → gemini → ollama`), skipping providers without configured credentials. On recovery, it prepends a `[System Notice: ...]` to the response so the user sees what happened.
- **`getProvider`** wraps every `sendMessage` call to log request/response/error to `/api/log/chat` (with API keys masked). This powers the in-app Trace modal.
- **`aiContext.ts → buildSystemContext`** assembles the system prompt. **Mode-aware visibility filtering** lives in `getVisibleContextData`:
  - `mapping` — show all values/goals/projects, but only inbox/high-importance tasks
  - `focusing` (default) — show all incomplete items
  - `execution` — collapse the hierarchy to *only* the focused lineage, plus any `documents[]` attached to the focused project (read via the `read_project_documents` tool)

  Focus detection is a substring match: it scans the last 3 messages for any item name, then walks up the hierarchy.

### 3. Storage server (`storage-server.js`) — Express on port 3002

- One file per key under `data/<key>.json`, plus a `<key>.last-good.json` rollback copy written after every successful write. GET falls back to the last-good copy automatically if the primary is corrupt or missing.
- **Concurrency**: serialized per-key via an in-memory `Map` of promise chains (`acquireLock`). Don't add cross-key transactions — the lock is per-key by design.
- **Migration** on startup: if a legacy `planner-data.json` exists, its top-level keys are split into per-key files and the legacy file is renamed to `.migrated`.
- File uploads go to `data/uploads/` via multer and are served statically at `/uploads`.
- Chat traces append to `logs/chat_history.jsonl`; archived (post-summarization) conversations go to `logs/chat_archive_<YYYY-MM-DD>.jsonl`.
- `/api/read-file` is sandboxed by size (100KB max) but **not by path** — it can read any file the server process can. Don't expose this server to untrusted networks.

## Data model

`src/types/planner.ts`. Hierarchy: **Value → Goal → Project → Task**. Children reference parents by numeric `id` (timestamp at creation time). `Capacity` (energy, mood, stress, timeAvailable, physicalState) is a single object on its own storage key. `Suggestion`s are produced by the daily refresh and applied via the `RefreshReviewModal`.

## Conversation summarization

Defined in `usePlannerAI.summarizeConversation`. Auto-triggers when the conversation grows past **25 messages**: the oldest messages (everything before the most recent 15) get sent to `generateContextSummary` (which forces a `commit_summary` tool call to extract a paragraph + capacity scores + key facts), and a `SummaryCard` message replaces them inline. The full original slice is archived to the storage server before being dropped from state.

Manual trigger: the Archive button in the header calls `summarizeConversation(true)`, which has a lower threshold (5 messages) and bypasses the auto-skip checks.

## Vite proxy gotchas

`vite.config.ts` proxies `/api/anthropic`, `/api/ollama`, `/api/storage`, and `/api/read-file`. The Ollama proxy **spoofs the `Origin` header to `http://localhost:11434`** because Ollama's CORS check rejects any other origin — don't remove that `proxyReq.setHeader` call.

## Tests

Vitest with jsdom. Component tests use `@testing-library/react`. Storage-server tests use `supertest` against the exported Express `app`. Tests are colocated next to source (`*.test.ts(x)`), with a few integration-style tests for the storage server living at the repo root (`storage-server.test.js`, `storage-patch.test.js`, `concurrency.test.js`, `restore-data.test.js`).

## Working notes

- `@typescript-eslint/no-explicit-any` is intentionally tolerant for now (rapid prototype). Don't introduce new `any`s in production paths, but don't waste a session chasing existing ones.
- `planner-data.json`, `data/`, `logs/`, and `*.last-good` are git-ignored — they contain personal data.
- `docs/blue_sky_vision.md` and `docs/context_manager_options.md` capture the user's product intent. Read these before proposing UX changes.
- `CODE_HEALTH.md` is a lightweight pact: refactor as you go, address lint warnings before they pile up, and flag components growing past ~300 lines for a health-check cycle.
