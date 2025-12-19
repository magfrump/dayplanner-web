# Code Health Check - Cycle 1

## Diagnostics
- [x] **Run Tests**: Execute `npm test` to verify all tests pass and check for slowness. <!-- id: 0 -->
- [x] **Run Linter**: Execute `npm run lint` and identify warnings/errors. <!-- id: 1 -->
- [x] **File Size Analysis**: Identify components larger than 300 lines that might need splitting. <!-- id: 2 -->

## Fixes & Refactoring
- [x] **Fix Critical Bugs**: Fix conditional React Hooks in `SettingsModal.tsx` and `TraceModal.tsx`. <!-- id: 3 -->
- [x] **Fix Lint Issues**: Address `prefer-const`, `unused-vars`, and `exhaustive-deps` warnings. <!-- id: 4 -->
- [ ] **Type Safety**: Replace `any` types with proper interfaces. <!-- id: 5 -->
    - [ ] Storage types (Polyfill & usePlannerData)
    - [ ] AI Service types (LLM, Tools, usePlannerAI)
    - [ ] Component props (`EditItemModal`, `TasksSection`, `PlannerDataView`)
- [x] **Refactor `usePlannerAI.ts`**: Extract helper logic (e.g. tool definitions or types) to reduce size (566 lines). <!-- id: 6 -->
- [x] **Refactor `DayPlanner.tsx`**: Extract `PlanView` and `DataView` sub-components (379 lines). <!-- id: 7 -->

## Verification
- [x] **Verify Fixes**: Re-run tests and linter to ensure a clean state. <!-- id: 8 -->

# Feature Cycle: Version Control & Visualizations
- [x] **Version Control Setup**: Initialize git, ignore private data, create dev branch.
- [x] **Data Visualization (React Flow)**: Implement node-link diagram for non-linear planning.
    - [x] Install dependencies (`reactflow`, `dagre` for layout).
    - [x] Design & Create `GraphView` component.
    - [x] Implement data transformation (Planner Data -> Nodes/Edges).
    - [x] Integrate into `DayPlanner` tabs.

- [ ] **Attachments**: Allow uploading and viewing files on Tasks.
    - [x] Backend: Install `multer` and setup `/api/upload` + static serving.
    - [x] Types: Add `attachments` field to `Task` interface.
    - [x] UI: Create `AttachmentList` and `FileUploader` components.
    - [x] UI: Create `AttachmentList` and `FileUploader` components.
    - [x] UI: Create `AttachmentList` and `FileUploader` components.
    - [x] UI: Create `AttachmentList` and `FileUploader` components.
    - [x] UI: Integrate into `EditItemModal` and `TasksSection`.

- [ ] **Automated Mood Sync**: Update Capacity based on Chat Sentiment.
    - [ ] Logic: Update `summarizeConversation` in `usePlannerAI` to reading `mood_score`.
    - [ ] Logic: Apply `mood_score` to `Capacity.mood` (and potentially inferred Stress).
    - [ ] UI: Add visual feedback "Mood updated from chat context".
