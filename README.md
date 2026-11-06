# GROWW_SIP

Case-study prototype · Not affiliated with Groww · Demo data · Not investment advice.

A goal anchor and an AI check-in ("Before you stop") for first-year SIP investors. See `Docs/PRD.md` and `Docs/architecture.md`.

**Status (6 Nov 2026):** live at https://groww-sip.onrender.com on prompt v16; eval run #28 passed. The prototype runs end to end: the landing page, demo accounts and personas, Mutual Funds (Explore, Dashboard, SIPs, Orders, Watchlist, Cart, the fund page with the goal step), the dip explainer and "Before you stop", display-only Stocks and F&O, public calculators and Learn pages, and /quality. The backend phases 1-6 are below.

## Run the app

```
npm run dev            # http://localhost:3000, with DATABASE_URL, MISTRAL_API_KEY and GROQ_API_KEY in .env or .env.local
npm run build          # production build (Render runs this)
npm start              # serve the production build
npm run e2e            # browser tests (Playwright, installed Chrome) against a running app; E2E_BASE_URL to point elsewhere
npm run e2e:regression # the regression suite: production build, in-memory database, a demo clock the tests control, no AI keys
```

- **Landing page (`/`, PRD F1):** one tap on Kabir, Riya or Arjun copies that persona into a fresh investor, so testers never share data. The other personas (Meera, Sana, Vikram, Dev) stay in the seed for tests and evals. The tick box "Facts only. No investment advice." was removed on 30 Oct 2026 at the product owner's request; the yellow banner on every page and the line under the demo cards carry the disclaimer.
- **Demo accounts:** a made-up username, then a 4-digit demo PIN (stored as a salted scrypt hash; 5 wrong PINs lock it for 5 minutes; 5 sign-ups an hour per network; 20 username checks every 10 minutes per network). PINs can't be reset. A new account starts with no SIPs, holdings, orders or watchlist.
- **Before you stop:** every option has one fixed line, written in code from the approved explainers with this SIP's own date, minimum and value, saying what it does ("Stop anyway: Ends future instalments. Gives no money back and sells no units..."). Stop anyway stays one tap.
- **Goals:** a monthly SIP or a one-time investment can have a goal. With a target amount, the goal step sets what will be put in by the goal date next to the target (plain facts, never a forecast) and links to the Goal planner; the Dashboard card and the SIP page show the target too. A one-time investment can also be added to one of the investor's goals; the goal card counts its money in "put in" and "value today", and lists it under the goal.
- **Watchlist:** "Add to watchlist" on a fund page puts the fund in Mutual Funds -> Watchlist (table `fund_watchlist`; `npm run db:migrate` adds it to an existing database).
- **Autopay:** Settings shows the investor's made-up mandate (table `mandates`), the same one the order card pays from (`src/server/autopay.ts`). It can't be edited: no real bank is connected. The AI's autopay answer links to this section.
- **Sign-in:** an httpOnly cookie `groww_sip_session` holds a random token for 7 days; only its SHA-256 is stored. The cookie is secure whenever the page is on HTTPS (always on Render).
- **On a phone:** with `npm start` running, open `http://<this computer's Wi-Fi address>:3000` (shown as "Network" when the server starts) on a phone on the same Wi-Fi. `localhost` on a phone means the phone itself.
- **Public pages, no login:** the header's More menu opens the calculators (`/calculators/sip`, `/goal`, `/swp`), `/about/ai`, `/about` and `/learn/sip-basics`. Everything else sits in the `(demo)` route group. A page opened there with no demo in the browser goes to `/?demo=none`, which says why and offers the demos; a SIP id from someone else's demo shows "This SIP isn't in your demo".
- **Starting a demo** (or logging in or out) loads the next page in full, so the new session cookie is always read. A start that takes more than 8 s gives up with "Couldn't start the demo, try again". On the landing page, a demo already open in the browser shows as "Continue demo", with no persona's name.
- **Every page's footer** links to `/quality` ("How we check the AI") and the SEBI and AMFI sites.

## Deploy on Render

`render.yaml` describes the service, so on render.com choose **New > Blueprint** and pick this repo:

