# Contract file provenance

The files under `schemas/` and `fixtures/` plus the upstream contract
description `upstream-contract-README.md` were copied verbatim (byte for byte,
no edits) from the data side contract at a single reviewed commit.

- Upstream repository: https://github.com/wangzhuxirou-svg/Canadian-Early-Career-Data-Analytics-Job-Market
- Upstream commit: `b828553f91cf6cd6ae5b0766e7fbf4c6b1822535` (merge of PR #1
  "Add shared v1 data contracts"; this is the jointly reviewed v1 contract
  baseline recorded in `docs/data-integration.md`).
- Sync date: 2026-10-27.
- Contract version: `1.0.0`, JSON Schema Draft 2020-12.
- Sync method: direct `cp` from a fresh `git clone` at that commit; the clone
  HEAD was re-verified as `b828553f` at copy time and the clone working tree
  was clean. SHA-256 below was computed from the copied bytes.

## Files and SHA-256

| Path | Upstream path | SHA-256 |
| --- | --- | --- |
| `schemas/bundle.schema.json` | `contracts/schemas/bundle.schema.json` | `1d50d430d87f36c41ea4a394f0fd600aca73979c20210c5c83d39d77e831c5e0` |
| `schemas/common.schema.json` | `contracts/schemas/common.schema.json` | `39e485d9ffb2a19d6bdbb7d0433e0a7d7bc4bb0a3c6b5e0d2cc7eb66a8095f49` |
| `schemas/manifest.schema.json` | `contracts/schemas/manifest.schema.json` | `f9f86ef0fed391336ec93b98c602e3b19bd92f888b0297db289257f7acb1faf8` |
| `schemas/market-job.schema.json` | `contracts/schemas/market-job.schema.json` | `1c16277e750297afb1799384de22d411930c32d962ddcaa59e1671c9a29b751e` |
| `schemas/skill.schema.json` | `contracts/schemas/skill.schema.json` | `524a60dbd7806a9407ca75f1acfa10c324c7d72e40b3eb90a20081747c3de000` |
| `schemas/course.schema.json` | `contracts/schemas/course.schema.json` | `c7ab1319df780892f359c2f805299e22370b271db5a73ad69fda0ebecccc1b75` |
| `schemas/resource.schema.json` | `contracts/schemas/resource.schema.json` | `3219a91077497c691db27f516a666f06929fd7977612d324798763738b8e3bbc` |
| `schemas/opportunity.schema.json` | `contracts/schemas/opportunity.schema.json` | `e00c4c9d425da4a45c55f2f6364d80cb3446d88d50bb785d7c087ff9dbd36cb8` |
| `fixtures/valid_bundle.json` | `contracts/fixtures/valid_bundle.json` | `4f83261ae54c9e7f24dd247789eb1a486d5578a34abeaa964c5aeb695b9c4f9c` |
| `fixtures/empty_bundle.json` | `contracts/fixtures/empty_bundle.json` | `9f12e3f1d132f73683b69c267de82ea3cb3c544d2d3fccbc811d2fad276d42ab` |
| `fixtures/invalid_bundle.json` | `contracts/fixtures/invalid_bundle.json` | `bba01eafdfa78e7a1d11b455cafd41f8ba9fedd120d57231eb675a334a887db6` |
| `upstream-contract-README.md` | `contracts/README.md` | `19760fe0b838d3202068b066f5971ae58acfc4ffc04576968b86ad48509a8b7d` |

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
