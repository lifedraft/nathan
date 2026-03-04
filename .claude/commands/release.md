# Release

Create a new release for nathan-cli. Bumps version, commits, tags, pushes, and monitors CI + Release pipelines.

## Arguments

$ARGUMENTS — The semver bump type: `patch`, `minor`, or `major`. Defaults to `patch` if omitted.

## Steps

1. **Pre-flight checks**:
   - Run `git status` — abort if there are uncommitted changes (warn the user to commit or stash first)
   - Run `git branch --show-current` — abort if not on `main`
   - Run `bun run check` (lint + fmt) and `bun test` — abort if anything fails
   - Run `bun run build` — abort if build fails

2. **Determine the new version**:
   - Read `package.json` to get the current version
   - Read the latest git tag with `git tag --sort=-version:refname | head -1`
   - Compute the new version by applying the bump type ($ARGUMENTS, default `patch`) to the **higher** of the two (package.json vs latest tag)
   - Show the user: current version → new version, and ask for confirmation before proceeding

3. **Bump version in package.json**:
   - Update the `"version"` field in `package.json` to the new version
   - Do NOT use `npm version` (it auto-commits and auto-tags — we control that ourselves)

4. **Commit and tag**:
   - Stage `package.json`
   - Commit with message: `Release vX.Y.Z`
   - Create an annotated tag: `git tag -a vX.Y.Z -m "vX.Y.Z"`

5. **Push**:
   - Push the commit and tag together: `git push && git push origin vX.Y.Z`

6. **Monitor pipelines**:
   - Use `gh run list --limit 5` to find the CI run (triggered by push to main) and the Release run (triggered by the tag push)
   - Watch the CI pipeline with `gh run watch <id> --exit-status`
   - Watch the Release pipeline with `gh run watch <id> --exit-status`
   - Report the final status of both pipelines to the user

7. **On failure**:
   - If CI fails: show the failed logs with `gh run view <id> --log-failed`, diagnose, and suggest next steps
   - If Release fails: show the failed logs, check if it's a duplicate npm publish (expected if re-tagging), and report
   - Do NOT automatically delete tags or revert commits — ask the user first
