import { SanctionsKitError } from './error.js';
import type {
  Monitor,
  MonitorControl,
  MonitorCreated,
  MonitorDeleted,
  MonitorEvent,
  MonitorEventPage,
  MonitoringInboxListParams,
  MonitoringListParams,
  MonitoringPage,
  MonitorListParams,
  MonitorPage,
  MonitorRequest,
  MonitorUpdate,
  MonitorUpdated,
  ResourceUpdated,
} from './monitoring-types.js';
import type {
  APIResponse,
  Batch,
  BatchAccepted,
  BatchCancellation,
  BatchDetail,
  BatchRequest,
  BatchRetrieveParams,
  Page,
  PageParams,
  PolicyList,
  ResultsListParams,
  ResultsPage,
  RetainedScreeningResult,
  ScreeningEvidence,
  ScreeningPolicySnapshot,
  ScreeningRequest,
  ScreeningResult,
  ScreeningSummary,
  Source,
  Usage,
} from './types.js';

export interface SanctionsKitOptions {
  apiKey: string;
  baseURL?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface WriteOptions extends RequestOptions {
  idempotencyKey: string;
}

export interface BatchWaitOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}

export interface ResultsResource {
  list(params: ResultsListParams & { summary: true }, options?: RequestOptions): Promise<APIResponse<Page<ScreeningSummary>>>;
  list(params?: ResultsListParams & { summary?: false }, options?: RequestOptions): Promise<APIResponse<Page<ScreeningResult>>>;
  list(params: ResultsListParams, options?: RequestOptions): Promise<APIResponse<ResultsPage>>;
  iterate(params: ResultsListParams & { summary: true }, options?: RequestOptions): AsyncIterableIterator<ScreeningSummary>;
  iterate(params?: ResultsListParams & { summary?: false }, options?: RequestOptions): AsyncIterableIterator<ScreeningResult>;
  iterate(params: ResultsListParams, options?: RequestOptions): AsyncIterableIterator<ScreeningResult | ScreeningSummary>;
  retrieve(id: string, options?: RequestOptions): Promise<APIResponse<RetainedScreeningResult>>;
  evidence(id: string, options?: RequestOptions): Promise<ScreeningEvidence>;
}

interface RequestData {
  query?: object;
  body?: unknown;
  idempotencyKey?: string;
}

const DEFAULT_BASE_URL = 'https://www.sanctionskit.com/api/v1';
const DEFAULT_TIMEOUT_MS = 30_000;

function validateTimeout(value: number, name = 'timeoutMs'): number {
  if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) {
    throw new TypeError(`${name} must be an integer between 1 and 2147483647.`);
  }
  return value;
}

function resourceId(id: string): string {
  if (typeof id !== 'string' || !id.trim() || id === '.' || id === '..') {
    throw new TypeError('A resource ID is required.');
  }
  return encodeURIComponent(id);
}

