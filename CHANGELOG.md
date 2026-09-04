# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.6] - 2026-09-04

### Fixed

- **alpha.4 compatibility: `@deepseek-ai/dsh-home-paths` range now matches the
  shipped version.** The dependency was `^0.1.0-rc.6`, which under the semver
  prerelease tuple rule does NOT satisfy `0.1.2-alpha.4` — `npm install`
  resolved `0.1.0-rc.8` instead, while the real host ships `0.1.2-alpha.4`.
  The range is now `^0.1.2-alpha.4`; `resolveDshHome()` (the only import) is
  unchanged in alpha.4.
- **RPC failure envelopes now satisfy alpha.4's Connection RPC validator.**
  Every `{ ok: false, error: { code, message } }` result was missing the
  `details` object that `dsh-client-connection@0.1.2-alpha.4`'s
  `parseConnectionResponse` requires — any error (no-token, no-data,
  unauthorized, http-error, network, internal) would throw
  `TypeError: connection: invalid server-response failure` in the real
  browser client and the UI would never see `error.code`. All failure sites
  now emit the canonical `ConnectionRpcFailure` shape via a single `fail()`
  helper (`code`, `message`, `details: {}`).

### Added

- `test/rpc-envelope-alpha4.mjs`: drives every bridge endpoint through the
  real handler and parses each response with the alpha.4 envelope validator
  embedded verbatim from `packages/client/connection/src/client/rpc.ts`
  (dsh-v0.1.2-alpha.4), pinning the wire contract. `npm test` now runs it
  after the existing smoke test.
