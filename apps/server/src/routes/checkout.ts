import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AdapterError, type CheckoutSession } from '@ucp-middleware/core';
import {
  sendSessionError,
  isSessionExpired,
  isSessionOwnedByTenant,
  hasSessionAlreadyCompleted,
  findExistingSessionByIdempotencyKey,
  storeIdempotencyMapping,
} from './checkout-helpers.js';

const addressSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  postal_code: z.string().min(1),
  region: z.string().optional(),
  country_iso2: z.string().length(2),
});

const createSessionSchema = z.object({
  cart_id: z.string().min(1).optional(),
  idempotency_key: z.string().min(1).optional(),
});

const patchSessionSchema = z.object({
  shipping_address: addressSchema.optional(),
  billing_address: addressSchema.optional(),
});

const completeSessionSchema = z.object({
  payment: z.object({
    token: z.string().min(1),
    provider: z.string().min(1),
  }),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError): FastifyReply {
  const message = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
  return sendSessionError(reply, 'VALIDATION_ERROR', message, 400);
}

export async function checkoutRoutes(app: FastifyInstance): Promise<void> {
  app.post('/ucp/checkout-sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const sessionStore = app.container.resolve('sessionStore');
    const redis = app.container.resolve('redis');

    if (parsed.data.idempotency_key) {
      const existingId = await findExistingSessionByIdempotencyKey(
        redis, request.tenant.id, parsed.data.idempotency_key,
      );
      if (existingId) {
        const existing = await sessionStore.get(existingId);
        if (existing) return reply.status(200).send(existing);
      }
    }

    const session = await sessionStore.create(request.tenant.id);

    let result: CheckoutSession | null = session;
    if (parsed.data.cart_id || parsed.data.idempotency_key) {
      const updateFields: Record<string, unknown> = {};
      if (parsed.data.cart_id) updateFields['cart_id'] = parsed.data.cart_id;
      if (parsed.data.idempotency_key) updateFields['idempotency_key'] = parsed.data.idempotency_key;
      result = await sessionStore.update(session.id, updateFields);
    }

    if (parsed.data.idempotency_key) {
      await storeIdempotencyMapping(redis, request.tenant.id, parsed.data.idempotency_key, session.id);
    }

    return reply.status(201).send(result ?? session);
  });

  app.patch<{ Params: { id: string } }>(
    '/ucp/checkout-sessions/:id',
    async (request, reply: FastifyReply) => {
      const parsed = patchSessionSchema.safeParse(request.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);

      const sessionStore = app.container.resolve('sessionStore');
      const session = await sessionStore.get(request.params.id);

      if (!session) return sendSessionError(reply, 'SESSION_NOT_FOUND', `Session not found: ${request.params.id}`, 404);
      if (isSessionExpired(session)) return sendSessionError(reply, 'SESSION_EXPIRED', 'Checkout session has expired', 410);
      if (session.status !== 'incomplete') return sendSessionError(reply, 'INVALID_SESSION_STATE', `Cannot modify session in state: ${session.status}`, 409);
      if (!isSessionOwnedByTenant(session, request.tenant)) return sendSessionError(reply, 'SESSION_NOT_FOUND', `Session not found: ${request.params.id}`, 404);

      const updateData: Record<string, unknown> = {};
      if (parsed.data.shipping_address) updateData['shipping_address'] = parsed.data.shipping_address;
      if (parsed.data.billing_address) updateData['billing_address'] = parsed.data.billing_address;

      if (parsed.data.shipping_address) {
        const totals = await calculateTotalsWithFallback(request, session, parsed.data.shipping_address, parsed.data.billing_address);
        if (totals) updateData['totals'] = totals;
        updateData['status'] = 'ready_for_complete';
      }

      const updated = await sessionStore.update(request.params.id, updateData);
      return reply.status(200).send(updated);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/ucp/checkout-sessions/:id/complete',
    async (request, reply: FastifyReply) => {
      const parsed = completeSessionSchema.safeParse(request.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);

      const sessionStore = app.container.resolve('sessionStore');
      const session = await sessionStore.get(request.params.id);

      if (!session) return sendSessionError(reply, 'SESSION_NOT_FOUND', `Session not found: ${request.params.id}`, 404);
      if (isSessionExpired(session)) return sendSessionError(reply, 'SESSION_EXPIRED', 'Checkout session has expired', 410);
      if (hasSessionAlreadyCompleted(session)) return reply.status(200).send(session);
      if (session.status !== 'ready_for_complete') return sendSessionError(reply, 'INVALID_SESSION_STATE', `Session must be in ready_for_complete state, got: ${session.status}`, 409);
      if (!isSessionOwnedByTenant(session, request.tenant)) return sendSessionError(reply, 'SESSION_NOT_FOUND', `Session not found: ${request.params.id}`, 404);

      const cartId = session.cart_id ?? '';
      const order = await request.adapter.placeOrder(cartId, parsed.data.payment);

      const completed = await sessionStore.update(request.params.id, {
        status: 'completed',
        order_id: order.id,
      });

      return reply.status(200).send(completed);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/ucp/checkout-sessions/:id/cancel',
    async (request, reply: FastifyReply) => {
      const sessionStore = app.container.resolve('sessionStore');
      const session = await sessionStore.get(request.params.id);

      if (!session) return sendSessionError(reply, 'SESSION_NOT_FOUND', `Session not found: ${request.params.id}`, 404);
      if (!isSessionOwnedByTenant(session, request.tenant)) return sendSessionError(reply, 'SESSION_NOT_FOUND', `Session not found: ${request.params.id}`, 404);
      if (session.status === 'completed') return sendSessionError(reply, 'INVALID_SESSION_STATE', 'Cannot cancel a completed session', 409);
      if (session.status === 'cancelled') return reply.status(200).send(session);

      const cancelled = await sessionStore.update(request.params.id, { status: 'cancelled' });
      return reply.status(200).send(cancelled);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/ucp/checkout-sessions/:id',
    async (request, reply: FastifyReply) => {
      const sessionStore = app.container.resolve('sessionStore');
      const session = await sessionStore.get(request.params.id);

      if (!session) return sendSessionError(reply, 'SESSION_NOT_FOUND', `Session not found: ${request.params.id}`, 404);
      if (!isSessionOwnedByTenant(session, request.tenant)) return sendSessionError(reply, 'SESSION_NOT_FOUND', `Session not found: ${request.params.id}`, 404);

      return reply.status(200).send(session);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/ucp/orders/:id',
    async (request, reply: FastifyReply) => {
      try {
        const order = await request.adapter.getOrder(request.params.id);
        return reply.status(200).send(order);
      } catch (err) {
        if (err instanceof AdapterError && err.code === 'ORDER_NOT_FOUND') {
          return sendSessionError(reply, 'ORDER_NOT_FOUND', `Order not found: ${request.params.id}`, 404);
        }
        throw err;
      }
    },
  );
}

async function calculateTotalsWithFallback(
  request: FastifyRequest,
  session: CheckoutSession,
  shippingAddress: z.infer<typeof addressSchema>,
  billingAddress: z.infer<typeof addressSchema> | undefined,
): Promise<unknown> {
  const cartId = session.cart_id;
  if (!cartId) return null;

  try {
    return await request.adapter.calculateTotals(cartId, {
      shipping_address: shippingAddress,
      billing_address: billingAddress,
    });
  } catch {
    return null;
  }
}
