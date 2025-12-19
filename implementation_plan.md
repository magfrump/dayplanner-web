# Implementation Plan - Context Manager MVP

**Goal:** Implement the "Periodic Commit & Collapse" model to maintain context hygiene.
**Vision Alignment:** This MVP builds the "muscle" of summarizing and archiving. While the vision calls for server-side processing, this MVP will execute the LLM logic on the **client (browser)** in a non-blocking `async` manner to utilize the existing `usePlannerAI` credentials and config, but it will *feel* like a background process to the user. The data will then be archived to the server.

## User Review Required
> [!IMPORTANT]
> **Client-Side vs Server-Side:** For this MVP, I am keeping the LLM calls in the Browser (Client). Moving them to the Server (`storage-server.js`) would require migrating API Keys and Config to the backend, which is a larger architectural task.
>
> **The Flow:**
> 1. Browser detects chat length > 15.
> 2. Browser calls LLM (silently) to summarize first 10 messages.
> 3. Browser sends raw 10 messages to Server (`/api/log/archive`).
> 4. Browser replaces those 10 messages with 1 `Summary` card.

## Proposed Changes

### Backend (`storage-server.js`)
#### [MODIFY] storage-server.js
- Add `POST /api/log/archive`: Accepts a JSON payload of message objects and appends them to a `data/archives/chat_archive_[DATE].jsonl` file.

### Models (`src/types/planner.d.ts`)
#### [MODIFY] src/types/planner.d.ts
- Extend `Message` type:
```typescript
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  type?: 'text' | 'summary'; // New field
  summaryData?: {
     timestamp_start: string;
     timestamp_end: string;
     mood_score: number; // 1-5 inferred
     key_facts: string[];
  }
}
```

### AI Logic (`src/hooks/usePlannerAI.ts` & `src/services/llm.ts`)
#### [MODIFY] src/services/llm.ts
- Add `summarizeMessages(messages: Message[], config: LLMConfig)`: A specialized function that prompts the LLM to compress the content.

#### [MODIFY] src/hooks/usePlannerAI.ts
- Add effect: Monitor `conversation.length`.
- If `conversation.length > 20` (threshold) AND `!isSummarizing`:
    1. Set `isSummarizing = true`.
    2. Slice the oldest `N` messages (excluding the very first greeting if we want to keep it, but usually we summarize everything after the system prompt).
    3. Call `summarizeMessages`.
    4. Call API `POST /api/log/archive`.
    5. **Atomic Logic:** removing the N messages and splicing in the Summary message.

### UI (`src/DayPlanner.tsx` & Components)
#### [NEW] src/components/Chat/SummaryCard.tsx
- A specialized component to render the collapsed state.
- Visuals: Small, gray/subtle. Click to expand (maybe just show text in a modal, not restore to chat).

#### [MODIFY] src/DayPlanner.tsx
- Update the `conversation.map` loop to handle `msg.type === 'summary'` by rendering `<SummaryCard />`.

## Verification Plan

### Automated Tests
- Unit test `summarizeMessages` (mocked LLM) to ensure it returns structured data.
- Unit test `usePlannerAI`'s reduction logic (ensure it removes exactly the right messages).

### Manual Verification
1.  **Safety:** Start a chat, spam 20 messages. Watch the console.
2.  **Observation:** Verify the oldest messages disappear and a "Summary" appears.
3.  **Persistence:** Refresh the page (if persistence is implemented for chat, otherwise check `history-log`).
4.  **Flow:** Continue chatting *after* the summary. Ensure the AI still "knows" what happened (because the summary is in the context).
