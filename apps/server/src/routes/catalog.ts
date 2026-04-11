import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { SearchFiltersSchema, UcpResponseCatalogSchema, type Product } from '@omnixhq/ucp-js-sdk';
import { AdapterError, toSdkProduct, fromSdkSearchFilters } from '@ucp-gateway/core';
import { buildUCPErrorBody } from './checkout-helpers.js';

const UCP_VERSION = '2026-04-08';

const catalogSearchBodySchema = z.object({
  q: z.string().optional().default(''),
  limit: z.number().int().min(1).max(100).optional().default(20),
  page: z.number().int().min(1).optional().default(1),
  filters: SearchFiltersSchema.optional(),
});

const catalogProductBodySchema = z.object({
  id: z.string().min(1),
});

function buildCatalogEnvelope(): z.infer<typeof UcpResponseCatalogSchema> {
  const input = {
    version: UCP_VERSION,
    status: 'success' as const,
    capabilities: {
      'dev.ucp.shopping.catalog': [{ version: UCP_VERSION }],
    },
  };
  const result = UcpResponseCatalogSchema.safeParse(input);
  return result.success ? result.data : (input as z.infer<typeof UcpResponseCatalogSchema>);
}

interface CatalogSearchResponse {
  readonly ucp: z.infer<typeof UcpResponseCatalogSchema>;
  readonly products: readonly Product[];
  readonly pagination: { readonly page: number; readonly limit: number; readonly count: number };
}

interface CatalogLookupResponse {
  readonly ucp: z.infer<typeof UcpResponseCatalogSchema>;
  readonly product: Product;
}

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.post('/ucp/catalog/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const bodyParsed = catalogSearchBodySchema.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply
        .status(400)
        .send(
          buildUCPErrorBody(
            'validation_error',
            bodyParsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
          ),
        );
    }

    const { q, limit, page, filters } = bodyParsed.data;
    const adapterQuery = fromSdkSearchFilters(filters ?? {}, q, { limit, page });
    const products = await request.adapter.searchProducts(adapterQuery);

    const response: CatalogSearchResponse = {
      ucp: buildCatalogEnvelope(),
      products: products.map(toSdkProduct),
      pagination: { page, limit, count: products.length },
    };
    return response;
  });

  app.post('/ucp/catalog/product', async (request: FastifyRequest, reply: FastifyReply) => {
    const bodyParsed = catalogProductBodySchema.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply
        .status(400)
        .send(buildUCPErrorBody('validation_error', 'Product ID is required'));
    }

    try {
      const product = await request.adapter.getProduct(bodyParsed.data.id);
      const response: CatalogLookupResponse = {
        ucp: buildCatalogEnvelope(),
        product: toSdkProduct(product),
      };
      return response;
    } catch (err: unknown) {
      if (err instanceof AdapterError && err.code === 'PRODUCT_NOT_FOUND') {
        return reply.status(404).send(buildUCPErrorBody('product_not_found', err.message));
      }
      throw err;
    }
  });
}
