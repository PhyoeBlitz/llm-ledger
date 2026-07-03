# Security Policy

## Supported Versions

Only the latest published version of `llm-ledger` on npm receives security
fixes.

| Version | Supported |
|---|---|
| Latest (1.x) | ✅ |
| < 1.0 | ❌ |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report it privately using one of the following:

1. [GitHub Security Advisories](https://github.com/PhyoeBlitz/llm-ledger/security/advisories/new) — preferred, allows coordinated disclosure.
2. Email **1997kophyoe@gmail.com** with a description of the issue, steps to reproduce, and potential impact.

You should receive an acknowledgement within a few days. If the issue is
confirmed, a fix will be released as soon as possible and credit will be
given in the release notes, unless you prefer to remain anonymous.

## Scope

`llm-ledger` is a zero-runtime-dependency library that computes token cost
estimates from `usage` objects you already have — it does not make network
requests, execute untrusted input, or handle secrets. Reports related to
transitive **devDependencies** (build/test tooling) are still welcome, but
are lower priority since they never ship in the published package.
