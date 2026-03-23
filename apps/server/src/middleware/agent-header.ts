import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const SKIP_PATHS = new Set(['/health', '/ready']);

function getUrlPath(url: string): string {
  return url.split('?')[0]!;
}

function isPublicEndpoint(path: string): boolean {
  return SKIP_PATHS.has(path) || path.startsWith('/.well-known/');
}

function isValidAgentHeader(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export async function agentHeaderPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const path = getUrlPath(request.url);
    if (isPublicEndpoint(path)) return;

    if (!isValidAgentHeader(request.headers['ucp-agent'])) {
      void reply.status(401).send({
        error: {
          code: 'INVALID_AGENT',
          message: 'Missing or invalid UCP-Agent header. Format: "agent-name/version"',
          http_status: 401,
        },
      });
      return;
    }
  });
}
