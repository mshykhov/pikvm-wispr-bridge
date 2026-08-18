# Documentation schema

## Source-of-truth order

1. Executable code, tests, manifests, scripts, and CI configuration.
2. Living documentation indexed by `docs/README.md`.
3. Dated decision, plan, and review snapshots.

When sources disagree, verify current behavior and repair the affected living
document. Do not rewrite historical snapshots to make them appear current.

## Roles

- `README.md` at the repository root owns product setup, usage, compatibility,
  development commands, and the documentation entry point.
- `docs/README.md` owns navigation, lifecycle classification, and the
  code-to-document update map.
- `architecture/` explains current components, flows, state, and boundaries.
- `decisions/` records dated architectural choices and their consequences.
- `plans/` records implementation work and verification status.
- `runbooks/` contains repeatable setup, recovery, and release procedures.
- `reference/` contains exact behavioral and configuration contracts.
- `reviews/` contains dated audit findings.

## Conventions

- Use lowercase kebab-case filenames for new substantive documents.
- Use relative Markdown links and update the owning section index in the same
  change when adding, moving, or removing a document.
- Write living documents in present tense and describe only verified behavior.
- Name snapshots `YYYY-MM-DD-topic.md`; superseding snapshots link to the prior
  document when one exists.
- Do not add frontmatter unless a workflow requires structured metadata.
- Keep credentials, clipboard contents, hostnames, personal paths, and private
  PiKVM URLs out of documentation and examples.
