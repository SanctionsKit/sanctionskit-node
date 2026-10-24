# npm search checks

This manual audit tracks whether developers can find `sanctionskit` across 60 relevant searches. The [baseline](npm-search-baseline.json) records version 0.2.1 before the discoverability update.

The October 23, 2026 baseline (Mountain Time) completed all 60 searches without errors. The package appeared in the first 20 results for **11 searches**, the first 50 for **17**, and the first 250 for **31**. The remaining **29** searches did not return it within that limit. Every matched result reported version 0.2.1.

Examples: `sanctions screening` ranked 5, `watchlist` 11, `sanctions` 22, and `ofac` 170. `sanction`, `ofsi`, `seco`, and `kyb` were absent even where the returned result set contained fewer than 250 packages. All five runtime-specific searches fell outside the first 250.

The download API reported **8** downloads for October 16–22 and **869** for September 23–October 22. Exact UTC measurement timestamps and all result counts are preserved in the JSON.

## Run another measurement

```bash
node scripts/search-discovery.mjs /tmp/sanctionskit-search-after-0.2.2.json
```

The script requires Node.js 22 or newer and no dependencies. It reads npm's public search, package metadata, and download-count APIs. It never installs a package, and it refuses to overwrite an existing output file. Omit the path to print JSON.

Requests start at least two seconds apart, with at most three in flight. A rate-limited request gets one retry after npm's `Retry-After` delay, or 30 seconds when no delay is supplied. Persistent rate limiting, or a requested delay longer than a minute, stops further requests. A partial report includes errors and exits with a nonzero status.

## Query matrix

| Family | Queries |
| --- | --- |
| Brand | sanctionskit |
| Sanctions | sanctions; sanction; sanctions screening; sanction screening; sanctions api; sanctions check |
| OFAC | ofac; ofac screening; ofac api; ofac sdn; sdn; specially designated nationals |
| Watchlists | watchlist; watchlist screening; watchlist monitoring; sanctions list |
| Trade | restricted party screening; restricted party; denied party screening; denied persons list; export control screening; trade compliance |
| Lists | uk sanctions; eu sanctions; un sanctions; bis; bis denied persons; consolidated screening list; us csl; ofsi; canada sanctions; swiss sanctions; seco; japan sanctions; ofac non sdn |
| Due diligence | aml; aml screening; anti money laundering; kyc; kyb; due diligence; customer due diligence |
| Entities | customer screening; customer sanctions screening; entity screening; vendor screening; supplier screening; counterparty screening |
| Workflows | batch screening; bulk screening; sanctions monitoring; ongoing monitoring; sanctions webhook; screening audit trail |
| Runtime | sanctions nodejs; sanctions typescript; ofac nodejs; ofac typescript; watchlist sdk |

These are search terms, not a statement that every list is available or that the SDK provides a complete AML, KYC, or KYB program. Check [current source availability](https://www.sanctionskit.com/docs/sources) when describing supported coverage.

## Reading the results

Each query uses the registry's default ordering and inspects up to 250 results. `rank` is one-based. `null` means the package was not observed in those results; an error is recorded separately. Broad queries can return many unrelated packages, so absence from the first 250 does not establish absence from the search index.

Compare reports with the same `queryMatrixVersion`, ordering, and result limit. Check `indexedVersion` before attributing changes to a release. Search positions can change between measurements; this audit does not estimate query volume, clicks, conversions, or revenue. Download counts are events over the returned date ranges, not unique users.

npm documents searchable package titles, descriptions, READMEs, and keywords, along with separate sorting by downloads, dependents, or publication date. Keep metadata relevant to the SDK and use the README to explain real integration use cases. No particular position is guaranteed. See [npm's search guide](https://docs.npmjs.com/searching-for-and-choosing-packages-to-download/), [search API](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md#get-v1search), and [download-count API](https://github.com/npm/registry/blob/main/docs/download-counts.md).
