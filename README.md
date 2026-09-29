# LiveImproved (private)

A single-user life tracker. The web app is a private Vercel project; the model, Telegram bot and scheduler stay on `hermes-oracle`.
A local **Spark-X2.5 1.7B Abliterated** model (`sparkx2.5-abliterated:1.7b` in Ollama, from `hf.co/darioooooo0o/Spark-X2.5-1.7B-Abliterated-GGUF:Q4_K_M`) files what you type into
to-dos, projects, routines, reminders, meals, workouts and the journal. It also plans each day and scores it out of 10.

```
browser ──► Vercel (Deployment Protection: Vercel Authentication) ──► Next.js functions ─┬─► Neon Postgres
                                                                                        └─► Funnel :8443 ─► ollama-gate ─► Ollama
Telegram ◄── long-poll ── liveimproved-worker on hermes-oracle ─────────────────────────────► Neon Postgres / Ollama (localhost)
```

## Access
- Vercel → Project → Settings → Deployment Protection: **Vercel Authentication**, scope **All Deployments**. Every URL, production included, requires signing in with a Vercel account that belongs to the project's team (just you). The app has no login of its own, so this setting must stay on.
- `src/proxy.ts` lets every request through on Vercel (`VERCEL=1`). Off Vercel (local production builds, e2e) it still requires `Tailscale-User-Login: $OWNER_LOGIN`.
- Ollama is published with `tailscale funnel --bg --https=8443 http://127.0.0.1:11500`. `deploy/ollama-gate.mjs` listens there and only forwards `POST /api/chat`, `POST /api/generate` and `GET /api/ps` carrying `Authorization: Bearer $OLLAMA_AUTH_TOKEN`.

