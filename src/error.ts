export interface SanctionsKitErrorOptions {
  status: number;
  code: string;
  requestId?: string;
  retryAfter?: string;
  details?: unknown;
  detailsTruncated?: boolean;
}

export class SanctionsKitError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;
  readonly retryAfter: string | undefined;
  readonly details: unknown;
  readonly detailsTruncated: boolean | undefined;

  constructor(message: string, options: SanctionsKitErrorOptions) {
    super(message);
    this.name = 'SanctionsKitError';
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.retryAfter = options.retryAfter;
    this.details = options.details;
    this.detailsTruncated = options.detailsTruncated;
  }
}
