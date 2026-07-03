# Contributing to llm-ledger

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Getting started

1. Fork the repository and clone your fork:

   ```bash
   git clone https://github.com/PhyoeBlitz/llm-ledger.git
   cd llm-ledger
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a branch for your change:

   ```bash
   git checkout -b my-feature
   ```

## Development workflow

- **Build**: `npm run build` — compiles `src/index.ts` to `dist/` (ESM, CJS, and type declarations) via tsup.
- **Test**: `npm test` — runs the test suite once with Vitest.
- **Test (watch mode)**: `npm run test:watch` — reruns tests on file changes while you work.

Please add or update tests in `test/` for any behavior change. PRs that change pricing, normalization, or budget logic without test coverage will be asked to add it.

## Making changes

- Keep the package **zero-dependency** — don't add runtime dependencies. New devDependencies should have a clear justification.
- Match the existing TypeScript style already in `src/`.
- If you add or change built-in model pricing, cite the source (Anthropic/OpenAI pricing page) in the PR description and update the pricing table in `README.md`.
- Update `README.md` if you add or change public API surface (exports, options, behavior).

## Submitting a pull request

1. Make sure `npm run build` and `npm test` both pass locally.
2. Commit your changes with a clear, descriptive message.
3. Push your branch and open a pull request against `main`.
4. Describe **what** changed and **why** in the PR description; link any related issue.
5. Be responsive to review feedback — small, focused PRs are easiest to review and merge.

## Reporting bugs / requesting features

Open an issue using the [bug report](https://github.com/PhyoeBlitz/llm-ledger/issues/new?template=bug_report.yml) or [feature request](https://github.com/PhyoeBlitz/llm-ledger/issues/new?template=feature_request.yml) template. For security vulnerabilities, see [SECURITY.md](./SECURITY.md) instead of opening a public issue.

## Code of conduct

This project follows a [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you're expected to uphold it.
