import { createHmac, timingSafeEqual } from 'node:crypto';

export type WebhookHeaders = Headers | Readonly<Record<string, string | undefined>>;

export interface VerifyWebhookOptions {
  /** Current Unix time in seconds. */
  now?: number;
  /** Allowed clock difference in seconds. Defaults to 300. */
  toleranceSeconds?: number;
}

function headerValue(headers: WebhookHeaders, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) return undefined;

  let found = false;
  let result: string | undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue;
    if (found || typeof value !== 'string') return undefined;
    found = true;
    result = value;
  }
  return result;
}

/** Verify the original body bytes before parsing JSON. */
export function verifyWebhook(
  secret: string,
  headers: WebhookHeaders,
  rawBody: Uint8Array,
  options: VerifyWebhookOptions = {},
): boolean {
  if (typeof secret !== 'string' || !secret) {
    throw new TypeError('A webhook signing secret is required.');
  }
  if (!(rawBody instanceof Uint8Array)) {
    throw new TypeError('rawBody must contain the original request bytes as a Uint8Array.');
  }
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new TypeError('Webhook verification options must be an object.');
  }

  const now = options.now === undefined ? Math.floor(Date.now() / 1000) : options.now;
  const tolerance = options.toleranceSeconds === undefined ? 300 : options.toleranceSeconds;
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new TypeError('now must be a nonnegative integer in Unix seconds.');
  }
  if (!Number.isSafeInteger(tolerance) || tolerance < 0) {
    throw new TypeError('toleranceSeconds must be a nonnegative integer.');
  }

  const id = headerValue(headers, 'webhook-id');
  const timestamp = headerValue(headers, 'webhook-timestamp');
  const signature = headerValue(headers, 'webhook-signature');
  if (!id || /[\s,\u0000-\u001f\u007f]/.test(id) || !timestamp || !signature) return false;
  if (!/^\d+$/.test(timestamp) || !Number.isSafeInteger(Number(timestamp))) return false;
  if (Math.abs(now - Number(timestamp)) > tolerance || !/^v1=[a-f0-9]{64}$/.test(signature)) return false;

  const expected = createHmac('sha256', secret)
    .update(`${id}.${timestamp}.`)
    .update(rawBody)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(3), 'hex'));
}
