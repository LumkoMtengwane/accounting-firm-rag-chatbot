# Workflow diagrams

## One question, end to end

```mermaid
sequenceDiagram
    participant V as Visitor (web page)
    participant C as chat function
    participant DB as Supabase (pgvector)
    participant M as Claude Haiku
    V->>C: question + last 4 messages
    C->>C: validate (max 500 characters), kill switch
    C->>DB: bump visitor and global daily counters
    alt over a limit
        C-->>V: friendly "try tomorrow" message (429)
    else within limits
        C->>C: embed question (gte-small)
        C->>DB: match_chunks (top 8 by cosine similarity)
        C->>M: sources + question, must return answer_visitor tool
        M-->>C: can_answer, answer, citations, confidence, needs_human
        C->>C: check citations are real, apply rules
        C->>DB: write chat_logs row
        C-->>V: answer, confidence, flag, sources
    end
```

## Loading documents

```mermaid
flowchart LR
    A[data/docs/*.md] --> B[Split by heading<br/>about 130 chunks]
    B --> C[embed function<br/>gte-small, 384 numbers each]
    C --> D[(documents + chunks)]
```

Re-running `npm run ingest` replaces everything, so it is safe to repeat.

## Error and fallback paths

| What goes wrong | What the visitor sees | What is logged |
|---|---|---|
| Claude is down or returns junk | "I could not produce a reliable answer. A consultant can help." | Abstained, zero cost |
| Nothing in the documents is close | "I don't know" without any Claude call | Abstained, zero cost |
| Answer cites a passage that was not retrieved | "I don't know" | Abstained |
| Visitor or global daily limit reached | Friendly limit message | Nothing |
| Logging fails | Normal answer | Nothing (answer is never blocked by logging) |
| Kill switch `CHAT_ENABLED=false` | "The demo is paused" | Nothing |

Manual fallback: if the chat is paused or down, the page shows the firm's phone number and email.
