import type { ResolvedFocus } from '../types/planner';

// Monotonic numeric ID generator. Preserves the existing number-typed id contract
// while preventing collisions when multiple items are created in the same millisecond.
let lastTime = 0;
let counter = 0;

export const nextId = (): number => {
    const now = Date.now();
    if (now === lastTime) {
        counter++;
    } else {
        lastTime = now;
        counter = 0;
    }
    return now * 1000 + counter;
};

const rand = () => Math.random().toString(36).slice(2, 8);

export const makeMessageId = (prefix: 'user' | 'assistant' | 'system' | 'tool' | 'summary' = 'system'): string =>
    `${prefix}-${Date.now()}-${rand()}`;

export const makeThreadId = (): string => `thread-${Date.now()}-${rand()}`;

export const makeSegmentId = (): string => `seg-${Date.now()}-${rand()}`;

// Stable string key for a ResolvedFocus, used to detect focus changes turn-over-turn.
// Empty string means "no focus." Two ResolvedFocuses with the same key are considered
// the same focus for thread-rotation purposes.
export const focusKey = (resolved: ResolvedFocus | undefined): string => {
    if (!resolved) return '';
    return [
        resolved.focusedValue?.id ?? '',
        resolved.focusedGoal?.id ?? '',
        resolved.focusedProject?.id ?? '',
        resolved.focusedTask?.id ?? '',
    ].join('/');
};
