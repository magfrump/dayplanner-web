# Bulk-tag UX iteration (#7 follow-up) — design

**Goal**: make tag *maintenance* fast enough that the user will actually keep tags fresh. Addresses the phase-1 live-with finding that #7's tagging UX was "bad enough I won't maintain filters without changes" (see [`personal-utility-roadmap.md`](./personal-utility-roadmap.md) interim check-in, 2026-05-19). Sequenced **before the phase 2→3 gate** so the gate measures the tags+filters *concept*, not authoring friction.

**Scope**: bulk tag-assignment only. Freshness/staleness affordance is **deferred** — the review surface below covers pruning without new data.

## Decisions (locked)

- **UI shape**: a dedicated **Manage-tags modal**, opened from the data view. (Chosen over inline bulk-select mode and per-tag pill management.)
- **Persistence**: **immediate-apply**. Each checkbox toggle calls the existing `updateItem(type, {id, tags})`, which merge-patches and persists that one item (`usePlannerData.ts:130`). No batching, no Cancel — the modal has only **Done** (close).
- **Freshness**: deferred. Staleness is handled by opening the modal and un-checking stale members.

## Components & wiring

### `src/components/Planner/TagManagerModal.tsx` (new)

Props:
- `open: boolean`, `onClose: () => void`
- `values, goals, projects, tasks` — the four collections
- `allTags: string[]` (from `collectAllTags`)
- `onSetItemTags: (type, id, tags: string[]) => void` — wired to `updateItem`

Internal state:
- `selectedTag: string` — the working tag (existing or freshly typed).
- `newTagDraft: string` — text in the "new tag" input.

Behavior:
- **Tag selector**: a `<select>` of `allTags`, plus a text input + "Add" to create a new tag. Creating normalizes the text and sets `selectedTag` to it. If the normalized new tag already exists, just select it.
- **Checklist**: four labelled groups (Values / Goals / Projects / Tasks). Each item is a checkbox + name. `checked = (item.tags ?? []).includes(selectedTag)`.
- **Toggle**: on change, compute the next tags array (add or remove `selectedTag`) and call `onSetItemTags(type, item.id, next)`. State updates flow back through props (parent owns the data), so the checkbox re-reflects membership.
- **Empty/disabled state**: when `selectedTag === ''`, the checklist is disabled with a "Pick or create a tag" prompt.
- **Footer**: live count of items whose tags include `selectedTag`. **Done** button calls `onClose`.

### `src/components/Planner/PlannerDataView.tsx` (edit)

- Add `updateItem` to the `actions` prop type.
- Add local `tagManagerOpen` state and a **"⚙ Manage tags"** button rendered near the filter bar, visible whenever `values+goals+projects+tasks` is non-empty (so it works before any tags exist).
- Render `<TagManagerModal>` with `onSetItemTags={(type,id,tags)=>actions.updateItem(type,{id,tags})}`.

### `src/DayPlanner.tsx` (edit)

- Pass `updateItem` into `PlannerDataView`'s `actions` (already returned by `usePlannerData`).

### `src/utils/tags.ts` (edit) + `src/components/Planner/TagInput.tsx` (refactor)

- Extract `normalize` (trim → lowercase → collapse whitespace to `-`) from `TagInput` into `tags.ts` as an exported `normalizeTag`. Import it in both `TagInput` and `TagManagerModal` so normalization can't diverge.

## Data flow

```
checkbox toggle
  → TagManagerModal computes next tags[]
  → onSetItemTags(type, id, next)
  → PlannerDataView: actions.updateItem(type, {id, tags: next})
  → usePlannerData.updateItem: setX(...) + window.storage.patch(key,'update',item,id)
  → props flow back down → checkbox reflects new membership
```

No new storage key; tags continue to live on each item. No tag entity — a tag exists exactly while ≥1 item carries it, so "delete a tag" = uncheck its last item.

## Testing (TDD)

- `src/utils/tags.test.ts`: `normalizeTag` — lowercasing, whitespace→hyphen, trim, idempotence.
- `src/components/Planner/TagManagerModal.test.tsx`:
  - renders items grouped by level; checkbox reflects current membership for the selected tag
  - toggling an unchecked item calls `onSetItemTags` with the tag **added**
  - toggling a checked item calls `onSetItemTags` with the tag **removed**
  - creating a new tag selects it; checking an item then assigns that new tag
  - footer count reflects number of members of the selected tag
  - checklist disabled when no tag selected

## Out of scope

- Freshness timestamps / usage counts (deferred; revisit only if rot persists).
- Inline bulk-select across sections.
- Renaming a tag in place (no tag entity to rename; would be a find-replace across items — not now).
- Search/filter within the checklist (add only if item lists prove unwieldy).
