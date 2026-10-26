# Changelog

## 1.0.0

- Establish the stable public API and document runtime, TypeScript, deprecation, and maintenance support.
- Require `summary: true` for result search and status, review, and origin filters. Invalid combinations now fail before a request; previous versions allowed the server to ignore them.
- Add optional matching settings, match assessments, policy matching settings, and input warnings to response types.
- Check supported API operations and types against a versioned contract, with a separate live contract check.
- Verify packed ESM, CommonJS, and TypeScript consumers before publication on Node 22 and 24.
- Add a separate sandbox acceptance check for screening, idempotency, evidence, pagination, batches, and monitoring.

See [upgrading from 0.2.x](https://github.com/SanctionsKit/sanctionskit-node/blob/main/COMPATIBILITY.md#upgrading-from-02x) before updating filtered result calls.

## 0.2.3

- Clarify screening and ongoing monitoring capabilities in the package description.
- Keep the broader source and workflow keywords from 0.2.2.
- No runtime changes.

## 0.2.2

- Expand search metadata for supported sanctions lists, screening workflows, and SDK features.
- Add source guides, workflow examples, and setup answers to the README.
- Link the npm homepage to the Node.js and TypeScript integration guide.
- Add a manual npm search audit for maintainers.
- No runtime changes.

## 0.2.1

- Include the changelog in the npm package and link it from the README.
- No runtime changes.

## 0.2.0

- Add lazy iterators for results, policies, batches, and batch rows.
- Add batch completion polling with a total deadline and cancellation.
- Add typed monitoring methods for lifecycle, health, controls, and inbox events.
- Add webhook signature verification and a Web Request receiver example.
- Add list-specific screening, pagination, batch completion, and monitoring examples.
- Add UK sanctions, U.S. CSL, BIS, and restricted-party screening keywords.

## 0.1.1

- Expand package metadata for sanctions, OFAC, and watchlist screening searches.
- Add README guidance for production coverage, API key scopes, and OFAC screening.
- No runtime changes.

## 0.1.0

- Initial JavaScript and TypeScript SDK.
- Screening, source discovery, policies, retained results, evidence, batches, and usage.
- Request timeouts, cancellation, idempotency keys, and structured API errors.
- ESM and CommonJS support with no runtime dependencies.
