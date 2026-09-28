# LiveImproved (private)

A single-user life tracker that runs on `hermes-oracle` and is reachable only over Tailscale.
A local **Spark-X2.5 1.7B** model (`sparkx2.5:1.7b` in Ollama) files what you type into
to-dos, projects, routines, reminders, meals, workouts and the journal. It also plans each day and scores it out of 10.

```
phone / PC ──tailnet──► tailscale serve :443 ──► Next.js 127.0.0.1:3000 ─┐
Telegram ◄── long-poll ── liveimproved-worker (reminders, briefs, judge) ├─► Postgres 127.0.0.1:5432
                                   └──────────► Ollama 127.0.0.1:11434 ──┘
```

## Access
- `src/proxy.ts` rejects every request that doesn't carry `Tailscale-User-Login: $OWNER_LOGIN`. Tailscale Serve adds that header, and the app only listens on localhost, so the header can't be forged from outside.
- There's no login screen and no signup.

## Where things live
| Piece | Path |
|---|---|
| Model client, router, capture/undo, planner, judge | `src/lib/ai/` |
| Chat API (web) | `src/app/api/chat` |
| Telegram bot + scheduler | `worker/` |
| systemd units, backup | `deploy/` |
| Env (server) | `/etc/liveimproved.env` |
| Backups | `~/liveimproved-backups` (nightly, 14 days) |

## Schedule (America/New_York)
- Every minute: send due reminders.
- 6:30: plan the day.
- 7:00: morning brief.
- 21:00: evening check-in.
- 23:30: score the day and review the journal.
- Sunday 18:00: weekly digest.

## Everyday commands
```bash
scripts/deploy.sh                                   # build locally, ship, restart
ssh hermes-oracle 'journalctl -fu liveimproved-worker'
ssh hermes-oracle 'cd ~/apps/liveimproved && set -a && . /etc/liveimproved.env && liveimproved-node dist/run-job.mjs judge'
OLLAMA_BASE_URL=http://127.0.0.1:11435 npm run bench:llm   # with: ssh -L 11435:127.0.0.1:11434 hermes-oracle
npm test
```

## Model tuning
- **Quantization:** Q4_K_M. It was the fastest of the quants tested on the 2-core Neoverse-N1 box: about 10 tok/s generation, and about 30 tok/s for a prompt it hasn't seen before.
- **Ollama settings:** `/etc/systemd/system/ollama.service.d/liveimproved.conf`.
  - `KEEP_ALIVE=-1` keeps the model loaded permanently.
  - The context window is 4096 tokens.
  - The KV cache is quantized to q8 and flash attention is on.
- **Stable prompts:** system prompts never change, so Ollama reuses its prompt cache. After the first call, the ~700-token router prompt costs about 0.4s instead of about 25s.
- **Structured output:** every call is schema-constrained JSON. Dates are resolved in code (`chrono-node`), never by the model.
- **Speed:** thinking mode is used only by the nightly planner and judge. Routing takes about 4s at the median and 10s at p90.
