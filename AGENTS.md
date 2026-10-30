# UTSC website development

This is the independent website repository requested by the project owner.
The existing root Python application is the preserved Streamlit demo. The
React + TypeScript + Vite website lives in `web/`; Supabase migrations live in
`supabase/`. A0–A4 are implemented locally; A5–A8 remain out of scope until
explicitly authorized.

## Ownership and boundaries

- Website owner: the account holder. Data pipeline owner: Seraphina.
- Do not modify or push the separate data repository at
  `wangzhuxirou-svg/Canadian-Early-Career-Data-Analytics-Job-Market`.
- Data contracts remain authoritative upstream. Do not silently change IDs,
  enums, statistics or schemas to fit the legacy demo.
- Root `utsc_nav/`, `tests/` and `data/synthetic/` belong to this legacy demo;
  they are not copies of the upstream pipeline's directories.
- Keep original attachments, historical deliveries, local databases and private
  inputs excluded. Do not overwrite the owner's existing state or datasets.

## Development

- Read `docs/README.md`, `docs/app_setup.md` and the current task before editing.
- Use one task branch per development task. Keep changes within the authorized
  stage. Preserve unrelated edits and avoid force pushes or destructive resets.
- Label synthetic fixtures, historical records, pending review and unavailable
  services accurately. Local checks are not production or business acceptance.
- UI language changes must retain canonical enum values, filters and personal
  text. Official source content may remain in its original language.
- Do not put credentials, `service_role` keys, student records, downloads,
  Instagram sessions or upstream raw recruitment responses into Git.
- Use the agreed 1.0.0 contract fixtures and upstream rules; never promote an
  unmerged candidate contract silently. Runtime LLM calls, club self-service
  submissions and automated notifications are outside v1.

## Validation

- Run the relevant tests. Full legacy regression: `python -m pytest tests -q`.
- `python scripts/prepare_demo.py` explicitly prepares a clean synthetic
  runtime only when it will not overwrite existing state.
- Website checks: `cd web && npm run typecheck && npm run test && npm run build`.
  Real Auth/RLS acceptance is `npm run test:rls-acceptance` from the root; a
  skipped vitest wrapper is not a substitute.
- Check real rendered pages for UI changes, including English/Chinese,
  keyboard operation and mobile layout. See `docs/app_setup.md`.
- Store generated QA evidence under ignored `artifacts/`, not in public Git.
- Report what actually ran and which external services remain unconnected.
