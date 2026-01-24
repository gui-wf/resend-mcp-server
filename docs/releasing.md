# Releasing

This project uses [FlakeHub](https://flakehub.com) for Nix binary distribution.

## Versioning Strategy

**Hybrid approach:**
- **Rolling releases**: Every push to `master` publishes `0.1.x+rev-<count>` (latest dev build)
- **Stable releases**: Git tags like `v1.0.0` publish proper semver versions

## Creating a Release

1. Update version in `package.json`
2. Commit the version bump
3. Create and push the tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The `flakehub-publish.yml` workflow will automatically publish to FlakeHub.

## Version Naming

Use semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes (API changes, removed features)
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes (backwards compatible)

## User Installation

```bash
# Latest rolling release
nix run flakehub:gui-wf/resend-mcp-server

# Specific version
nix run flakehub:gui-wf/resend-mcp-server/1.0.0

# From GitHub (builds from source if not cached)
nix run github:gui-wf/resend-mcp-server
```

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push/PR to master | Lint, typecheck, build |
| `nix-build.yml` | Push/PR to master | Nix build + tests |
| `flakehub-publish.yml` | Push to master, tags | Publish to FlakeHub |
