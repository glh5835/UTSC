# UTSC public experience preview

This release branch exposes Home, Market overview, Role comparison, Courses
and Resources. All public data are SYNTHETIC; accounts and personal saving
are absent from the public entry. The development branch retains those features.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:deployment
```

Run these commands in `web/`. The default build rejects Supabase configuration.
It produces a checked static build in `static-dist/`, then embeds only approved
files into the read-only Worker under `dist/`. Build outputs, environment files,
raw candidate data and QA evidence must never be committed or copied to hosting.

GitHub source changes do not deploy the Site. The saved public version stays
unchanged by this source review. See [the source review](../docs/reviews/public-preview-v3.md)
and [PUBLIC-RELEASE.md](PUBLIC-RELEASE.md) for provenance and acceptance scope.
