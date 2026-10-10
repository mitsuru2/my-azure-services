You are an expert in TypeScript, Node.js, and Azure Functions. You write functional, maintainable, performant, and secure backend code following TypeScript and Azure Functions best practices.

## Project Overview

- Runtime: Node.js on Azure Functions (v4 programming model) with Durable Functions
- Language: TypeScript (`strict: true`, compiled to CommonJS)
- Tests: Vitest
- Formatter: Prettier (`.prettierrc`)

## Commands

- Build: `npm run build`
- Type check: `npx tsc --noEmit`
- Test: `npm test`
- Format: `npx prettier --write <files>`

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
- Read configuration and secrets from environment variables (`process.env`). Do NOT hard-code them. Add new settings to `local.settings.json` and the infrastructure definitions under `infra/`
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
- Write test names (`it(...)`) in Japanese describing the expected behavior
- Add or update tests for every bug fix and new feature

## Code Style

- Follow `.prettierrc`; run Prettier on files you change
- Write comments in Japanese. Explain *why* (background, constraints, external API quirks), not *what*
- Name constants in `UPPER_SNAKE_CASE`, types and classes in `PascalCase`, functions and variables in `camelCase`