- One free web service in **Ohio**, next to the Neon database (us-east-2).
- Build: `npm ci --include=dev && npm run build`. The build needs the dev tools (Tailwind, TypeScript), and the start command's `db:migrate` runs with `tsx`.
- Start: `npm run db:migrate && npm start`. `db:migrate` adds new tables and columns, and seeds the demo data only when the database is empty (a fresh deploy), so visitors' data is kept. Check that the service's Settings > Start Command says the same: on 6 Nov 2026 it said `npm run start`, so a deploy went live without its schema change.
- Deploys only after GitHub's CI passes (checks and the AI eval).
- Type in the secrets when Render asks: `DATABASE_URL`, `MISTRAL_API_KEY`, `GROQ_API_KEY`. Render generates `AUTH_SALT`.
- A free service sleeps after 15 idle minutes; the first visit after that takes about a minute. Open the link a minute before a demo.
- On demo day, `npm run db:setup` reloads the seed so the dates look current. It replaces the NAV and price history and the persona templates; it keeps visitors and eval runs (`npm run db:reset` is the only command that drops them). /quality reads the committed `eval/results.json` either way, so reseeding never empties it.
- Saved simulated prices from the old demo control were cleared on 6 Nov 2026. `npx tsx src/server/clear-simulations-cli.ts` counts any that remain, and `--yes` deletes them. It can't be undone, and seeded persona data isn't touched.
- Render never runs `db:setup`: its build is `npm ci --include=dev && npm run build` and its start is `npm run db:migrate && npm start`. `db:migrate` adds missing tables and columns, and seeds only an empty database.

## Phase 1 · data loading

Needs Node 22 or later.

```
npm install
npm run data:check     # validate everything under data/, no database needed
npm test               # seed, copy and schedule tests on an in-memory Postgres
npm run db:setup       # load Neon: set DATABASE_URL in .env or .env.local first
npm run db:verify      # confirm Neon holds everything the seed should have stored
npm run db:reset       # drop every table
```

## Phase 2 · chunking

No text is split (architecture Phase 2). Each explainer becomes one whole chunk in `data/chunks/explainers.json`; one SIP's facts become one formatted unit, built per request by `src/pipeline/chunking/facts.ts`.

```
npm run chunks:build   # rebuild data/chunks/explainers.json after editing data/raw/explainers/
npm run chunks:check   # fail if the chunks are missing or behind the raw text (for CI)
```

## Phase 3 · embedding

Not used (architecture decision D3; PRD §3.3, step 2a): facts are looked up by investor and SIP, explainers by route, and AI call 1 (Groq) reads the investor's words. `src/tests/embedding.test.ts` fails if embedding files or an embedding library are added before the PRD and architecture change.

## Phase 4 · vector store

Not used (architecture decision D3). Two plain stores hold everything: Neon Postgres for investor data, logs and eval results, and the repo (`data/`) for fixed text and eval fixtures. The SQL function `visible_nav_history(investor)` gives one visitor the shared NAVs plus their own demo market-fall days. `src/tests/vector-store.test.ts` checks every store exists and fails if a vector extension, a vector column or files in `data/vector_db/` appear.

## Phase 5 · retrieval logic (backend)

`src/pipeline/retrieval/` runs the check-in in architecture Phase 5: validate, PII guard, SQL facts, call 1 (understand), route in code, context with the route's explainers, call 2 (answer), seven quality checks (`checks.ts`, `goal-check.ts`), and an `ai_checks` row.

- **The writer never writes a number.** It writes placeholders such as `{instalments_to_go}`, and the server fills each with the number and the words that say what it is, in the reply's language ("53 instalments still to come", "53 kishtein abhi baaki", "अभी बाकी 53 किस्तें"), so a number can't be given the wrong meaning. A reply with a digit or number word of the model's own, or a placeholder the SIP doesn't have, fails "Numbers match your SIP" and shows facts only (`src/pipeline/retrieval/slots.ts`, `src/tests/placeholders.test.ts`). The writer is shown no numbers at all.
- **Numbers match your SIP** also checks every number in the filled-in reply: amounts, percentages and durations as the facts write them; a counted number must be a fact of that kind ("53 instalments" an instalment count, "44.2 units" a number of units, "2 Nov" a date the facts state); numbers written as words, lakh and crore, and Devanagari digits fail, since they can't be matched. `src/tests/numbers-check.test.ts` lists what passes and what is stopped.
- **In your language** checks the reply is in the investor's language (Hindi in Devanagari, Hinglish in Latin letters with Hindi words, English for everything else), not counting the disclaimers. `src/pipeline/retrieval/language.ts` detects the language from the investor's own words; `src/tests/language.test.ts` runs check-ins in each language with scripted AI replies.
- Unit tests never call Groq or Mistral: `src/tests/no-live-ai.ts` (set up in `vitest.config.ts`) stops any such request.

