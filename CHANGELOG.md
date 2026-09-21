# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.7] - 2026-09-22

### Fixed

- **`@deepseek-ai/dsh-home-paths` is now a `peerDependency`, not a
  `dependency`.** The community contributing guidelines require official
  `@deepseek-ai/*` packages to be declared as peer dependencies so the host
  provides a single copy at runtime. The `resolveDshHome()` import in
  `lib/index.js` is unchanged; the host's `@deepseek-ai/dsh-home-paths`
  resolves the import exactly as before (verified by loading the packed
  artifact on a real DSH host).

### Added

- **`dsh.compatibility` declaration (DSH STORE listing contract).** A new
  `compatibility` block under the `dsh` field (the existing `bundle` and
  `client` entries are unchanged) declares per-release compatibility through
  `dshReleases`: `0.1.5-rc.1`, `0.1.5-rc.2` and `0.1.6-alpha.2` are all marked
  `compatible` — the plugin was actually loaded and run on all three, with no
  errors. Releases that were not tested are deliberately left unlisted (the
  scanner treats them as `unknown`). `node` is declared as `>=20`, matching
  the existing `dshhub.compatibility.node` field.

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