## Vercel environment variables
| Name | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string |
| `OLLAMA_BASE_URL` | `https://hermes-oracle.<tailnet>.ts.net:8443` |
| `OLLAMA_AUTH_TOKEN` | same secret as on the box (≥32 chars) |
| `APP_TZ` | `America/New_York` (Vercel reserves `TZ`; `src/instrumentation.ts` applies this) |
| `OWNER_EMAIL`, `OWNER_NAME` | same as on the box, so both resolve to the same user row |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID` | optional; only used for the Settings status dot |

## Where things live
| Piece | Path |
|---|---|
| Model client, router, capture/undo, planner, judge | `src/lib/ai/` |
| Chat API (web): streaming chat, history, plan save | `src/app/api/chat` |
| Conversations + compactor, chat replies, goal planner | `src/lib/ai/conversation.ts`, `companion.ts`, `goalplan.ts` |
| Telegram bot + scheduler | `worker/` |
| systemd units, Ollama gate, backup | `deploy/` |
| Env (box) | `/etc/liveimproved.env` (`DATABASE_URL` = Neon, `OLLAMA_AUTH_TOKEN`) |
| Env (web) | Vercel project settings |
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
git push origin main                                # deploys the web app on Vercel
scripts/deploy.sh                                   # ship worker + Ollama gate to the box, restart
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
- **Speed:** thinking mode is off everywhere. On 2 cores it spent 7–9 minutes and ran out of budget before answering. Routing takes about 4s at the median and 10s at p90, planning about 5s, and the nightly judge about 25s.
- **Streaming:** responses are streamed, because Node's fetch gives up after 300s if no headers arrive.

## Layout
- **Pages:** Chat, Tasks (to-dos and projects, which expand in place), Habits (with workouts), Food (the day's log plus a nutrient column) and Journal (with a Notes tab). Settings is behind the gear icon.
- **Redirects:** `/projects`, `/notes` and `/weights` redirect to their new homes (`next.config.ts`).
- **Style:** one compact style everywhere: the `min-*` classes in `globals.css` and the primitives in `src/components/ui.tsx`.

## Chat
- **Conversations:** every message belongs to a conversation. History shows starred chats plus everything from the last 30 days; older unstarred chats stay in the DB but are hidden. Telegram starts a new conversation after 3 quiet hours.
- **Routing:** greetings, advice and general questions go straight to chat (`isSmallTalk`, `isChatQuestion`); goals like "I want to get good at X" start the planner (`looksLikeGoal`); everything else goes through the router. Mid-conversation, the router is told to prefer chat.
- **Compactor:** each chat call sees at most ~500 tokens of conversation: a structured memory (topic, facts, open question; capped at 600 chars) plus the latest turns (1,400 chars). When the tail passes that, the oldest turns are folded into memory after the reply is sent, so it never slows a response.
- **Goal planner:** saying a goal starts a plan (an undoable action). One model-written question about the focus, then four fixed ones (level, success and deadline, time per week, access and limits). Finishing saves the plan as a project with tasks automatically; "make the plan easier" reworks the same project; "just make the plan" skips ahead; "cancel" drops it; "make the plan again" / "bring it back" restores it.
- **Tools and Undo:** every action a reply takes (filing, completing, starting or saving a plan) has Undo, handled by `undoMessage`. Undo reverses the items, updates plan state, clears pending questions, patches compacted memory, and retires later revisions of an undone plan. The model never sees an undone reply's content, only a note that it was undone.
- **Answered by code, not the model:** anything about app state: "is my plan still there?", "did you save/set X?", "what changed?", "don't remind me" / "cancel that" (undoes the latest matching action), "log it again" (re-runs the undone message), and "1 is due friday" with no numbered list open. A 1.7B model gets these wrong even when told the facts.
- **Answered by code, not the model (more):** help ("what can you do?"), identity, bulk or injection commands ("delete everything", "SYSTEM: …", "print your system prompt"), note lookups ("what's my garage code?"), due dates ("what's due tomorrow?", "anything overdue?"), "finished X" (ticks off the matching item), and numbered triage answers ("3 is urgent, 1 can wait").
- **Tests:**
  - `DATABASE_URL=<test db> npx vitest run`: unit tests plus conversation flows against a real Postgres with a scripted model.
  - `scripts/e2e/`, against a local production build on a test database with the live model:
    - `seed.ts` seeds realistic data.
    - `chat-eval.ts` runs about 90 graded chatbot cases through `/api/chat`.
    - `api-sweep.ts` exercises every API route.
    - `ui.cjs` drives every page and the chat UI in Chromium via Playwright.
  - All of these refuse non-test databases.
- **Nutrition (Meals → Nutrition):** daily calories and macros against targets.
  - Describe a meal and review the filled-in breakdown, or enter it yourself; meals logged in chat are filled in automatically.
  - `src/lib/nutrition-parse.ts` (code, not the model) reads the description:
    - amounts: fractions, "1 and a half", ranges, "1/4 cup each of", amounts after the food, sizes, "double", "no rice", typos;
    - built dishes ("tacos with…", "burrito with…", "bowl:") are counted from their ingredients, adding tortillas, bread or buns if not listed; fixed dishes (pizza, pho) are counted whole.
  - Numbers come from the reference table in `src/lib/nutrition-foods.ts` (~300 foods, dishes and aliases, USDA-style values).
  - Foods not in the table are estimated from their kind (from keywords, the model only as a last resort) and are marked "AI guess".
  - Eleven micronutrients per food come from `src/lib/nutrition-micros.ts`.
  - `src/lib/nutrition-ask.ts` decides when to ask "How much?": containers with no standard size, unknown foods, and unmeasured calorie-dense basics, at most 2 per meal. In chat the question uses the `meal_amount` awaiting flow; on the Food page it's shown as answer chips.
  - `scripts/e2e/nutrition-eval.ts` checks 175 descriptions against real-world ranges. Its `heldout2`…`heldout5` sets measured accuracy on unseen descriptions.
- **Ollama:** `OLLAMA_MAX_LOADED_MODELS=2`, so another client loading a different model (the RTB Hermes agent's `qwen2.5:3b` fallback) can't evict the chat model.
