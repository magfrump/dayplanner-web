# Tags & saved filters

**Goal**: an orthogonal organization layer across the whole tree — attach freeform tags to any item, then narrow the list to just the items carrying a set of tags, and save tag sets you reuse. Implements item #7 ("Tags + saved filters") from [`personal-utility-roadmap.md`](./personal-utility-roadmap.md).

## What this is (and isn't)

Tags are a **manual, UI-only** organization layer. They live on every level of the hierarchy and let you slice the tree by something other than the Value → Goal → Project → Task structure (e.g. `#errand`, `#deep-work`, `#waiting-on-bob`).

What tags currently do **not** do:

- They are **not sent to the AI.** `aiContext.ts` does not serialize tags into the system prompt, so chat, the daily refresh, focus-lineage detection, and document retrieval all ignore them. Tagging an item changes what *you* see in the list, not what the model sees.
- They do **not** drive multisemantic segment lineage or any retrieval path.

If you want the model to know about something, put it in the item's name/description, not just a tag.

## Tagging an item

1. Open the **Edit modal** for any Value, Goal, Project, or Task.
2. Scroll to the **Tags** section near the bottom (`TagInput`, `EditItemModal.tsx:243-250`). It's present on all four item types — unlike folder-attach, which is project-only.
3. Type a tag and press **Enter** or **`,`** (comma) to confirm it. Confirmed tags appear as removable chips above the input.

### Tag normalization (what you type vs. what gets stored)

Every tag is normalized on entry (`TagInput.tsx:11`): trimmed, lowercased, and internal whitespace collapsed to hyphens. So:

- `High Priority` → `high-priority`
- `  Errand ` → `errand`

This is why you can't create two tags that differ only by case or spacing — they collapse to the same stored value. Duplicates on the same item are silently ignored.

### Input shortcuts

- **Enter** or **comma** — confirm the current draft as a tag.
- **Backspace** on an empty input — removes the last chip (quick undo).
- **Blur** (click away) with text still in the box — that text is added as a tag.
- **Autocomplete** — as you type, up to 6 suggestions appear, drawn from every tag already in use across the tree, substring-matched against your draft and excluding tags already on this item (`TagInput.tsx:16-22`). Click a suggestion to add it. This is the main mechanism that keeps your tag vocabulary from fragmenting — reuse existing tags instead of retyping.

Tags persist with the item like any other field (saved on the item's storage key via `usePlannerData`).

## Filtering the tree

When at least one tag exists anywhere (or you have a saved filter), a **filter bar** appears above the lists in the data view (`TagFilterBar`, rendered from `PlannerDataView.tsx:74`). If there are no tags and no saved filters, the bar is hidden entirely (`TagFilterBar.tsx:24`).

- The **Filter:** row shows every tag in use as a pill (`#tag`). The full tag list is the sorted, de-duplicated union across all four levels (`collectAllTags`, `tags.ts:7`).
- **Click a pill to toggle it** into the active set. Active pills turn solid blue.
- Tag chips shown **on individual items** are also clickable and toggle the same active set (`TagChips` with `onTagClick`), so you can drill in from an item you're looking at.
- **Clear** resets the active set.

### AND semantics

Multiple active tags combine with **AND**: an item shows only if it carries *every* active tag (`matchesAllTags`, `tags.ts:24-29`). Activating `#deep-work` and `#urgent` shows only items tagged with both, not either. There is no OR mode.

### Filtering is per-level, not hierarchical

This is the most important behavior to understand. Each of the four sections (Values, Goals, Projects, Tasks) is filtered **independently** against the active tags (`PlannerDataView.tsx:50-60`). Filtering does **not** walk the parent/child relationships. Consequences:

- A **task** that carries the tag still shows even if its parent project doesn't carry it — but that parent project won't appear in the Projects section, so you see the task without its filtered-out ancestor on screen.
- A **project** that carries the tag shows even if none of its tasks do; the Tasks section below it will be empty (for that project) under the filter.
- To get a coherent "this whole branch" view, tag the items at each level you want to keep visible. The filter won't infer ancestry for you.

### The active filter is not saved across reloads

The active tag selection is ephemeral component state (`useState` in `PlannerDataView.tsx:44`). It resets to empty every time the app reloads. Only **saved filters** (below) persist.

## Saved filters

Saved filters let you re-apply a tag combination by name.

1. Activate one or more tags in the filter bar.
2. Click **Save as…** (appears only while ≥1 tag is active), type a name, and confirm with Enter or the Save button (`TagFilterBar.tsx:28-34`).
3. The filter is stored as `{ id, name, tags }` with the tags sorted, under the `planner-saved-filters` storage key (`usePlannerData.ts`). Saved filters **persist across reloads**.

Using them:

- A **Saved:** row appears in the filter bar listing each saved filter by name (hover shows its tags).
- **Click a saved filter to apply it.** Applying **replaces** the current active set with the filter's tags (`onApplyFilter` → `setActiveTags(f.tags)`, `PlannerDataView.tsx:80`) — it does not merge with whatever you already had selected.
- **Delete** a saved filter with the **×** next to its name. (There's no rename or edit-in-place; delete and re-save to change one.)

## Quick reference

| Action | How | Persists? |
|--------|-----|-----------|
| Add a tag | Edit modal → Tags → type → Enter/comma | Yes (with the item) |
| Remove a tag | × on the chip, or Backspace on empty input | Yes |
| Filter by tags | Click pills in the filter bar (or chips on items) | No (resets on reload) |
| Combine tags | Activate several — AND semantics | No |
| Clear filter | **Clear** button | — |
| Save a filter | Activate tags → **Save as…** → name it | Yes (`planner-saved-filters`) |
| Apply a saved filter | Click its name (replaces active set) | n/a |
| Delete a saved filter | × next to its name | Yes |

## Source map

- Tag data model: optional `tags?: string[]` on each entity, `SavedFilter` type — `src/types/planner.ts`
- Tag entry + normalization + autocomplete — `src/components/Planner/TagInput.tsx`
- Tag pills on items — `src/components/Planner/TagChips.tsx`
- Filter bar + saved-filter UI — `src/components/Planner/TagFilterBar.tsx`
- Filtering logic (`collectAllTags`, `matchesAllTags`, AND semantics) — `src/utils/tags.ts`
- Wiring: active-tag state, per-level filtering, save/apply/delete handlers — `src/components/Planner/PlannerDataView.tsx`
- Persistence of saved filters (`planner-saved-filters` key) — `src/hooks/usePlannerData.ts`
