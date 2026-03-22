/**
 * Shared test helpers for integration tests.
 * Builds a Fastify app with MockAdapter and a mock tenant seeded in-memory.
 */

import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { createAppContainer, type Cradle } from '../container/index.js';
import type { Env } from '../config/env.js';
import type { AwilixContainer } from 'awilix';

export const TEST_DOMAIN = 'mock-store.localhost';

export const TEST_ENV: Env = {
  PORT: 0,
  LOG_LEVEL: 'error',
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://ucp:ucp@localhost:5432/ucp',
  REDIS_URL: 'redis://localhost:6379',
  SECRET_KEY: 'test_secret_key_at_least_32_characters_long',
};

/**
 * Build a test app with MockAdapter.
 * Patches the tenant resolution to return a mock tenant without hitting DB/Redis.
 */
export async function buildTestApp(): Promise<{
  app: FastifyInstance;
  container: AwilixContainer<Cradle>;
}> {
  const container = createAppContainer(TEST_ENV);
  const app = await buildApp({ container });

  // Override tenant resolution: skip DB/Redis, inject mock tenant directly
  app.addHook('onRequest', async (request) => {
    const url = request.url;
    if (url === '/health' || url === '/ready') return;

    const adapterRegistry = container.resolve('adapterRegistry');

    request.tenant = {
      id: '00000000-0000-0000-0000-000000000001',
      slug: 'mock-store',
      domain: TEST_DOMAIN,
      platform: 'mock',
      adapterConfig: {},
      settings: {},
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };
    request.adapter = adapterRegistry.get('mock');
  });

  await app.ready();
  return { app, container };
}
