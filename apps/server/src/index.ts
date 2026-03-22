/**
 * UCP Middleware Server
 * Entry point for the Fastify HTTP server.
 */

import 'dotenv/config';
import Fastify from 'fastify';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const LOG_LEVEL = process.env['LOG_LEVEL'] ?? 'info';
const NODE_ENV = process.env['NODE_ENV'] ?? 'development';

const server = Fastify({
  logger: {
    level: LOG_LEVEL,
    ...(NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : {}),
  },
});

server.get('/health', async () => ({ status: 'ok' }));

server.get('/ready', async (_request, reply) => {
  // TODO: verify DB and Redis connectivity
  return reply.send({ status: 'ok' });
});

const start = async (): Promise<void> => {
  try {
    await server.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

await start();
