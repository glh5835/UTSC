# Public experience preview v3 source review

This branch ports the deployed v3 public entry from Sites source commit
`a3dddb16dfac2e98549eeffb77d08548b59da9b3` into the website repository's `web/`.
It is stacked on the full A4 development branch; its entry-point restrictions
are release-specific and must be reviewed before any merge into development.

Five public pages are reachable: Home, Market overview, Role comparison,
read-only Courses and Resources. All public data are SYNTHETIC and use the
reviewed 1.0.0 contract. Accounts, private profiles, personal saving and unfinished
opportunity pages are not reachable. Public entry points import no AuthProvider
or private data gateway. The Worker serves only allowlisted GET/HEAD files.
Every build mode rejects inherited Supabase configuration.

The full-development A4 queued-write repair remains in this branch's private
module and tests. It is not in the public bundle and has not been deployed.
Documentation is adapted to the repository layout; old connected-build example
instructions are removed because that script is unavailable in this release.

Owner-reported public acceptance: 2026-10-30, Windows computer, Microsoft Edge;
all items passed, language switching and mobile layout normal. Browser version,
specific time and physical-phone testing were not separately supplied. The
agent's earlier automated public request received Cloudflare 403 before the
application; that historical report is retained locally and is not overwritten.

The deployed v3 source and original archives remain frozen locally. Current
public-artifact comparison and source checks are recorded after execution.
This PR neither deploys a Site nor changes audience, database migrations,
formal contracts, the data pipeline or the previous saved version.

An older deployment PR (#4) describes v2. It is preserved unchanged; do not
merge both overlapping deployment implementations without reconciliation.

Current isolated-copy validation: typecheck/build passed; 273 unit tests passed,
3 RLS wrappers skipped; 11 deployment checks passed. No live Auth/RLS matrix
was rerun during source publication. The full-development repair passed 254
unit tests, including four new queued-write regressions.

All static output files and the generated Worker are byte-identical to the
frozen v3 build. Worker SHA-256:
`dc20c9e8e8edc2aa52a31fb98beab14b68b0f90c53fa85927622a96f4295d922`.
HTML, robots and the embedded delivery adapter retain their frozen source bytes
through explicit .gitattributes rules. The public runtime is unchanged; the new
private-path repair is outside its dependency graph. QA logs and screenshots
are excluded from the repository.
