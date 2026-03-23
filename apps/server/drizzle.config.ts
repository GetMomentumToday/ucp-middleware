import type { Config } from 'drizzle-kit';

export default {
  schema: '../../packages/core/src/infra/schema.ts',
  out: '../../packages/core/src/infra/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://ucp:ucp@localhost:5433/ucp',
  },
} satisfies Config;
