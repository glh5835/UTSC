# Contract file provenance

The files under `schemas/` and `fixtures/` plus the upstream contract
description `upstream-contract-README.md` were copied verbatim (byte for byte,
no edits) from the data side contract at a single reviewed commit.

- Upstream repository: https://github.com/wangzhuxirou-svg/Canadian-Early-Career-Data-Analytics-Job-Market
- Upstream commit: `b828553f91cf6cd6ae5b0766e7fbf4c6b1822535` (merge of PR #1
  "Add shared v1 data contracts"; this is the jointly reviewed v1 contract
  baseline recorded in `docs/data-integration.md`).
- Sync date: 2026-10-27. Hash records corrected: 2026-10-28 (see below).
- Contract version: `1.0.0`, JSON Schema Draft 2020-12.
- Sync method: direct `cp` from a fresh `git clone` at that commit; the clone
  HEAD was re-verified as `b828553f` at copy time and the clone working tree
  was clean. SHA-256 below is computed over the **upstream bytes** (LF line
  endings, as stored in the upstream Git objects). `.gitattributes` marks
  `web/public/contracts/** -text`, so a fresh checkout of this repository
  materializes those exact bytes regardless of `core.autocrlf`.

## Correction record (2026-10-28)

The 2026-10-27 table below was found inaccurate during the A1 review:

- The original SHA-256 values had been computed over the **working-tree
  bytes** of the copying machine, which had CRLF line endings (the files were
  checked out before the `-text` attribute existed). Five records
  (`manifest`, `skill`, `course`, `resource`, `opportunity`) additionally
  referenced the hash of a *different* file's working-tree bytes.
- All 12 Git blobs at this repository's HEAD were verified byte-for-byte
  identical to the upstream files at `b828553f` (fetched as raw bytes and
  compared). No contract content was changed; the divergence was line-ending
  conversion plus mis-recorded hashes only.
- Remediation: the 12 working-tree files were restored to the exact upstream
  bytes (from the verified Git blobs), and the table below was rebuilt from
  the upstream byte hashes. Verified again inside a temporary clean checkout.

## Files and SHA-256 (upstream bytes; verified 2026-10-28)

| Path | Upstream path | SHA-256 |
| --- | --- | --- |
| `schemas/bundle.schema.json` | `contracts/schemas/bundle.schema.json` | `a409b3e712545537688576e11dc89c49563aaa1e189e3c0bcd6020b7922c49cd` |
| `schemas/common.schema.json` | `contracts/schemas/common.schema.json` | `06b1bf0e082e49ae8c1545fe3c49baade923fa0f5cc1182c8900fda52002a6b0` |
| `schemas/manifest.schema.json` | `contracts/schemas/manifest.schema.json` | `b7541ca26089313a2a3af953e07e1798a357d75f30d4cc3dd45f27e8db10b3b5` |
| `schemas/market-job.schema.json` | `contracts/schemas/market-job.schema.json` | `9ffb24ea936e56f96f7147c729471371ad056a744c63ae2d0226e36545602cc0` |
| `schemas/skill.schema.json` | `contracts/schemas/skill.schema.json` | `a989714bda3bef2730a4cfbc894534ce2a5db1bb218698364a6e7d4cc566a822` |
| `schemas/course.schema.json` | `contracts/schemas/course.schema.json` | `6504b19da58604b66ba56457562761425da67c633608caa8f58590f170d5c5eb` |
| `schemas/resource.schema.json` | `contracts/schemas/resource.schema.json` | `ab68713ed2898faaff468ddff3ad77d3dc192afafb15741b545378dda6bc6869` |
| `schemas/opportunity.schema.json` | `contracts/schemas/opportunity.schema.json` | `e25643e8fadf99ec86b5b523fd469dc1f5ae93114f069ae95d6507105e8b69a5` |
| `fixtures/valid_bundle.json` | `contracts/fixtures/valid_bundle.json` | `45103ee454d9367f83c600affc2ef1fce8bd6f2bff78fc53709847bb962ce08e` |
| `fixtures/empty_bundle.json` | `contracts/fixtures/empty_bundle.json` | `f1a5ca85c6629dae9e2e3e6fccf27fc31a2d306514551fa5d5e75304df8d807c` |
| `fixtures/invalid_bundle.json` | `contracts/fixtures/invalid_bundle.json` | `10e1e3df279db70532b8745608e19781daa6f0bb89d37a4d7476978fb8faadba` |
| `upstream-contract-README.md` | `contracts/README.md` | `7a758301d899919751e2d377e99b99b14123a350724e499e5bbc2bfbd89941bc` |

## Scope of the sync

`bundle.schema.json` references manifest, market-job, skill, course, resource
and opportunity schemas, which in turn reference `common.schema.json`. The
eight schema files above are exactly that reference closure for the public
bundle; nothing was added or rewritten. The three bundle fixtures are the
agreed acceptance samples for A0 (valid shows data, empty shows empty states,
invalid must be rejected).

Deliberately **not** synced into the website public assets:

- `contracts/schemas/user-record.schema.json` and
  `contracts/fixtures/private_user_record.json` — private user data interface,
  never part of a public bundle.
- Remaining ingestion/review fixtures (`valid_raw_post.json`,
  `valid_ocr_result.json`, `valid_review_patch.json`,
  `valid_opportunity_draft.json`, `valid_organizer.json`,
  `valid_experience_skill_candidates.json`) and their schemas — these describe
  the data side Instagram ingestion/review handoff, which A0 does not consume.
- `contracts/rules/*.json` — extraction and recommendation rules are consumed
  from A3/A4 onward; A0 reads no rules.
- Anything outside `contracts/` (pipeline code, real data packages).

If upstream changes the contract, re-sync from the new reviewed commit, update
this file with the new commit and hashes, and review the impact on
`src/data/` before shipping. Contract changes still require coordination on
both sides per `docs/data-integration.md`; the website must not invent or
patch contract fields locally.
