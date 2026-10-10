You are an expert in TypeScript, Node.js, and Azure Functions. You write functional, maintainable, performant, and secure backend code following TypeScript and Azure Functions best practices.

## Project Overview

- Runtime: Node.js on Azure Functions (v4 programming model) with Durable Functions
- Language: TypeScript (`strict: true`, compiled to CommonJS)
- Tests: Vitest
- Formatter: Prettier (`.prettierrc`)

## Commands

- Build: `npm run build`
- Type check: `npx tsc --noEmit`
- Unit tests: `npm test` (excludes `*.integration.test.ts`)
- Integration tests: `npm run test:integration`

## TypeScript Best Practices

- Code MUST compile under `strict` mode. Do NOT weaken `tsconfig.json` to make errors go away
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain
- Avoid non-null assertions (`!`) and type assertions (`as`); narrow types with type guards instead
  - `as` is acceptable when parsing external API responses into a declared response interface
- Define fixed value sets as `as const` arrays, derive the union type from them, and provide an `isXxx()` type guard (see `MARKETS` / `isMarket` in `src/functions/stockPrice.ts`)
- Use `Record<UnionType, T>` for lookup tables keyed by a union type so that missing keys are compile errors
- Use `interface` for object shapes
- Use `const` by default; use `let` only when reassignment is required
- Use `async`/`await` instead of raw Promise chains

## Project Structure

- `src/functions/`: Azure Functions entry points. Register each function with `app.http()`, `app.timer()`, `df.app.orchestration()`, etc. in the same file as its handler
- `src/utils/`: Reusable logic that does not depend on a specific function
- Keep handlers thin: validate input, call domain functions, build the response. Put business logic in separately exported functions so it can be unit tested without the Functions runtime
- Design each module around a single responsibility

## Azure Functions

- Pass `InvocationContext` to functions that need logging instead of using `console`
- Log levels:
  - `context.log` / `context.info`: normal progress
  - `context.warn`: recoverable or unexpected-but-handled situations
  - `context.error`: failures that cause an error response or abort processing
- Never log secrets, credentials, or personal data
- Read configuration and secrets from environment variables (`process.env`). Do NOT hard-code them. Add new settings to `local.settings.json` and the infrastructure definitions under `infra/`:
  - Bicep (`infra/bicep/`) is the primary infrastructure definition, including Function App settings
  - Terraform (`infra/terraform/`) is used only for Entra ID resources that Bicep does not support (e.g. managed identities)
- Durable Functions orchestrators MUST be deterministic: do not call I/O, `Date.now()`, `new Date()`, or random functions directly in orchestrators. Use activities and `context.df.currentUtcDateTime` instead

## HTTP APIs

- Validate all request input (query, params, body) before use, and return `400` with a clear message on invalid input
- Return JSON with an explicit `Content-Type: application/json` header
- Map errors to status codes explicitly (e.g. validation → 400, not found → 404, unexpected → 500)
- Keep `openapi.yaml` in sync when adding or changing HTTP endpoints

## Error Handling

- Define custom error classes extending `Error` (setting `this.name`) for errors that need distinct handling (e.g. `NotFoundError`, `ValidationError`)
- Throw `Error` instances only; never throw strings or plain objects
- In `catch` blocks, treat the error as `unknown` and narrow with `instanceof` before accessing properties
- Check `res.ok` (and API-specific status fields) for every `fetch` call
- Do not swallow errors silently; either handle them meaningfully or rethrow

## Testing

- Place unit tests next to the source file as `*.test.ts`
- Place tests that call real external services in `*.integration.test.ts`, and skip them with `describe.skipIf()` when credentials are not available
- Mock external I/O (HTTP, Google APIs) in unit tests
- Do NOT run `npm run test:integration` without the user's explicit approval: it reads and writes real external resources (e.g. the Google Sheets spreadsheet)
- Write test names (`it(...)`) in Japanese describing the expected behavior
- Add or update tests for every bug fix and new feature

## Code Style

- Write comments in Japanese. Explain *why* (background, constraints, external API quirks), not *what*
- Name constants in `UPPER_SNAKE_CASE`, types and classes in `PascalCase`, functions and variables in `camelCase`

