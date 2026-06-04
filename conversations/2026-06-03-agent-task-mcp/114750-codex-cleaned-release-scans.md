# Codex Handoff - Cleaned Release Scans

## User Request

Remove unused GitHub Actions scanning and explain how to publish `@hrz6976/sidekick-mcp` to npm.

## Changes Made

- Deleted `.github/workflows/scan.yml`.
- Deleted `.github/workflows/scorecard.yml`.
- Deleted `.github/codeql/codeql-config.yml`.
- Updated `.github/workflows/release.yml` so the publish path is now `check -> test -> publish` instead of `check -> scan -> test -> publish`.
- Added optional `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` to the publish step so first publish can use a temporary npm token before trusted publishing is configured.
- Updated `tasks/todo.md` with the CI cleanup plan and results.

## Verification

- `rg -n "scan\\.yml|scorecard|CodeQL|Shai-Hulud|Security Scan|codeql" .github README.md AGENTS.md CHANGELOG.md package.json` returned no matches.
- `git diff --check -- .github/workflows/release.yml .github/workflows/scan.yml .github/workflows/scorecard.yml .github/codeql/codeql-config.yml tasks/todo.md` passed.
- `npm view @hrz6976/sidekick-mcp version` returned npm `E404`, so the package has not been published yet.

## Notes

- The release workflow still uses npm OIDC/provenance publishing with `id-token: write` and `npm publish --provenance --access public`.
- Because `@hrz6976/sidekick-mcp` is not published yet, either bootstrap the first publish with `NPM_TOKEN` or publish once manually, then configure npm trusted publishing for GitHub Actions:
  - owner: `hrz6976`
  - repo: `multicli`
  - workflow filename: `release.yml`
  - allowed action: `npm publish`
