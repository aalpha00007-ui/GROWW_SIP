# data/embeddings/ — Phase 3, not used

This folder stays empty by design (`Docs/architecture.md`, decision D3; PRD §3.3, step 2a).

Every lookup is by key: investor and SIP id for facts, route for explainers. Embeddings would add a step that can retrieve the wrong content without making the answer more accurate. Mistral call 1 does the language understanding instead.

Only add files here if the PRD changes to allow vector search.