## Working Branch and Pull Request

- Never commit directly to `main`. Before making any code changes, run:

```
scripts/start-work-branch.sh <issue-number|none> <feat|fix> [<base-branch>]
```

- `<base-branch>` defaults to `main`; only pass something else when the user explicitly names a different base. The script always branches off the _latest_ `origin/<base-branch>`.
- Branch naming is fully mechanical, computed by the script itself as `${type}/${issue-number}/claude-code`:
  - If this work is tied to a GitHub Issue, pass its number. `${issue-number}` becomes `issue-<n>`, and `${type}` is derived from the issue's labels: `enhancement` → `feat`, else `bug` → `fix` (checked in that priority).
  - If there's no issue (pass `none`), `${issue-number}` becomes today's date (`yyyy-MM-dd`).
  - `<feat|fix>` is still required as an argument even when an issue number is given — it's the fallback used whenever the issue has neither label, or there is no issue. Decide it yourself (`feat` for new/enhanced functionality, `fix` for defects) — this is the one judgment call in this step, and it's yours to make, not a subagent's.
- If the computed branch already exists locally, the script just switches to it (resuming prior work) instead of recreating it.
- All of the session's commits go on this branch.

At Session End (see below), `scripts/commit-push-pr.sh` pushes this branch and opens a pull request targeting `<base-branch>` — unless an open PR for the branch already exists, in which case it just pushes the update and reuses that PR.

## Session Start Procedure

Before starting any work, run `bash scripts/init.sh` from the repo root. It scaffolds required files, verifies the test/build commands, restricts outbound network access to an allowlist, confirms git/gh credentials and GitHub Issues access, and checks Google Drive credentials used for attaching test evidence to GitHub Issues (see Session End Procedure below).

Then always read the following files to understand prior progress and outstanding tasks.

- `claude-progress.txt` — log of past work and handoff notes
- `feature-list.json` — implementation status of each feature

Use this context to decide what to work on in the current session.

## Planning

When the user states a new concrete feature or enhancement they want implemented (including a GitHub Issue labeled `enhancement`), invoke the `planner` subagent before writing any code. Include today's date and the full requirement text in the prompt. Then implement from the resulting `feature-list.json` entry, setting its `status` to `in_progress` when you start.

Do not use the planner for bug fixes, or for hypothetical discussion.

`feature-list.json` `status` values: `todo` → `in_progress` → `done`.

## Session End Procedure

When finishing work, complete the following steps **in this order**.

1. Run `npx tsc --noEmit` and `npm test`, and confirm both succeed. If either fails, fix the cause before proceeding.
2. Update the session records yourself:
   - Append a summary of this session's work, changes, and any unresolved issues to the end of `claude-progress.txt`. Never rewrite prior entries.
   - Upsert the `feature-list.json` entries so the `status` of each feature implemented or changed in this session reflects reality. Update an entry in place if its `name` already exists, otherwise add it; preserve every other entry's content and order.
3. Commit, push, and open (or reuse) the PR:
   - Write a concise commit message and a PR body to files in a scratch directory, and decide a PR title (the title and body are used only if no open PR already exists for the branch).
   - Run `scripts/commit-push-pr.sh <base-branch> <commit-message-file> <pr-title> <pr-body-file> <file1> [<file2> ...]` with the files to commit (code + `claude-progress.txt` + `feature-list.json`).
4. If this session's work was requested via a specific GitHub Issue (the user referenced an issue number/URL, or the task began by reading one with `gh issue view`), attach test evidence to the PR. Skip this step entirely for work that does not originate from a GitHub Issue.
   - For each distinct test case that validates the fix, create a scratch folder named `tc1`, `tc2`, ... containing a `title.txt` (first line = short title) plus evidence appropriate to the change — a plain-text file of input/output patterns for calculation/logic changes.
   - Run `scripts/attach-issue-evidence.sh <issue-number> <tc1-dir> [<tc2-dir> ...]`. It zips each folder, uploads it to Google Drive, and posts a comment linking them on the current branch's open PR (so it must run after step 3).
5. Report the outcome to the user: whether evidence was attached, the commit hash, and the new or reused PR URL. If a script fails, report its output and fix the cause; do not skip the step.
