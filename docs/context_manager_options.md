# Context Manager Implementation Options

This document outlines four distinct approaches to solving the "Context Hygiene" and "Venting" problem in `dayplanner-web`.

The Goal: Allow the user to speak freely (including complaining/venting) without clogging the LLM's context window with irrelevant emotional fluff, while still capturing important data and mood metrics.

---

## Option 1: The "Commit & Collapse" Model (Git-like)
**Philosophy:** Explicit checkpoints. Structure is created only when the user is ready.

**Mechanism:**
1.  User chats normally (stream of consciousness).
2.  User clicks a **"Summarize / Checkpoint"** button (or it triggers after N messages).
3.  The LLM analyzes the recent block of conversation.
4.  **Output:**
    *   **Updates:** Proposed changes to Tasks/Projects (normal tool calls).
    *   **Summary:** A 1-paragraph summary of the "Work Done".
    *   **Mood:** A deduced "Mood Score" for that block.
5.  **Action:** The UI replaces the last N messages with a single "Summary Card" (collapsible). The raw messages are archived to `history-log.json` but removed from the active context window.

| Pros | Cons |
| :--- | :--- |
| **High Accuracy:** User reviews the summary before "collapsing," preventing data loss. | **Friction:** Requires manual user action (clicking "Commit"). |
| **Visual Cleanliness:** The chat window stays short and readable. | **Interrupts Flow:** Forces a switch from "doing" to "reviewing." |
| **Trust:** User feels in control of what the AI "remembers." | |

---

## Option 2: The Silent Rolling Window (Background Garbage Collector)
**Philosophy:** "Infinite Memory" illusion. The system cleans up after itself automatically.

**Mechanism:**
1.  The system maintains two context buffers:
    *   **Short-term:** The last 10-20 messages (raw).
    *   **Long-term:** A "Facts & Mood" scratchpad (in `aiContext.ts`).
2.  **Trigger:** Every time the user sends a message, a background process (or a "side-effect" of the main LLM call) analyzes the *oldest* messages in the Short-term buffer.
3.  **Extraction:**
    *   If a message contains a constraint/fact ("The meeting is at 5pm"), it is appended to the `Long-term` scratchpad or updates a task.
    *   If it contains purely emotional content ("I hate this API"), it updates the `Capacity.mood` metric but is **not** saved to the scratchpad.
4.  **Deletion:** The oldest messages are silently dropped from the prompt sent to the LLM, but the *insights* from them persist in the system prompt.

| Pros | Cons |
| :--- | :--- |
| **Zero Friction:** User doesn't have to do anything. | **Cost/Latency:** Requires more tokens or parallel calls to process the background summarization. |
| **Always "Clean":** Prompt is always optimized. | **"Gaslighting" Risk:** If the AI summarizes incorrectly and deletes the source, the user might feel the AI "forgot" something specific they just said 20 minutes ago. |

---

## Option 3: Two-Channel Interface (The "Venting Mode" Toggle)
**Philosophy:** Separation of concerns at the source.

**Mechanism:**
1.  The chat input box has a toggle (or prefix, e.g., `/vent` or a specific UI "Mode Switch").
2.  **Mode A (Planner):** Messages go to the main Context Window. The AI acts as a Project Manager.
3.  **Mode B (Venting/Rubber Duck):**
    *   Messages go to a separate `VentingContext`.
    *   The AI acts as a Therapist/Listener.
    *   **Crucially:** When switching back to Mode A, the `VentingContext` is **NOT** included in the prompt. Only a one-sentence "User mood state" derived from that session is passed over.

| Pros | Cons |
| :--- | :--- |
| **Absolute Hygiene:** Zero chance of "snide remarks" confusing the task logic. | **High Cognitive Load:** User must decide *before* typing: "Is this a fact or a feeling?" |
| **Specialized Responses:** The AI can be prompted very differently (empathetic vs. efficient) for each mode. | **Fragmented Experience:** Often a thought is mixed: "I hate this (vent) because the API returned 404 (fact)." Splitting this is hard. |

---

## Option 4: Topic-Based Partitioning (Dynamic Retrieval)
**Philosophy:** Context is relevancy-based, not time-based.

**Mechanism:**
1.  Every message is auto-tagged by the LLM with a topic or Project ID (e.g., `[Project: BoardGame]`, `[Topic: Personal]`, `[Mood: Frustrated]`).
2.  **Storage:** Messages are stored in a vector database or structured JSON list with these tags.
3.  **Construction:** When the user talks, the system identifies the *current* active topic.
4.  **Retrieval:** `aiContext.ts` pulls:
    *   The last 5 messages (regardless of topic).
    *   The last 20 messages *matching the current topic*.
    *   Excludes messages tagged only as `[Mood: Venting]` unless the user asks "Why was I mad yesterday?"

| Pros | Cons |
| :--- | :--- |
| **Best Context:** AI sees exactly what is relevant to the *current* task, ignoring the rest. | **Complexity:** Highest engineering effort (requires robust tagging, vector/filter logic). |
| **Scalable:** Works even if the user switches between 5 different projects in one day. | **Latency:** Retrieval step adds time before the answer can be generated. |

---

## Recommendation

For the **MVP of the Context Manager**, I recommend **Option 1 (The "Commit & Collapse" Model)** but with a slight automation twist to reduce friction:

**"The Periodic Summarizer"**
*   **Default:** Keep the last 20 messages.
*   **Action:** When the context exceeds a limit (or user enables a "Cleanup" setting), the system runs a "Summarize" pass.
*   **UI:** It replaces the old messages with a grayed-out "Summary of conversation (10:00 AM - 11:30 AM)" block.
*   **Venting Handling:** The summary ensures facts are kept, but "rants" are compressed into "User expressed frustration with X."

**Why:** It is technically safer than Option 2 (no silent data loss), less annoying than Option 3 (no mode switching), and easier to build than Option 4. It fits the "Self-Contained" architecture of the current app perfectly.
