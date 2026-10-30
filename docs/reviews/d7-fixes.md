# D7 integration preparation and review fixes

The default application remains on the reviewed 1.0.0 contract and SYNTHETIC
fixtures. Candidate 1.1 compatibility has its own schema registry and explicit
version context; candidate schemas and raw packages are not distributed here.

Changes reviewed in this commit:

- Union technical/soft extraction arrays, deduplicate canonical IDs, then use
  catalog categories for skill statistics. Keep each role's own denominator.
- Treat unsupported ownership, observation, requests and quoted/third-person
  skill use conservatively; candidates still require explicit confirmation.
- Reserve unique report output before service calls and refuse existing files.
  Missing credentials and unavailable services cannot produce a passing exit.
- Redact Supabase status in memory before creating local QA output.
- Preserve account/generation isolation and the original shared fixtures.

Current isolated-copy validation: typecheck passed; 204 unit tests passed,
3 RLS wrappers skipped; production build passed (existing large-chunk warning).
Vitest's skipped RLS wrappers are not real-database acceptance. The source
review does not upgrade the formal contract, publish real data or connect a
production account service. Historical QA artifacts and internal notes remain local.
