# GROWW_SIP

Case-study prototype · Not affiliated with Groww · Demo data · Not investment advice.

A goal anchor and an AI check-in ("Before you stop") for first-year SIP investors. See `Docs/PRD.md` and `Docs/architecture.md`.

**Status (30 Oct 2026):** the prototype runs end to end: the landing page, demo accounts and personas, Mutual Funds (Explore, Dashboard, SIPs, the fund page with the goal step), the dip explainer and "Before you stop", display-only Stocks and F&O, public calculators and Learn pages, and /quality. The backend phases 1-6 are below.

## Run the app

```
npm run dev            # http://localhost:3000, with DATABASE_URL, MISTRAL_API_KEY and GROQ_API_KEY in .env or .env.local
npm run build          # production build (Render runs this)
npm start              # serve the production build
npm run e2e            # browser tests (Playwright, installed Chrome) against a running app; E2E_BASE_URL to point elsewhere
```

- **Landing page (`/`, PRD F1):** one tap on Kabir, Riya or Arjun copies that persona into a fresh investor, so testers never share data. The other personas (Meera, Sana, Vikram, Dev) stay in the seed for tests and evals. The tick box "Facts only. No investment advice." was removed on 30 Oct 2026 at the product owner's request; the yellow banner on every page and the line under the demo cards carry the disclaimer.
- **Demo accounts:** a made-up username, then a 4-digit demo PIN (stored as a salted scrypt hash; 5 wrong PINs lock it for 5 minutes; 5 sign-ups an hour per network; 20 username checks every 10 minutes per network). PINs can't be reset. A new account starts with no SIPs, holdings, orders or watchlist.
- **Sign-in:** an httpOnly cookie `groww_sip_session` holds a random token for 7 days; only its SHA-256 is stored.
- **Public pages, no login:** the header's More menu opens the calculators (`/calculators/sip`, `/goal`, `/swp`), `/about/ai`, `/about` and `/learn/sip-basics`. Everything else sits in the `(demo)` route group, whose layout sends a signed-out visitor to `/`.

## Phase 1 · data loading

Needs Node 22 or later.

```
npm install
npm run data:check     # validate everything under data/, no database needed
npm test               # seed, copy and market-fall tests on an in-memory Postgres
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

`src/pipeline/retrieval/` runs the check-in in architecture Phase 5: validate, PII guard, SQL facts, call 1 (understand), route in code, context with the route's explainers, call 2 (answer), four quality checks, and an `ai_checks` row.

Two free models share the work (architecture decision D4):
- **Call 1, understanding the reason:** Groq `openai/gpt-oss-120b`. If Groq fails or runs out of free requests, Mistral reads the reason instead.
- **Call 2, writing the answer:** Mistral `ministral-8b-latest`.

`src/llm/chat.ts` calls both from the server only (JSON mode, 12 s timeout, one retry on 429). Without `GROQ_API_KEY`, Mistral does both calls. Without `MISTRAL_API_KEY`, every check-in ends safely in the fallback card.

Keys live in `.env` (and `.env.local`, which wins if a key is in both); both files are gitignored. Variables already set by CI or Render win over both.

Try it against Neon (each persona gets a reusable test visitor tagged "CLI test"):

```
npm run retrieve -- facts riya            # facts unit and goal card; add 2 or 3 for Riya's other SIPs
npm run retrieve -- ask riya "Market crash ho gaya, mera SIP red mein hai. Band kar du?"
npm run retrieve -- normal riya           # "What does this dip mean for my goal?"
npm run retrieve -- fall riya             # simulate a market fall for the test visitor
npm run retrieve -- log riya              # last 5 ai_checks rows, with the models that read and wrote
npm run retrieve -- fresh riya            # start over with a clean copy
```

## Phase 6 · retrieval testing (the eval)

`npm run eval` runs AI call 1 on the 20 hand-labelled golden posts and the 16 safety and routing cases through the full check-in. It stores every result in `eval_runs` and `eval_results`, prints a report, and exits 1 when the gate (PRD §7) fails:

- **Must pass every run:**
    - the 8 safety cases: advice requests declined, refund misreads caught, nonsense to the fallback card
    - no answer with advice, wrong numbers or a missing disclaimer.
- **Must not regress:**
    - golden-set theme agreement at least 65% (target 75%)
    - at least 7 of the 8 routing cases.

A run takes 6-8 minutes and uses about a fifth of Groq's free daily tokens.

**CI** (`.github/workflows/ci.yml`):
- **Every push:** the type check, tests, `data:check` and `chunks:check`.
- **When AI files change** (`src/pipeline`, `src/llm`, `src/eval`, `src/db`, `data/`, the workflow, or the dependencies): `db:verify` and `npm run eval` as well. The **Run workflow** button on the Actions tab always runs the eval, as does a commit message containing `[run eval]` (for example `git commit --allow-empty -m "Re-run CI [run eval]"`).

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
│   │   ├── market/            made-up funds, NAVs, assets, prices, IPOs
│   │   ├── explainers/        stop, skip, pause, lower amount
│   │   └── guardrails/        advice-phrase list (EN, HI, Hinglish)
│   ├── chunks/                Phase 2 · one unit per explainer
│   ├── embeddings/            Phase 3 · not used (D3)
│   ├── vector_db/             Phase 4 · not used (D3)
│   └── eval/                  Phase 6 · retrieval testing fixtures
│       ├── golden_set/        20 Evidence Log posts + hand labels
│       └── cases/             16 safety and routing cases (s01–s16)
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
    │   ├── loading/           Phase 1 · seed, per-visitor copy, demo market fall
    │   ├── chunking/          Phase 2 · explainers from data/raw to data/chunks
    │   └── retrieval/         Phase 5 · validate, PII guard, SQL facts, understand, route, context, quality check
    ├── llm/                   Groq and Mistral clients (server only)
    ├── db/                    Postgres client, schema, migrations
    ├── eval/                  Phase 6 · eval runner (golden set + 16 cases)
    ├── e2e/                   browser tests: the More menu, a new account starting clean
    └── tests/                 Phase 6 · API tests
```
