# Childcare360 Release Agent

Autonomous bug detection → auto-fix → packaging pipeline.
Zero manual intervention after triggering.

## Pipeline Phases

```
npm run release
      │
      ▼
Phase 1: Static Analysis (fast, no API cost)
  • <form> tags in JSX
  • react-router imports
  • CSS file imports
  • Hardcoded credentials
  • Async handlers without try/catch
  • SQL queries missing tenant_id
  • SQL injection via string interpolation
  • Routes not mounted in server/index.js
  • Version mismatch (package.json vs App.jsx)
      │
      ▼
Phase 2: AI Semantic Analysis (per-file, Anthropic API)
  • Logic bugs and edge cases
  • Missing validation
  • Security issues not caught by regex
  • Tenant isolation gaps
  • Broken/missing error handling
      │
      ▼
Auto-fix (search/replace strategy, retries up to 2×)
  • Generates a precise search → replace patch per bug
  • Backs up originals as file.bak before modifying
  • Re-runs static checks to verify fixes
      │
      ▼
Package (version bump + tar.gz)
  • Increments patch version in package.json
  • Updates version label in App.jsx sidebar
  • Creates childcare360-v{version}-{YYYYMMDDHHNN}.tar.gz
  • Prints copy-paste deploy snippet
  • Writes RELEASE_BUG_REPORT.md
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run check` | Static analysis only (no API, instant) |
| `npm run check:full` | Static + AI analysis, report only |
| `npm run fix` | Analyse + auto-fix criticals |
| `npm run release` | Full pipeline: fix + version bump + tar |
| `npm run release:dry` | Dry-run (shows what would happen, no writes) |
| `npm run release:static` | Static-only analysis + fix + package (no API cost) |
| `npm run release:v 2.3.0` | Release with explicit version |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Clean — no unfixed criticals |
| `1` | Unfixed critical issues remain |
| `2` | Fatal error (script failure) |

## Flags

| Flag | Effect |
|------|--------|
| `--fix` | Auto-fix critical issues using AI |
| `--package` | Bump version + create tar (blocked if unfixed criticals) |
| `--skip-ai` | Skip AI analysis (static checks only) |
| `--dry-run` | Show what would happen without writing files |
| `--verbose` | Show full error details |
| `--version X.Y.Z` | Use specific version instead of auto-incrementing patch |

## What gets auto-fixed

| Rule | Auto-fix strategy |
|------|-------------------|
| `no-form-tags` | Replace `<form>` with `<div>` |
| `sql-missing-tenant-id` | Add `AND tenant_id = ?` to WHERE clause |
| `async-missing-try-catch` | Wrap handler body in try/catch |
| `no-css-imports` | Remove the import line |
| `version-mismatch` | Update App.jsx version string |
| `hardcoded-credential` | Replace with `process.env.KEY` |

## What requires manual review

- `sql-injection-risk` — schema change needed
- `no-react-router` — significant refactor
- Complex logic bugs found by AI

## Backup files

Before any file is modified, a `.bak` copy is created:
```
server/api.js.bak
src/App.jsx.bak
```

To restore: `cp server/api.js.bak server/api.js`

## Setup

1. Copy `scripts/release-agent.js` to your project
2. Add scripts to `package.json` (see `package-scripts.json`)
3. Ensure `ANTHROPIC_API_KEY` is in your `.env`

## File structure

```
scripts/
  release-agent.js    ← The agent (this file)
RELEASE_BUG_REPORT.md ← Written after each run
*.bak                 ← Auto-created backups (git-ignored)
```

Add to `.gitignore`:
```
*.bak
RELEASE_BUG_REPORT.md
```
