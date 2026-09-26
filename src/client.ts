import { SanctionsKitError } from './error.js';
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

export interface ResultsResource {
  list(params: ResultsListParams & { summary: true }, options?: RequestOptions): Promise<APIResponse<Page<ScreeningSummary>>>;
  list(params?: ResultsListParams & { summary?: false }, options?: RequestOptions): Promise<APIResponse<Page<ScreeningResult>>>;
  list(params: ResultsListParams, options?: RequestOptions): Promise<APIResponse<ResultsPage>>;
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

function validateTimeout(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) {
    throw new TypeError('timeoutMs must be an integer between 1 and 2147483647.');
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
    retrieve: (id, options) => this.#request('GET', `/results/${resourceId(id)}`, options),
    evidence: (id, options) => this.#request('GET', `/results/${resourceId(id)}/evidence`, options),
  };

  readonly batches = {
    create: (body: BatchRequest, options: WriteOptions): Promise<APIResponse<BatchAccepted>> =>
      this.#request('POST', '/batches', options, { body, idempotencyKey: idempotencyKey(options) }),
    list: (params: PageParams = {}, options?: RequestOptions): Promise<APIResponse<Page<Batch>>> =>
      this.#request('GET', '/batches', options, { query: params }),
    retrieve: (id: string, params: BatchRetrieveParams = {}, options?: RequestOptions): Promise<APIResponse<BatchDetail>> =>
      this.#request('GET', `/batches/${resourceId(id)}`, options, { query: params }),
    cancel: (id: string, options?: RequestOptions): Promise<APIResponse<BatchCancellation>> =>
      this.#request('DELETE', `/batches/${resourceId(id)}`, options),
  };

  readonly usage = {
    retrieve: (options?: RequestOptions): Promise<APIResponse<Usage>> =>
      this.#request('GET', '/usage', options),
  };

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
