# Website delivery and release

Current delivery (2026-11-03): V5 remains deployed, with owner-confirmed checkbox UI
acceptance and V4 retained for rollback. GitHub PRs #8 and #9 are merged; their merge
does not publish a Sites version. Exact provenance and remaining acceptance limits
are in [the V5 closeout record](reviews/v5-closeout-20261103.md). The procedures below
describe separately authorized future operations; none were executed in this closeout.

The public preview contains SYNTHETIC market, course, resource and opportunity
examples. It deliberately has no account provider or private database gateway.
The full development entry implements accounts, explicit skill confirmation,
learning paths and resource/opportunity favorites against Supabase. Cloud
accounts remain disconnected until an actual project is provisioned and tested.

## Build and validate

From `web/`, run `npm ci`, `npm run typecheck`, `npm test`,
`npm run build:development`, `npm run build`, `npm run test:deployment` and
`npm run test:publication`. The default build selects `public-main.tsx` before
Vite traverses imports. The full entry remains available to the development
server and `build:development`. The two outputs must never be interchanged.

The public build accepts an explicit static-file allowlist, checks for source
maps and recognizable privileged credentials, and rejects the private account
SDK. Its dependency-free Worker serves only GET/HEAD and approved paths, with
CSP, frame denial, no-referrer, nosniff and noindex. Unknown paths return 404.
Application routes use `/#/...`; a missing source file is not an empty dataset.

Browser QA must cover English and Chinese, keyboard navigation, 390px layouts,
all public routes, filter URL restoration, date validation, unknown dates,
registration closed versus ended, calendar downloads and error/retry behavior.
Use the exact built Worker for delivery verification. Local responsive checks
do not establish physical-phone or production-network performance.

## Real local account acceptance

The standalone `npm run test:rls-acceptance -- --out <new-report>` command at the
repository root verifies A1/A3/A4 with two temporary accounts and anonymous
requests. `node scripts/verify-favorites.mjs --out <new-report>` verifies resource
and opportunity favorites, duplicate protection, owner isolation and cleanup.
Configure the documented `UTSC_SUPABASE_*` variables in the process environment.
These commands refuse a target other than the isolated loopback QA stack.
Privileged keys are for QA account setup/cleanup only, never browser configuration.
The skipped Vitest RLS wrappers do not count as successful real acceptance.

## Validated data adapter

The approved consumer contract remains 1.0.0 at
`b828553f91cf6cd6ae5b0766e7fbf4c6b1822535`. The shared runtime validator is also
used by `scripts/publish_bundle.mjs`, including cross-record checks. Packages
must fit the fixed 5 MiB budget. An expected SHA-256 supplied through a trusted
review is mandatory; a self-generated checksum alone is not release approval.

The command sequence from the repository root is:

```text
node scripts/publish_bundle.mjs check --bundle <bundle.json> --expected-sha256 <trusted-sha> --mode demo
node scripts/publish_bundle.mjs stage --bundle <bundle.json> --expected-sha256 <trusted-sha> --mode demo --store <release-store>
node scripts/publish_bundle.mjs activate --store <release-store> --release <returned-release-id>
node scripts/publish_bundle.mjs materialize --store <release-store> --public-dir web/public --selection-file web/src/data/releaseSelection.ts --allowlist web/deployment/public-files.json
```

For real data use `--mode published --attestation <reviewed-attestation.json>`.
It must bind the exact bundle SHA and dataset version, identify the actual reviewer
and confirmation date, and explicitly confirm classification, course evidence,
opportunity dates, source usage permission and content/privacy review. The tool
does not manufacture confirmations. Partial/failed packages, unsupported 1.1
candidates, unsafe links and unreviewed opportunity changes are refused.

Staging writes a new immutable directory. Activation atomically replaces only
the local active pointer. Materialization makes market, course, recommendation
and opportunity consumers use the same versioned bundle and explicitly extends
the asset allowlist. Then rebuild, validate and publish the **whole Site**.
Local pointer changes do not publish the website. An incomplete build or upload
must not be deployed. Existing personal records are never rewritten by this flow.

## Local D7 integration

From the repository root, after installing `web/` dependencies, use the
separate loopback preview. Keep the original candidate under ignored
`artifacts/` with the data owner's fixed source commit, dataset version,
source and review references, and the independently supplied SHA-256 of the
exact `SHA256SUMS.txt` bytes.

```powershell
$fixture = 'web/tests/fixtures/d7-rehearsal'
$pin = Get-Content -LiteralPath "$fixture/PIN.json" -Raw | ConvertFrom-Json
node --test scripts/verify_d7_package.test.mjs
node web/scripts/serve-d7-integration.mjs "$fixture/package" $pin.inventory_sha256 --synthetic --port 5198
```

For a second synthetic snapshot, generate a new ignored directory with
`node scripts/build_d7_rehearsal_fixture.mjs artifacts/d7-partial-rehearsal --partial`.
Use that directory's `package/` and `PIN.json` in the same command, with a free
port for simultaneous comparison. For a real candidate, use the delivered
package path and the data owner's independently confirmed digest, without
`--synthetic`. The preview recognizes the built-in synthetic provenance.

The server checks all members and hashes, the pinned 1.1 schema, sidecars,
reference statistics and opportunity provenance before listening on
`127.0.0.1`. One in-memory snapshot supplies market, comparison, courses,
recommendations and opportunities. The header shows the package version and
its actual run status. Opportunity cards identify automatic candidates and
human approvals using provenance. A `partial` run can be rehearsed internally.
Reconcile schema changes against the data owner's pinned source before use.

Preview the exact public Worker separately with
`node web/scripts/serve-preview.mjs 5199` after `npm --prefix web run build`.
Its six public pages use the public demo inputs. The D7 routes under `/__d7/`
belong to the separate integration origin.

## Calendar semantics

Only approved events with current review, exact UTC start/end instants and a safe
source link can be exported. Pending changes, missing/date-only times, ongoing
opportunities and ended events cannot create reminders. Stable UIDs follow the
opportunity ID; revision is exported as SEQUENCE. UTF-8 lines are folded at 75
octets, text is escaped and output uses CRLF. UTC instants preserve daylight-saving
transitions without inventing a local time. Imported files are snapshots; later
organizer changes do not synchronize automatically.

## Publish, health check and rollback

Use the existing Sites project and its preserved audience. Save the exact
validated source/archive as a new version, then deploy that version. Retain the
previous saved version ID, source commit and archive hash before publishing.
The native deployment result verifies publication; additionally verify anonymous
headers, asset loading and the six public pages when access permits. A provider
403 before the app loads must be reported as blocked automated verification.

Roll back by deploying the previous saved Site version. For local data selection,
`rollback --store <release-store> --release <previous-id>` uses the same atomic
pointer mechanism, followed by materialization, build and whole-site delivery.
Neither rollback resets or rolls back personal databases. Retained V3 remains a
valid prior preview baseline; a destructive database reset is never a rollback.

## Gates outside the current preview

Real D7 publication needs complete data, formal contract approval, actual human
confirmations, organization verification and trustworthy source binding. Cloud
login needs a provisioned Supabase project, configured redirects, incremental
migration review and fresh target-project/public-account/RLS acceptance. Student
trials and independent human acceptance must be recorded by the people involved.
No scheduled collection, paid API call or automatic notification is enabled.
