# Contributing

Use Node.js 22 or later.

```sh
npm ci
npm run check
```

Keep changes focused and include a test for changed request or response behavior. Tests must run without network access or API keys. Use invented subjects in examples and fixtures.

Check the [API reference](https://www.sanctionskit.com/docs/api-reference) and [OpenAPI document](https://www.sanctionskit.com/openapi.json) when changing a method or type. Include production documentation links when adding an example.

The offline suite checks SDK method types against the structural API snapshot in `tests/contracts`. Run `npm run contract:check:online` separately to compare that snapshot with the published contract. A mismatch requires review: update SDK types, fixtures, and migration notes as needed, then refresh the snapshot with `node scripts/contract-check.mjs --update-from /path/to/reviewed-openapi.json`. Do not refresh it just to make a failing check pass.

`npm run test:package` builds a tarball, installs it in an isolated temporary project without registry access, and verifies ESM, CommonJS, and TypeScript consumers. CI runs this on Node 22.0.0, current Node 22, and Node 24.

## Sandbox acceptance

Run `npm run test:sandbox` separately before a release. Supply `SANCTIONSKIT_API_KEY` in the environment or an ignored `.env.sandbox` file. Use a temporary **sandbox** key with `sources:read`, `screenings:write`, `results:read`, `batches:write`, `monitors:write`, and `usage:read` in a test workspace without a required policy. Never commit the key.

The check verifies the key's environment before writes and uses five synthetic screening units. It tests matching and no-match outcomes, idempotent replay and conflict handling, retained evidence, summary filters, pagination, a two-row batch, and monitor screening and controls. It removes its monitor and cancels unfinished batch work on failure. Completed synthetic results remain subject to normal retention. Results and cleanup identifiers are saved in the ignored `.sandbox-report.json`.

Webhook signatures and the receiver are checked offline. This acceptance check does not register an endpoint or prove hosted webhook delivery. Missing credentials, insufficient sandbox allowance, or a failed check block the release; they are not a pass. Revoke the temporary key when verification is finished.

For bug reports, include the SDK version, Node.js version, and a small reproduction. Remove keys, personal data, and real subject details. API integration questions can go to [SanctionsKit support](https://www.sanctionskit.com/contact).

## Search checks

Run `npm run search:check -- /tmp/sanctionskit-search.json` for a manual search snapshot. See [npm search checks](docs/npm-discoverability.md) for the query matrix and comparison guidance. This check uses public npm APIs and is separate from the offline test suite.

## Releases

1. Update the version, changelog, and any compatibility notes, then run `npm run check`.
2. Run `npm run contract:check:online`, `npm run test:package`, and `npm run test:sandbox`. Resolve failures before continuing.
3. Inspect the package file list. It should contain the compiled SDK, README, changelog, compatibility guide, license, and package metadata.
4. Commit and push the release with GitKraken. Confirm the author and committer use the SanctionsKit identity before pushing.
5. Check that GitHub Actions passed for that exact release commit on every supported CI runtime.
6. Run `npm whoami` and confirm the account is `sanctionskit`.
7. Run `npm publish --access public` and complete npm's authentication prompt.
8. Verify `npm view sanctionskit version` and install the published version in a clean project. Check both `import` and `require` from the registry artifact.

Publishing is manual. The CI workflow runs checks and does not hold registry credentials.
