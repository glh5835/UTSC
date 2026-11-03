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
  never part of a public bundle. A3 checked the schema against the existing
  personal tables but did not copy the private fixture or schema to public.
- Remaining ingestion/review fixtures (`valid_raw_post.json`,
  `valid_ocr_result.json`, `valid_review_patch.json`,
  `valid_opportunity_draft.json`, `valid_organizer.json`) and their schemas —
  these describe the data side Instagram ingestion/review handoff.
- `contracts/rules/recommendation*.json` — A4 rules, not consumed by A3.
- Anything outside `contracts/` (pipeline code, real data packages).

## A3 experience extraction sync (2026-10-28)

A3 adds only the English experience-extraction rule and its test samples.
They are byte-for-byte copies from the same commit
`b828553f91cf6cd6ae5b0766e7fbf4c6b1822535`, fetched from a fixed-SHA
codeload archive whose ZIP CRC was verified.

| Website path | Upstream path | SHA-256 | Visibility |
| --- | --- | --- | --- |
| `rules/experience-skill-extraction.json` | `contracts/rules/experience-skill-extraction.json` | `13c999b3e1eb44072d068737c4a498bacf6d6a31b0641cca2b3fab42c5f0e993` | public rule |
| `../tests/fixtures/experience-skill-extraction.schema.json` | `contracts/schemas/experience-skill-extraction.schema.json` | `3185c7854218d3288433900a2b9df289d5142118224db2e81ecb7a7877bfcfc3` | test-only schema |
| `../tests/fixtures/valid_experience_skill_candidates.json` | `contracts/fixtures/valid_experience_skill_candidates.json` | `213501fb43c66a1c31f7156395719e0fe8bb564909a9827b465729ca2a96b409` | test-only synthetic sample |

The rule has `rule_set_version: 1.0.0`, `language_scope: ["en"]` and
`language_notice_for: ["other", "unknown"]`. The website extracts candidates
locally, requires explicit confirmation, and never writes candidates directly
to confirmed skills. The test schema references the existing public
`common.schema.json` `$id` registry and is not served to browsers.

## A4 recommendation rule sync (2026-10-29)

A4 adds only the shared recommendation rule. It is a byte-for-byte copy from
the same reviewed commit `b828553f91cf6cd6ae5b0766e7fbf4c6b1822535`, fetched
read-only through the GitHub contents API at that ref; the returned bytes were
verified by recomputing the Git blob SHA-1 (`blob <size>\0` + bytes) against
the upstream tree entry before the file was written. No private schema or
private fixture was synced in this round.

| Website path | Upstream path | SHA-256 | Visibility |
| --- | --- | --- | --- |
| `rules/recommendation.json` | `contracts/rules/recommendation.json` | `2ca67cddcc605689749bb38221d357fc005efaf6c44be82254fc69779a260d54` | public rule |

The rule file is 805 bytes, `rule_set_version: 1.0.0`, upstream Git blob SHA-1
`0eefbd4831dacf7fbaf8a948bc6d831e98fc03ee`. The website mirrors its frozen
content in `src/lib/recommend.ts` (required input `user_selected_target_skill_ids`,
match field `skill_ids`, unconfirmed-skills-are-not-assumed-absent, sort
`target_skill_coverage_count_desc → beginner_fit_desc → verified_at_desc`,
beginner-fit order `beginner_friendly → unknown → prerequisites_required`, no
employment probability, no guaranteed course eligibility) and asserts the
synced file's SHA-256 in `tests/recommend.test.ts`, so a drifted copy fails the
build instead of silently changing recommendations.

The upstream rule defines the beginner-fit ORDER only, not a field mapping.
The website-side mapping is conservative and documented in
`src/lib/recommend.ts`: an explicit structured `level: "beginner"` maps to
`beginner_friendly`; `intermediate` / `advanced` / `unknown` map to `unknown`
and are never interpreted as formal prerequisites; `prerequisites_required` is
never derived under the 1.0.0 resource schema because it has no structured
prerequisite field. The derived value is display-only and never written back
into any contract data.

If upstream changes the contract, re-sync from the new reviewed commit, update
this file with the new commit and hashes, and review the impact on
`src/data/` before shipping. Contract changes still require coordination on
both sides per `docs/data-integration.md`; the website must not invent or
patch contract fields locally.