- **The dip explainer** gets facts worked out by code: the share of the planned amount put in so far, the instalments to come, the time to go, the worst fall next to the fund's biggest demo-history fall, and the units one instalment buys at the latest NAV and at the peak NAV since the SIP started. It answers in three short sentences tied to the goal, then the options and the disclaimer.
- **Every card says how it was checked.** An answer has "How this answer was checked" folded under it: what was checked, and that automatic checks can miss things. A declined or fallback card has one line instead, such as "Quality check: advice question detected → showing facts only", "a number didn't match your SIP" or "AI unavailable", and ends with the disclaimer like an answer. Both are in the reply's language and script (fixed translations in `src/server/checkin-card.ts`, never written by the AI). There is no confidence label: it read like a guarantee.
- **Market predictions** are their own intent (`asks_for_prediction`): the card first says the app can't predict whether markets will rise or fall, then shows the facts.
- **Language:** "What I understood" and the answer come in the investor's language and script. Code double-checks Hinglish from the investor's own words. A Hindi or Hinglish answer ends with the disclaimer once, in that language (the site's banner has it in English), and the checks run on that text. The fixed card texts are in Hindi and Hinglish too. Other languages get English, since the advice and claim lists cover English, Hindi and Hinglish only.

Two free models share the work (architecture decision D4):
- **Call 1, understanding the reason:** Groq `openai/gpt-oss-120b`. If Groq fails or runs out of free requests, Mistral reads the reason instead.
- **Call 2, writing the answer:** Mistral `ministral-8b-latest` in English. Hindi and Hinglish answers are written by Groq `openai/gpt-oss-120b`, with Mistral as its backup (since prompt v7; kept because the eval gate still passed). Prompt v14 is the current one: a draft that is too long once its placeholders are filled in, states a number itself, or compares two numbers gets one second try before the checks (never one with advice or a claim).

`src/llm/chat.ts` calls both from the server only (JSON mode, 10 s timeout, one retry on 429). Without `GROQ_API_KEY`, Mistral does both calls. Without `MISTRAL_API_KEY`, every check-in ends safely in the facts-only card ("AI unavailable").

Keys live in `.env` (and `.env.local`, which wins if a key is in both); both files are gitignored. Variables already set by CI or Render win over both.

Try it against Neon (each persona gets a reusable test visitor tagged "CLI test"):

```
npm run retrieve -- facts riya            # facts unit and goal card; add 2 or 3 for Riya's other SIPs
npm run retrieve -- ask riya "Market crash ho gaya, mera SIP red mein hai. Band kar du?"
npm run retrieve -- normal riya           # "What does this dip mean for my goal?"
npm run retrieve -- log riya              # last 5 ai_checks rows, with the models that read and wrote
npm run retrieve -- fresh riya            # start over with a clean copy
```

## Phase 6 · retrieval testing (the eval)

`npm run eval` (`src/eval/run.ts`) runs AI call 1 on the 20 hand-labelled golden posts (`data/eval/golden_set/golden_set.csv`, read as it is) and the 18 safety and routing cases (`data/eval/cases/cases.json`) through the full check-in, with the app's own prompts and checks. It stores every result in `eval_runs` and `eval_results`, writes `eval/results.json` and `eval/results.md`, prints a report, and exits 1 when the gate (PRD §7) fails. The results give the golden-set agreement, "fallback correct" (facts only exactly when a case's label says so), any check failures, and a table of every case where the AI disagreed with its label. `/quality` ("How we check the AI" in every footer) shows the committed `eval/results.json`, so reseeding or replacing the database never empties it; commit the files after a run (CI keeps them as the run's `eval-results` artifact).

`npm run eval -- --set holdout` runs call 1 on the holdout set (`eval/holdout-set.json`): 10 real posts from the same Evidence Log run, never used to write a prompt rule, labelled by hand. It reads only labelled posts (none until they are labelled: then it makes no AI calls), writes `eval/holdout-results.json` and `.md`, and never gates a deploy. /quality shows its score next to the golden set's. `eval/tuning-log.md` records which golden posts each prompt rule came from, and how the holdout posts were picked.

- **Must pass every run:**
    - the 10 must-pass cases: advice requests declined, refund misreads caught, nonsense to the fallback card, and someone who needs the money gets the cash route (s17 English, s18 Hinglish)
    - no answer with advice, wrong numbers, a missing disclaimer, an unsupported claim (calling a fall normal, small or temporary, implying a floor or a recovery, stating an expected return, "don't worry"; `data/raw/guardrails/claim_patterns.json`) or a wrong goal detail (`src/pipeline/retrieval/goal-check.ts`).
- **Must not regress:**
    - golden-set theme agreement at least 65% (target 75%)
    - at least 7 of the 8 routing cases.

A run takes 6-8 minutes and uses about a fifth of Groq's free daily tokens.

**CI** (`.github/workflows/ci.yml`):
- **Every push:** the type check, tests, `data:check`, `chunks:check` and the production build.
- **When AI files change** (`src/pipeline`, `src/llm`, `src/eval`, `src/db`, `data/`, the workflow, or the dependencies): `db:verify` and `npm run eval` as well. The **Run workflow** button on the Actions tab always runs the eval live, as does a commit message containing `[run eval]` (for example `git commit --allow-empty -m "Re-run CI [run eval]"`).
- **Reusing a local eval (saves Groq tokens):** `npm run eval` records a fingerprint (sha256) of every AI file in `eval/results.json`: the same files whose change triggers the eval above. When CI would run the eval, it first runs `npm run eval:reuse`: if the committed results have the fingerprint of the files being deployed, were made with the models CI uses, and pass the gate when worked out again, CI reuses them and calls no model. Any change to an AI file after the local run means a live eval in CI. The Run workflow button and `[run eval]` always run it live. So: run `npm run eval`, commit `eval/results.*` with the code, push. The reuse trusts that `eval/results.json` came from `npm run eval`; never edit it by hand.

The eval needs three repository secrets: `DATABASE_URL`, `MISTRAL_API_KEY` and `GROQ_API_KEY`.

## Folder structure

```
groww-sip-mvp/
├── Docs/                      PRD, architecture, problem statement
│   ├── problemstatement.txt
│   ├── PRD.md
│   └── architecture.md
├── data/                      Data only, by pipeline phase (see data/README.md)
│   ├── raw/                   Phase 1 · data loading
│   │   ├── personas/          seven persona seed templates (Kabir, Riya, Arjun on the landing page)
│   │   ├── market/            made-up funds, NAVs, assets, prices, Stocks and F&O rows; IPOs and NFOs are seeded but not shown
│   │   ├── explainers/        stop, skip, pause, lower amount
│   │   └── guardrails/        advice-phrase and unsupported-claim lists (EN, HI, Hinglish)
│   ├── chunks/                Phase 2 · one unit per explainer
│   ├── embeddings/            Phase 3 · not used (D3)
│   ├── vector_db/             Phase 4 · not used (D3)
│   └── eval/                  Phase 6 · retrieval testing fixtures
│       ├── golden_set/        20 Evidence Log posts + hand labels
│       └── cases/             18 safety and routing cases (s01–s18)
└── src/                       Code only
    ├── app/                   Next.js pages and server API routes
    │   ├── (demo)/            the signed-in app: Mutual Funds, Stocks, F&O, settings
    │   ├── (public)/          calculators and Learn pages, no login
    │   ├── api/
    │   │   ├── ai/            Before you stop (F7), dip explainer (F6)
    │   │   ├── auth/          username check, sign-up, log-in, log-out
    │   │   └── sips/          Start SIP and the SIP controls (F5)
    │   └── quality/           /quality page (F11)
    ├── components/            header, More menu, sign-up modal, goal card, check-in cards, calculators
    ├── pipeline/
    │   ├── loading/           Phase 1 · seed, per-visitor copy
    │   ├── chunking/          Phase 2 · explainers from data/raw to data/chunks
    │   └── retrieval/         Phase 5 · validate, PII guard, SQL facts, understand, route, context, quality check
    ├── llm/                   Groq and Mistral clients (server only)
    ├── db/                    Postgres client, schema, migrations
    ├── eval/                  Phase 6 · eval runner (golden set + 18 cases)
    ├── e2e/                   browser tests: the More menu, a new account, the regression suite
    └── tests/                 Phase 6 · API tests
```
