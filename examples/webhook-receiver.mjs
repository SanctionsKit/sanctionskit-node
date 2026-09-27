import { verifyWebhook } from 'sanctionskit';

export async function receiveWebhook(request, { secret, persistAndEnqueue }) {
  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (!verifyWebhook(secret, request.headers, rawBody)) {
    return new Response('Invalid signature', { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody));
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (!event || Array.isArray(event) ||
      event.id !== request.headers.get('Webhook-Id') ||
      !['sandbox', 'production'].includes(event.environment) ||
      typeof event.type !== 'string' || !event.type ||
      typeof event.createdAt !== 'string' ||
      !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) {
    return new Response('Invalid event', { status: 400 });
  }

  try {
    // Commit a unique endpoint/environment/event receipt and queued work atomically.
    // An existing receipt is a successful no-op.
    await persistAndEnqueue(event);
  } catch {
    return new Response('Storage unavailable', { status: 503 });
  }
  return new Response(null, { status: 204 });
}
