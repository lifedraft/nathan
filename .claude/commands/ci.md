# CI

Run the same checks as CI locally: lint, format, test, and build.

## Steps

1. Run all four checks in parallel:
   - `bun run lint`
   - `bun run fmt:check`
   - `bun test`
   - `bun run build`

2. Report results:
   - If everything passes, confirm all checks passed
   - If anything fails, show which check(s) failed and the relevant error output