function idempotencyKey(options: WriteOptions | undefined): string {
  if (!options || typeof options.idempotencyKey !== 'string' || !/^[\w:.-]{8,128}$/.test(options.idempotencyKey)) {
    throw new TypeError('idempotencyKey must contain 8–128 letters, digits, underscores, colons, periods or hyphens.');
  }
  return options.idempotencyKey;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function* iteratePages<T, Params extends PageParams>(
  list: (params: Params, options: RequestOptions) => Promise<APIResponse<Page<T>>>,
  params: Params,
  options: RequestOptions,
): AsyncIterableIterator<T> {
  const query = { ...params };
  const seen = new Set<string>(query.cursor === undefined ? [] : [query.cursor]);
  while (true) {
    options.signal?.throwIfAborted();
    const { data } = await list(query, options);
    options.signal?.throwIfAborted();
    if (!isObject(data) || !Array.isArray(data.items)) {
      throw new Error('SanctionsKit returned an invalid pagination page; expected data.items to be an array.');
    }
    const next = data.nextCursor;
    if (next !== null && (typeof next !== 'string' || !next.trim() || seen.has(next))) {
      throw new Error('SanctionsKit returned an invalid or repeated pagination cursor.');
    }
    for (const item of data.items) {
      options.signal?.throwIfAborted();
      yield item;
    }
    options.signal?.throwIfAborted();
    if (next === null) return;
    seen.add(next);
    query.cursor = next;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export class SanctionsKit {
  #apiKey: string;
  #baseURL: string;
  #timeoutMs: number;
  #fetch: typeof globalThis.fetch;

  constructor(options: SanctionsKitOptions) {
    if (!options || typeof options.apiKey !== 'string' || !options.apiKey.trim() || /[\r\n]/.test(options.apiKey)) {
      throw new TypeError('A nonempty apiKey is required.');
    }

    const baseURL = new URL(options.baseURL ?? DEFAULT_BASE_URL);
    const localHTTP = baseURL.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(baseURL.hostname);
    if ((baseURL.protocol !== 'https:' && !localHTTP) || baseURL.username || baseURL.password || baseURL.search || baseURL.hash) {
      throw new TypeError('baseURL must use HTTPS (or HTTP on localhost), without credentials, a query or a fragment.');
    }

    this.#apiKey = options.apiKey.trim();
    this.#baseURL = baseURL.href.replace(/\/+$/, '');
    this.#timeoutMs = validateTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    if (typeof this.#fetch !== 'function') {
      throw new TypeError('A fetch implementation is required.');
    }
  }

  readonly sources = {
    list: (options?: RequestOptions): Promise<APIResponse<Source[]>> =>
      this.#request('GET', '/sources', options),
  };

  readonly policies = {
    list: (params: PageParams = {}, options?: RequestOptions): Promise<APIResponse<PolicyList>> =>
      this.#request('GET', '/policies', options, { query: params }),
    iterate: (params: PageParams = {}, options: RequestOptions = {}): AsyncIterableIterator<ScreeningPolicySnapshot> =>
      iteratePages(this.policies.list, { ...params }, { ...options }),
    retrieve: (id: string, options?: RequestOptions): Promise<APIResponse<PolicyList>> =>
      this.#request('GET', `/policies/${resourceId(id)}`, options),
  };

  readonly screenings = {
    create: (body: ScreeningRequest, options: WriteOptions): Promise<APIResponse<ScreeningResult>> =>
      this.#request('POST', '/screenings', options, { body, idempotencyKey: idempotencyKey(options) }),
  };

  readonly results: ResultsResource = {
    list: ((params: ResultsListParams = {}, options?: RequestOptions) =>
      this.#request<APIResponse<ResultsPage>>('GET', '/results', options, { query: params })) as ResultsResource['list'],
    iterate: ((params: ResultsListParams = {}, options: RequestOptions = {}) =>
      iteratePages<ScreeningResult | ScreeningSummary, ResultsListParams>(this.results.list, { ...params }, { ...options })) as ResultsResource['iterate'],
    retrieve: (id, options) => this.#request('GET', `/results/${resourceId(id)}`, options),
    evidence: (id, options) => this.#request('GET', `/results/${resourceId(id)}/evidence`, options),
  };

  readonly batches = {
    create: (body: BatchRequest, options: WriteOptions): Promise<APIResponse<BatchAccepted>> =>
      this.#request('POST', '/batches', options, { body, idempotencyKey: idempotencyKey(options) }),
    list: (params: PageParams = {}, options?: RequestOptions): Promise<APIResponse<Page<Batch>>> =>
      this.#request('GET', '/batches', options, { query: params }),
    iterate: (params: PageParams = {}, options: RequestOptions = {}): AsyncIterableIterator<Batch> =>
      iteratePages(this.batches.list, { ...params }, { ...options }),
    retrieve: (id: string, params: BatchRetrieveParams = {}, options?: RequestOptions): Promise<APIResponse<BatchDetail>> =>
      this.#request('GET', `/batches/${resourceId(id)}`, options, { query: params }),
    iterateRows: (id: string, params: BatchRetrieveParams = {}, options: RequestOptions = {}): AsyncIterableIterator<BatchDetail['rows'][number]> =>
      this.#iterateBatchRows(id, { ...params }, { ...options }),
    waitForCompletion: (id: string, options: BatchWaitOptions = {}): Promise<APIResponse<BatchDetail>> =>
      this.#waitForBatch(id, options),
    cancel: (id: string, options?: RequestOptions): Promise<APIResponse<BatchCancellation>> =>
      this.#request('DELETE', `/batches/${resourceId(id)}`, options),
  };

  readonly monitors = {
    create: (body: MonitorRequest, options: WriteOptions): Promise<APIResponse<MonitorCreated>> =>
      this.#request('POST', '/monitors', options, { body, idempotencyKey: idempotencyKey(options) }),
    list: (params: MonitorListParams = {}, options?: RequestOptions): Promise<APIResponse<MonitorPage>> =>
      this.#request('GET', '/monitors', options, { query: params }),
    retrieve: (id: string, options?: RequestOptions): Promise<APIResponse<Monitor>> =>
      this.#request('GET', `/monitors/${resourceId(id)}`, options),
    update: (id: string, body: MonitorUpdate, options: WriteOptions): Promise<APIResponse<MonitorUpdated>> =>
      this.#request('PATCH', `/monitors/${resourceId(id)}`, options, { body, idempotencyKey: idempotencyKey(options) }),
    delete: (id: string, options?: RequestOptions): Promise<APIResponse<MonitorDeleted>> =>
      this.#request('DELETE', `/monitors/${resourceId(id)}`, options),
  };

  readonly monitoring = {
    list: (params: MonitoringListParams = {}, options?: RequestOptions): Promise<APIResponse<MonitoringPage>> =>
      this.#request('GET', '/monitoring', options, { query: params }),
    update: (id: string, body: MonitorControl, options: WriteOptions): Promise<APIResponse<ResourceUpdated>> =>
      this.#request('PATCH', `/monitoring/${resourceId(id)}`, options, { body, idempotencyKey: idempotencyKey(options) }),
    inbox: {
      list: (params: MonitoringInboxListParams = {}, options?: RequestOptions): Promise<APIResponse<MonitorEventPage>> =>
        this.#request('GET', '/monitoring/inbox', options, { query: params }),
      retrieve: (id: string, options?: RequestOptions): Promise<APIResponse<MonitorEvent>> =>
        this.#request('GET', `/monitoring/inbox/${resourceId(id)}`, options),
    },
  };

  readonly usage = {
    retrieve: (options?: RequestOptions): Promise<APIResponse<Usage>> =>
      this.#request('GET', '/usage', options),
  };

  async *#iterateBatchRows(id: string, params: BatchRetrieveParams, options: RequestOptions): AsyncIterableIterator<BatchDetail['rows'][number]> {
    let offset = params.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0) throw new TypeError('offset must be a nonnegative integer.');
    while (true) {
      options.signal?.throwIfAborted();
      const { data } = await this.batches.retrieve(id, { ...params, offset }, options);
      options.signal?.throwIfAborted();
      if (!isObject(data) || !Array.isArray(data.rows)) {
        throw new Error('SanctionsKit returned an invalid batch row page; expected data.rows to be an array.');
      }
      const next = data.nextOffset;
      if (next !== null && (!Number.isSafeInteger(next) || next <= offset)) {
        throw new Error('SanctionsKit returned an invalid or non-advancing row offset.');
      }
      for (const row of data.rows) {
        options.signal?.throwIfAborted();
        yield row;
      }
      options.signal?.throwIfAborted();
      if (next === null) return;
      offset = next;
    }
  }

  async #waitForBatch(id: string, options: BatchWaitOptions): Promise<APIResponse<BatchDetail>> {
    resourceId(id);
    const timeoutMs = validateTimeout(options.timeoutMs ?? 300_000);
    const pollIntervalMs = validateTimeout(options.pollIntervalMs ?? 5_000, 'pollIntervalMs');
    const controller = new AbortController();
    const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
    const timeoutError = new DOMException('Timed out waiting for batch completion.', 'TimeoutError');
    const deadline = performance.now() + timeoutMs;
    const checkDeadline = () => {
      if (performance.now() >= deadline) controller.abort(timeoutError);
      signal.throwIfAborted();
    };
    signal.throwIfAborted();
    const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);
    try {
      while (true) {
        checkDeadline();
        const response = await this.batches.retrieve(id, {}, { signal });
        checkDeadline();
        switch (response.data.status) {
          case 'completed':
          case 'failed':
          case 'cancelled':
            return response;
          case 'importing':
          case 'pending':
          case 'processing':
            await sleep(pollIntervalMs, signal);
            break;
          default:
            throw new Error('SanctionsKit returned an unknown batch status.');
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async #request<T>(method: string, path: string, options: RequestOptions = {}, data: RequestData = {}): Promise<T> {
    const timeoutMs = validateTimeout(options.timeoutMs ?? this.#timeoutMs);
    options.signal?.throwIfAborted();

    const url = new URL(`${this.#baseURL}${path}`);
    for (const [key, value] of Object.entries(data.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers = new Headers({
      Authorization: `Bearer ${this.#apiKey}`,
      Accept: 'application/json',
    });
    if (data.body !== undefined) headers.set('Content-Type', 'application/json');
    if (data.idempotencyKey !== undefined) headers.set('Idempotency-Key', data.idempotencyKey);

    const controller = new AbortController();
    const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
    const timer = setTimeout(() => controller.abort(new DOMException('SanctionsKit request timed out.', 'TimeoutError')), timeoutMs);

    try {
      const response = await this.#fetch(url, {
        method,
        headers,
        signal,
        redirect: 'error',
        ...(data.body === undefined ? {} : { body: JSON.stringify(data.body) }),
      });
      const text = await response.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }

      const requestId = response.headers.get('X-Request-Id');
      const retryAfter = response.headers.get('Retry-After');
      if (!response.ok) {
        const error = isObject(body) && isObject(body.error) ? body.error : {};
        const errorRequestId = typeof error.requestId === 'string' ? error.requestId : requestId;
        throw new SanctionsKitError(
          typeof error.message === 'string' ? error.message : `SanctionsKit request failed (HTTP ${response.status}).`,
          {
            status: response.status,
            code: typeof error.code === 'string' ? error.code : 'http_error',
            ...(errorRequestId === null ? {} : { requestId: errorRequestId }),
            ...(retryAfter === null ? {} : { retryAfter }),
            ...('details' in error ? { details: error.details } : {}),
            ...(typeof error.detailsTruncated === 'boolean' ? { detailsTruncated: error.detailsTruncated } : {}),
          },
        );
      }

      if (!isObject(body)) {
        throw new SanctionsKitError('SanctionsKit returned an invalid JSON response.', {
          status: response.status,
          code: 'invalid_response',
          ...(requestId === null ? {} : { requestId }),
        });
      }
      return body as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
