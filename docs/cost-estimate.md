# Cost estimate

Measured 2026-10-18 from `npm run eval` (32 questions, Claude Haiku 5.5, 8 passages per question).

| Item | Figure |
|---|---|
| Input tokens per question | about 2,200 |
| Output tokens per question | about 270 |
| Claude cost per question | about $0.00035 (about R0.006) |
| Embeddings (Supabase `gte-small`) | $0 on the free plan, runs inside the Edge Function |
| Database, functions, storage | $0 on the Supabase free plan at demo volume |
| Hosting the web page | $0 on GitHub Pages |

Haiku 5.5 prices used: $0.10 per million input tokens and $0.50 per million output tokens (same figures as the real estate project, checked 2026-10-15).

## Monthly scenarios

| Questions per day | Claude cost per month |
|---|---|
| 20 | about $0.21 |
| 100 | about $1.05 |
| 200 (the demo's daily cap) | about $2.10 |

## Limits and caveats

- Supabase free plan: pauses after 7 days idle. Free-plan quotas should be checked on supabase.com/pricing before a real deployment (third-party sources disagreed when this was researched).
- A real firm would likely need the Supabase Pro plan (about $25 a month) for no pausing, backups and higher limits. That is a decision for the client, not part of the demo.
- Document updates cost nothing in AI fees. Re-running `npm run ingest` re-embeds everything inside Supabase.
- The figures above exclude the one-off build time.
