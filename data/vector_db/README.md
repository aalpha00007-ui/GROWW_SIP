# data/vector_db/ — Phase 4, not used

This folder stays empty by design (`Docs/architecture.md`, decision D3; PRD §3.3, step 2a).

Two plain stores cover all content: Neon Postgres for investor data, logs and eval results, and this repo (`data/raw/`, `data/chunks/`) for fixed text.

Only add files here if the PRD changes to allow vector search.
