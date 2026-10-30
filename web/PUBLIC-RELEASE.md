# Public experience preview

This release exposes five pages: Home (`#/`), Market overview (`#/market`),
Role comparison (`#/compare`), Courses (`#/courses`) and Resources (`#/pathways`).
All public content is marked SYNTHETIC. It is not a live job-market report,
an approved real-data publication, a complete course catalog or a claim of
current availability, eligibility or employment outcomes.

The release reuses the accepted market statistics and recommendation functions
and the shared 1.0.0 contract. It adds dedicated read-only course and resource
pages. AuthProvider and private routes are absent from the public render graph;
account, profile, opportunity and sample-viewer addresses show the standard
not-found page. No database migration or account service is part of this release.
The language switch retains filters, the current page and current target selections.

The source is a separate Sites checkout. It preserves the deployed read-only
Worker, public-file allowlist and HTTP security headers. The Worker delivers
only approved embedded files through GET/HEAD; unknown paths return 404 and
write methods return 405. Every build mode rejects Supabase configuration.
Only the generated `dist/` Worker artifact is packaged for deployment.

Validation commands:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm run test:deployment
```

Browser acceptance covers English/Chinese, all five pages, keyboard operation,
390px layouts, market/compare URL restoration, course evidence, target-driven
recommendations, unavailable private routes and absence of account/database traffic.
QA artifacts remain outside this source checkout.

The existing Site audience is preserved. Previous saved Site versions remain
available for rollback. This release does not change the website development
working tree, GitHub main, the data pipeline or the private candidate D7 package.
