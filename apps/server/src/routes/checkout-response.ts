import type { CheckoutSession } from '@ucp-middleware/core';

const UCP_VERSION = '2026-01-23';

export function toPublicCheckoutResponse(session: CheckoutSession): Record<string, unknown> {
  return {
    id: session.id,
    status: session.status,
    line_items: session.line_items,
    currency: session.currency,
    totals: session.totals,
    links: session.links,
    buyer: session.buyer,
    shipping_address: session.shipping_address,
    billing_address: session.billing_address,
    order: session.order,
    continue_url: session.continue_url,
    messages: session.messages,
    expires_at: session.expires_at,
    ucp: {
      version: UCP_VERSION,
      capabilities: {
        'dev.ucp.shopping.checkout': [{ version: UCP_VERSION }],
      },
      payment_handlers: {},
    },
  };
}
