# Contributing

Use Node.js 22 or later.

```sh
npm ci
npm run check
```

Keep changes focused and include a test for changed request or response behavior. Tests must run without network access or API keys. Use invented subjects in examples and fixtures.

Check the [API reference](https://www.sanctionskit.com/docs/api-reference) and [OpenAPI document](https://www.sanctionskit.com/openapi.json) when changing a method or type. Include production documentation links when adding an example.

For bug reports, include the SDK version, Node.js version, and a small reproduction. Remove keys, personal data, and real subject details. API integration questions can go to [SanctionsKit support](https://www.sanctionskit.com/contact).

## Releases

1. Update the version and changelog, then run `npm run check`.
2. Run `npm pack --dry-run` and inspect the file list. The package should contain the compiled SDK, README, license, and package metadata.
3. Commit and push the release with GitKraken. Confirm the author and committer use the SanctionsKit identity before pushing.
4. Check that GitHub Actions passed for the release commit.
5. Run `npm whoami` and confirm the account is `sanctionskit`.
6. Run `npm publish --access public` and complete npm's authentication prompt.
7. Verify `npm view sanctionskit version` and install the published version in a clean project.

Publishing is manual. The CI workflow runs checks and does not hold registry credentials.
