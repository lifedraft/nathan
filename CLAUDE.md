# Nathan CLI

AI-agent-friendly CLI for unified API orchestration.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **CLI framework**: Clipanion
- **Linter**: oxlint
- **Formatter**: oxfmt
- **Test runner**: bun:test

## Commands

- `bun run lint` — Lint with oxlint
- `bun run fmt:check` — Check formatting with oxfmt
- `bun run fmt` — Auto-fix formatting
- `bun test` — Run all tests
- `bun run build` — Bundle with esbuild to `dist/nathan`

## CI

All PRs must pass: lint, format check, tests, and build. Run `/ci` to verify locally.

## Project Structure

- `src/commands/` — CLI commands (help, describe, run, plugin/*, dynamic)
- `src/core/` — Plugin registry, loader, config
- `src/n8n-compat/` — n8n node adapter layer
- `plugins/` — Built-in YAML plugin definitions
- `dist/` — Build output
