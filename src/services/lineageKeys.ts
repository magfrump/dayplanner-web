// TS twin of multisemantic-db.js:LINEAGE_LEVELS. Frontend can't import the .js
// module directly without pulling server deps; keep these in sync if the server
// list ever changes.
export const LINEAGE_KEYS = ['valueId', 'goalId', 'projectId', 'taskId'] as const;
export type LineageKey = typeof LINEAGE_KEYS[number];
