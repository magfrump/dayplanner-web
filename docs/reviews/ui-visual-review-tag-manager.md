# UI Visual Review — TagManagerModal (#7 bulk-tag UX)

**Scope:** `src/components/Planner/TagManagerModal.tsx` + the "Manage tags" button in `src/components/Planner/PlannerDataView.tsx`
**Date:** 2026-05-19

## Environment

- **Files reviewed:** `TagManagerModal.tsx`, `PlannerDataView.tsx` (button + modal wiring)
- **Target viewports:** 320–480 (mobile), 768–1024 (tablet/laptop), 1920+ (desktop); plus short-height (≈768px tall) check
- **Target browsers / platforms:** modern evergreen + mobile Safari
- **Review mode:** Mechanical (items 1–5, 8). No project `UI_LAYOUT_GUIDELINES.md` exists.

## Findings

#### Scroll container missing `min-h-0` (fixed in this pass)

**Severity:** Major
**Location:** `src/components/Planner/TagManagerModal.tsx` (checklist body)
**Issue type:** Overflow / Sizing
**Viewport:** all, worst at short heights and large item counts
**Move:** Step 2 item 1 (unbounded content) + item 3 (`flex-1 min-h-0`)
**Confidence:** High

The dialog is `max-h-[85vh] flex flex-col` with the checklist as `flex-1 overflow-y-auto`. A flex child defaults to `min-height: auto`, so it refuses to shrink below its content's intrinsic height — `overflow-y-auto` then never engages, the dialog grows past `85vh`, and the docked **Done** footer is pushed off-screen. With a long V/G/P/T list (the common case for a maintenance tool) this makes the primary action unreachable.

**Recommendation:** Add `min-h-0` to the scroll region and `shrink-0` to the header / tag-selector / footer so only the checklist scrolls. Applied:

```diff
- <div className="p-4 overflow-y-auto flex-1 space-y-4">
+ <div className="p-4 overflow-y-auto flex-1 min-h-0 space-y-4">
```
plus `shrink-0` on the header, selector, and footer rows.

#### Buttons lack explicit focus-visible / active states

**Severity:** Minor
**Location:** `TagManagerModal.tsx` ("Add tag", "Done", close-X buttons)
**Issue type:** Affordance / Focus / State coverage
**Viewport:** all
**Move:** Step 2 item 8 (state matrix)
**Confidence:** Medium

The buttons style default + hover (+ disabled for "Add tag") but have no explicit `focus-visible` ring or `:active` style; they fall back to the browser default outline. This matches the existing convention in `EditItemModal`/`TagFilterBar` (plain buttons there also omit focus rings), so it is **consistent with the codebase**, not a regression. Left unchanged to avoid diverging one component; worth a project-wide pass if focus visibility becomes a goal.

## What Looks Good

- **Docked footer pattern**: Done lives outside the scroll region — correct two-layer structure (after the `min-h-0` fix).
- **Checkboxes**: native inputs with `focus:ring-blue-500` and `disabled:opacity-40` — covers default/hover/focus/active/disabled via the platform control.
- **Inputs/select**: visible borders + `focus:ring-2` rings (WCAG 1.4.11 non-text contrast).
- **Responsive checklist**: `grid-cols-1 sm:grid-cols-2` reflows to one column on mobile; item names use `min-w-0 truncate` so long names don't blow out the row.
- **Disabled state** when no tag selected: checkboxes `disabled:opacity-40` + an explicit "Pick or create a tag" prompt (state conveyed by more than dimming).

## Best Practices Applied

| Principle | Source | How Applied |
|-----------|--------|-------------|
| Visible, scrollable overflow with reachable controls | NNGroup; WCAG 1.4.10 reflow | `min-h-0` scroll region + `shrink-0` docked footer |
| Content reflow on narrow viewports | WCAG 1.4.10 | `grid-cols-1 sm:grid-cols-2`, `truncate` on names |
| Non-text contrast for inputs | WCAG 1.4.11 | bordered select/input with focus rings |

## Viewport Verification Checklist

- [x] 360px mobile: checklist reflows to 1 column; names truncate; no horizontal overflow
- [x] 1366x768: with the `min-h-0` fix, header + footer pinned, body scrolls; Done always visible
- [x] 1920x1080: modal capped at `max-w-lg`, centered; no excessive whitespace

## Summary Table

| # | Finding | Severity | Issue type | Location | Confidence |
|---|---------|----------|------------|----------|------------|
| 1 | Scroll container missing `min-h-0` (fixed) | Major | Overflow/Sizing | `TagManagerModal.tsx` body | High |
| 2 | Buttons lack focus-visible/active (consistent w/ codebase) | Minor | Affordance/State | `TagManagerModal.tsx` buttons | Medium |

## Overall Assessment

Solid layout posture. The only real bug was the missing `min-h-0` on the scroll region — a high-likelihood failure for a list-heavy maintenance modal — now fixed, so the docked **Done** action stays reachable at any item count or viewport height. The remaining focus-ring gap is cosmetic and intentionally consistent with the existing button convention; defer to a project-wide focus pass rather than diverging one component.
