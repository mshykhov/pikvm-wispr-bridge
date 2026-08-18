# Runbooks

Runbooks are living, repeatable operational procedures.

Current setup and removal commands are intentionally kept in the root
[README](../../README.md) because they are part of the primary user workflow:

- install the helper with `./scripts/install-macos.sh`;
- remove it with `./scripts/uninstall-macos.sh`;
- build the extension archive with `npm run package`.

Add a dedicated lowercase kebab-case runbook when a deployment, recovery,
migration, or incident procedure grows beyond the root setup guide, then link it
here.
