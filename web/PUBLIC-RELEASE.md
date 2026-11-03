# Public experience preview

This release exposes six pages: Home (`#/`), Market overview (`#/market`),
Role comparison (`#/compare`), Courses (`#/courses`), Resources (`#/pathways`)
and Opportunities (`#/opportunities`).
All public content is marked SYNTHETIC. It is not a live job-market report,
an approved real-data publication, a complete course catalog or a claim of
current availability, eligibility or employment outcomes.

The release reuses the accepted market statistics and recommendation functions
and the shared 1.0.0 contract. It adds dedicated read-only course and resource
pages. AuthProvider and private routes are absent from the public render graph;
account, profile, favorites and sample-viewer addresses show the standard
not-found page. No database migration or account service is part of this release.
The language switch retains filters, the current page and current target selections.

The source is a separate Sites checkout. It preserves the deployed read-only
Worker, public-file allowlist and HTTP security headers. The Worker delivers
only approved embedded files through GET/HEAD; unknown paths return 404 and
write methods return 405. The public demo build rejects Supabase configuration;
the full development entry supports an explicitly configured test service.
Only the generated `dist/` Worker artifact is packaged for deployment.

Validation commands:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm run test:deployment
```

Browser acceptance covers English/Chinese, all six pages, keyboard operation,
390px layouts, market/compare URL restoration, course evidence, target-driven
recommendations, unavailable private routes and absence of account/database traffic.
Opportunity checks include filter restoration, current/history separation,
unknown dates, registration status and reviewed exact-time calendar downloads.
QA artifacts remain outside the deployed archive.

The existing Site audience is preserved. Previous saved Site versions remain
available for rollback. This release does not change the website development
working tree, GitHub main, the data pipeline or the private candidate D7 package.
