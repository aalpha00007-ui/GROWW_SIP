# data/

All data here is made up or authored by us. No real person, fund, NAV or market feed goes in this folder (see `Docs/architecture.md`, Phase 1).

| Folder | Phase | Contents | Status |
| --- | --- | --- | --- |
| `raw/personas/` | 1. Data loading | Seed templates for Riya, Arjun and Meera (investors, goals, SIPs, instalments, mandates) | Used |
| `raw/market/` | 1. Data loading | Made-up funds, `nav_history`, assets, asset prices and IPOs | Used |
| `raw/explainers/` | 1. Data loading | The four fixed explainers as authored: stop, skip, pause, lower amount | Used |
| `raw/guardrails/` | 1. Data loading | Advice-phrase list in English, Hindi and Hinglish, for the quality check | Used |
| `chunks/` | 2. Chunking | One unit per explainer, keyed `stop`, `skip`, `pause`, `lower_amount`; no splitting | Used |
| `embeddings/` | 3. Embedding | Nothing; see its README | Not used (D3) |
| `vector_db/` | 4. Vector store | Nothing; see its README | Not used (D3) |
| `eval/golden_set/` | 6. Retrieval testing | 20 Evidence Log posts with hand labels | Used |
| `eval/cases/` | 6. Retrieval testing | 16 safety and routing cases, s01–s16 | Used |

Runtime data (per-visitor copies, `ai_checks`, `eval_runs`, `eval_results`) lives in Neon Postgres, not in this folder.
