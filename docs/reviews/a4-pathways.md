# A4 recommendations and personal learning paths

The shared 1.0.0 recommendation rule is copied byte-for-byte and hash-checked.
Resources match only explicitly selected target skills. Ranking uses coverage,
conservative beginner fit, verification time and a stable canonical-ID tie-break.
There are no employment probabilities, eligibility promises or inferred skill gaps.

The full development entry retains accounts and personal paths. Account/generation
guards reject late results; zero-row changes are failures. Two partial unique
indexes enforce per-path resource/skill idempotency. No RLS policy is relaxed;
the migration refuses existing duplicates and does not delete or reset data.

This PR is stacked on the D7 fixes branch. The separate public-preview PR keeps
only the five approved public routes. Publishing source is not a deployment,
a database migration, a contract upgrade or formal real-data approval.

The captured implementation passed typecheck, 250 unit tests (3 RLS wrappers
skipped) and a production build. A further source review reproduced continued
queued writes after an account/generation change. The next, separate repair
commit adds four red/green regressions and stops the remaining batch before
issuing another request. This review does not claim a fresh real-stack matrix.

The repair checks the operation generation before and after every item request.
Already issued requests can finish; no remaining item request or follow-up
reload starts for the stale generation. The four regressions cover late success
and rejection during A→B and A→B→A. RLS remains the database enforcement layer.

Post-repair validation: 254 unit tests passed, 3 RLS wrappers skipped;
typecheck and build passed. The development layout also receives the already
reviewed public-preview skip-link repair: focus moves to main content without
changing the HashRouter route. This is a separate accessibility commit.
