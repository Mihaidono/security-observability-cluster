# Contributing

## Summary

This repository uses:

- Conventional Commits for commit messages
- `pre-commit` to run local commit-time checks and formatting
- a single GitHub Actions quality workflow that runs both commit-message linting and `pre-commit` checks on pull requests
- path-filtered container image workflows that build and push backend and frontend images to Amazon ECR on pushes to `main`
- `semantic-release` to create Git tags, GitHub releases, and `CHANGELOG.md` updates from commits merged to `main`

## Relevant Findings

- Existing repository history is mixed. Older commits do not consistently follow Conventional Commits.
- `semantic-release` only derives version bumps and release notes from Conventional Commit messages.
- For a clean automation boundary, seed the repository with an initial release tag before relying on automated releases.

## Commit Format

Use this format:

```text
<type>(<scope>): <description>
```

Examples:

```text
feat(frontend): add scenario bundle selector
fix(backend): prevent duplicate apply requests
docs(repo): document Terraform stage ordering
ci(release): add semantic-release workflow
chore(deps): bump vite to 6.1.0
```

Allowed types:

- `feat`: new behavior or capability
- `fix`: bug fix
- `docs`: documentation-only change
- `refactor`: internal restructuring without intended behavior change
- `perf`: performance improvement
- `test`: add or update tests
- `build`: build system or dependency change
- `ci`: CI/CD workflow change
- `chore`: maintenance task that does not fit another release-relevant type

Allowed scopes in this repository:

- `repo`
- `backend`
- `frontend`
- `infra`
- `core`
- `platform`
- `applications`
- `docker`
- `ci`
- `docs`
- `deps`
- `release`
- `security`

Breaking changes:

```text
feat(core)!: rename Terraform output contract
```

or:

```text
feat(core): rename Terraform output contract

BREAKING CHANGE: platform and applications consumers must read the new output names.
```

## Local Hooks

Install the local hooks after cloning:

```bash
pip install pre-commit
pre-commit install --hook-type pre-commit --hook-type commit-msg
```

What runs locally:

- whitespace and newline normalization
- YAML, JSON, and TOML syntax validation
- merge-conflict marker detection
- `prettier --write` for supported text assets
- `terraform fmt`, `terraform validate`, `tflint`, and `terraform-docs` for Terraform roots and modules
- `commitlint` on the `commit-msg` hook for Conventional Commit enforcement

## Pull Request Gate

GitHub Actions runs one workflow on pull requests:

- `commitlint`
  validates all PR commit messages against [tooling/commitlint.config.mjs](/home/mihandrei/work/security-observability-cluster/tooling/commitlint.config.mjs:1)
- `pre-commit`
  runs the repository `pre-commit` hooks, including Prettier and Terraform checks

The pull request should be configured to require the `Quality Checks / commitlint` and `Quality Checks / pre-commit` checks before merge.

## Image Publishing

GitHub Actions publishes container images with two separate workflows:

- `Publish Backend Image`
  - runs on pushes to `main` when files under `backend/` change
  - can also be started manually with `workflow_dispatch`
- `Publish Frontend Image`
  - runs on pushes to `main` when files under `frontend/` change
  - can also be started manually with `workflow_dispatch`

Both workflows:

- authenticate to AWS through GitHub OIDC
- run a Trivy container vulnerability scan before push
- log into Amazon ECR
- build with Docker Buildx
- push two tags:
  - `${github.sha}`
  - `latest`

Required repository configuration:

- GitHub Actions OIDC trust configured in AWS
- repository variable `AWS_ROLE_TO_ASSUME`
- optional repository variable `AWS_REGION`
  - defaults to `eu-north-1` if unset
- repository variable `BACKEND_ECR_REPOSITORY`
- repository variable `FRONTEND_ECR_REPOSITORY`

Operational notes:

- the ECR repositories should be created by the `bootstrap` Terraform root before the image workflows are used
- these workflows are push-based, not PR-based
- path filters are used so unrelated changes do not rebuild images
- the container scan currently fails on `HIGH,CRITICAL`
- the scan ignores unfixed vulnerabilities

Terraform hook prerequisites on developer machines:

- `terraform`
- `tflint`
- `terraform-docs`

Manual runs:

```bash
pre-commit run --all-files
npx commitlint --from HEAD~5 --to HEAD --verbose
```

## Release Behavior

On every push to `main`, GitHub Actions runs `semantic-release`.

Version bump rules:

- `fix(...)`: patch release
- `feat(...)`: minor release
- any commit with `!` or `BREAKING CHANGE:`: major release
- other types do not create a release unless configured to do so later

Release outputs:

- annotated git tag in the format `vX.Y.Z`
- GitHub release with generated notes
- updated `CHANGELOG.md` committed back to `main`

## Bootstrap

Before the first automated release, create the initial tag manually on the commit that represents the first shipped state.

Example:

```bash
git tag -a v0.1.0 -m "First release"
git push origin v0.1.0
```

After that, merge Conventional Commit-formatted changes into `main` and let GitHub Actions create subsequent releases.

## Validation

Local dry run:

```bash
npm ci
npm run release:dry-run
```

Check commit formatting locally:

```bash
npx commitlint --from HEAD~5 --to HEAD --verbose
```

## Rollback

If a bad release is cut:

1. Revert the offending commit on `main`.
2. Push the revert with a Conventional Commit message such as:

```text
revert(repo): revert broken release trigger
```

3. If you must remove the tag and GitHub release manually:

```bash
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
```

Also delete the corresponding GitHub release in the repository Releases page.

## References

- semantic-release docs: https://semantic-release.gitbook.io/semantic-release
- commitlint getting started: https://commitlint.js.org/guides/getting-started.html
- Conventional Commits 1.0.0: https://www.conventionalcommits.org/en/v1.0.0/
