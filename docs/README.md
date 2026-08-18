# Documentation

This directory is the entry point for project architecture, operational
guidance, exact contracts, decisions, plans, and reviews.

## Map

- [Documentation schema](SCHEMA.md)
- [Architecture](architecture/index.md)
- [Decisions](decisions/README.md)
- [Plans](plans/README.md)
- [Runbooks](runbooks/README.md)
- [Reference](reference/README.md)
- [Reviews](reviews/README.md)

## Maintenance contract

Architecture, runbooks, reference documents, this map, and `SCHEMA.md` are
living documents. Update them with the implementation or workflow they
describe. Decisions and reviews are dated snapshots; add a superseding document
instead of rewriting their historical conclusions. Plans are living while
active and snapshots after completion.

| Change | Documentation to review |
| --- | --- |
| Extension message flow, permissions, or PiKVM integration | `architecture/overview.md`, root `README.md`, `PRIVACY.md`, `SECURITY.md` |
| Hammerspoon trigger or installer lifecycle | `architecture/overview.md`, `runbooks/README.md`, root `README.md` |
| Keyboard or keymap behavior | `reference/layouts.md`, root `README.md` |
| Commands, package contents, CI, or Rulesync | root `README.md`, this file, `.rulesync/rules/repository.md` |
| Documentation taxonomy or naming | `SCHEMA.md` and the affected section index |

Repository facts and executable configuration take precedence over stale prose.
Verify a claim against code before updating the corresponding living document.
