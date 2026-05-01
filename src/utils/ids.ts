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
