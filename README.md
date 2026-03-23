# UCP Gateway

> Universal Commerce Protocol gateway — connect any e-commerce store to any AI agent.

[![CI](https://github.com/GetMomentumToday/ucp-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/GetMomentumToday/ucp-gateway/actions/workflows/ci.yml)
[![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-blue.svg)](LICENSE)
[![UCP Spec](https://img.shields.io/badge/UCP-2026--01--23-purple.svg)](https://ucp.dev/latest/specification/overview/)
[![Node.js 22](https://img.shields.io/badge/node-22-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Features](#2-features)
3. [Architecture](#3-architecture)
4. [Quick Start](#4-quick-start)
5. [Configuration](#5-configuration)
6. [Adapters](#6-adapters)
7. [API Reference](#7-api-reference)
8. [UCP Spec Compliance](#8-ucp-spec-compliance)
9. [Development](#9-development)
10. [Contributing](#10-contributing)
11. [License](#11-license)

---

## 1. Overview

**UCP Gateway** is a BSL-licensed open-source server that implements the [Universal Commerce Protocol (UCP)](https://ucp.dev). It acts as a translation and orchestration hub between e-commerce platforms and AI agent runtimes.

AI agents connect via UCP's standardised checkout API. The gateway translates requests into platform-native API calls (Magento REST, Shopware Store API, etc.) and returns normalised responses.

| Problem                               | Solution                                 |
| ------------------------------------- | ---------------------------------------- |
| Every shop has a different API        | One UCP adapter per platform             |
| AI agents need structured, typed data | UCP normalises products, carts, checkout |
| N x M integration hell                | N adapters + 1 UCP contract              |

---

## 2. Features

- **UCP spec compliant** — implements `dev.ucp.shopping.checkout` (version 2026-01-23) with 74 automated compliance checks
- **Adapter system** — plug in any e-commerce platform via the `PlatformAdapter` interface
- **3 built-in adapters** — Magento 2.x (REST), Shopware 6.x (Store API), MockAdapter (dev/CI)
- **Full checkout flow** — discovery, product search, session create/update/complete/cancel
- **Multi-tenant** — route requests to different shops by `Host` header, Redis-cached tenant resolution
- **Payment instruments** — spec-compliant `instruments[]` model with handler_id routing
- **Escalation flow** — `requires_escalation` + `continue_url` for 3DS, CAPTCHA, manual review
- **Structured errors** — UCP `messages[]` format with type, code, content, severity
- **Schema-first** — Zod validation at every boundary
- **Type-safe** — strict TypeScript 5, NodeNext modules, immutable data patterns

---

## 3. Architecture

```
AI Agent / MCP Host
        │ UCP REST API (/.well-known/ucp, /checkout-sessions, ...)
        ▼
┌─────────────────────────────────────────────────┐
│              apps/server  (Fastify)              │
│  Tenant Resolution → UCP-Agent Auth → Routes    │
│                                                  │
│  ┌────────────────────────────────────────────┐ │
│  │         packages/core  (UCP Engine)        │ │
│  │  Types, SessionStore, AdapterRegistry      │ │
│  └──────────────────┬─────────────────────────┘ │
│                     │                            │
│  ┌──────────────────▼─────────────────────────┐ │
│  │     packages/adapters  (Platform Bridges)  │ │
│  │  MagentoAdapter │ ShopwareAdapter │ Mock   │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
     │ Postgres (Drizzle)    │ Redis (sessions)
```

**Monorepo layout:**

```
ucp-gateway/
├── apps/server/           # Fastify HTTP server
├── packages/core/         # UCP types, session store, adapter interface
├── packages/adapters/     # Magento, Shopware, Mock adapters
├── platforms/             # Docker Compose for local Magento + Shopware
├── scripts/               # UCP compliance validator
└── docker-compose.dev.yml # Postgres + Redis for local dev
```

---

## 4. Quick Start

**Prerequisites:** Node.js >= 22, Docker

```bash
# 1. Clone
git clone git@github.com:GetMomentumToday/ucp-gateway.git
cd ucp-gateway

# 2. Install
npm install

# 3. Start Postgres + Redis
docker compose -f docker-compose.dev.yml up -d

# 4. Configure
cp .env.example .env

# 5. Create DB tables and seed a tenant
PGPASSWORD=ucp psql -h localhost -p 5433 -U ucp -d ucp -c "
  CREATE TABLE IF NOT EXISTS tenants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug VARCHAR(255) UNIQUE NOT NULL,
    domain VARCHAR(255) UNIQUE NOT NULL,
    platform VARCHAR(100) NOT NULL,
    adapter_config JSONB NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  INSERT INTO tenants (slug, domain, platform, adapter_config)
  VALUES ('mock', 'localhost:3000', 'mock', '{}')
  ON CONFLICT (domain) DO NOTHING;
"

# 6. Start dev server
npm run dev

# 7. Test it
curl http://localhost:3000/.well-known/ucp | jq
curl -H "UCP-Agent: my-agent/1.0" 'http://localhost:3000/ucp/products?q=shoes' | jq
```

---

## 5. Configuration

| Variable       | Description                           | Default                                   |
| -------------- | ------------------------------------- | ----------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string          | `postgresql://ucp:ucp@localhost:5433/ucp` |
| `REDIS_URL`    | Redis connection string               | `redis://localhost:6380`                  |
| `PORT`         | HTTP server port                      | `3000`                                    |
| `SECRET_KEY`   | Signing secret (>= 32 chars)          | —                                         |
| `NODE_ENV`     | `development` / `production` / `test` | `development`                             |
| `LOG_LEVEL`    | Pino log level                        | `info`                                    |

---

## 6. Adapters

Adapters implement the `PlatformAdapter` interface from `@ucp-gateway/core`:

```typescript
interface PlatformAdapter {
  readonly name: string;
  getProfile(): Promise<UCPProfile>;
  searchProducts(query: SearchQuery): Promise<readonly Product[]>;
  getProduct(id: string): Promise<Product>;
  createCart(): Promise<Cart>;
  addToCart(cartId: string, items: readonly LineItem[]): Promise<Cart>;
  calculateTotals(cartId: string, ctx: CheckoutContext): Promise<readonly Total[]>;
  placeOrder(cartId: string, payment: PaymentToken): Promise<Order>;
  getOrder(id: string): Promise<Order>;
}
```

**Built-in adapters:**

| Adapter          | Status   | Catalog              | Cart           | Checkout                |
| ---------------- | -------- | -------------------- | -------------- | ----------------------- |
| **MockAdapter**  | Complete | Search, get          | Create, add    | Totals, place order     |
| **Magento 2.x**  | Complete | REST API search/get  | Guest cart     | Shipping, totals, order |
| **Shopware 6.x** | Complete | Store API search/get | Store API cart | Context, totals, order  |
| Shopify          | Planned  | —                    | —              | —                       |

---

## 7. API Reference

### UCP Endpoints (spec-compliant)

| Method | Path                               | Description                     | Auth      |
| ------ | ---------------------------------- | ------------------------------- | --------- |
| `GET`  | `/.well-known/ucp`                 | Business profile discovery      | Public    |
| `POST` | `/checkout-sessions`               | Create checkout session         | UCP-Agent |
| `GET`  | `/checkout-sessions/{id}`          | Get checkout session            | UCP-Agent |
| `PUT`  | `/checkout-sessions/{id}`          | Update checkout (full replace)  | UCP-Agent |
| `POST` | `/checkout-sessions/{id}/complete` | Complete checkout (place order) | UCP-Agent |
| `POST` | `/checkout-sessions/{id}/cancel`   | Cancel checkout                 | UCP-Agent |

### Middleware Endpoints (non-spec)

| Method | Path                  | Description     | Auth      |
| ------ | --------------------- | --------------- | --------- |
| `GET`  | `/health`             | Liveness check  | Public    |
| `GET`  | `/ready`              | Readiness check | Public    |
| `GET`  | `/ucp/products?q=...` | Product search  | UCP-Agent |
| `GET`  | `/ucp/products/{id}`  | Product detail  | UCP-Agent |

### Required Headers

| Header            | Format                                              | Required                      |
| ----------------- | --------------------------------------------------- | ----------------------------- |
| `UCP-Agent`       | `profile="https://..."` (RFC 8941) or simple string | Yes (except public endpoints) |
| `Idempotency-Key` | Any unique string                                   | Recommended for mutations     |
| `Request-Id`      | Any string                                          | Recommended for tracing       |

---

## 8. UCP Spec Compliance

This gateway targets **UCP version 2026-01-23**.

```bash
# Run 74 automated compliance checks
npm run validate:ucp
```

See [UCP_SPEC.md](UCP_SPEC.md) for all specification links.

**Coverage:** endpoints, profile structure, session schema, state machine, continue_url, error format, content-type, headers, HTTP methods, amounts.

---

## 9. Development

```bash
npm run build          # Build all packages
npm test               # Run all tests (20 unit + integration)
npm run test:live      # Run against real Magento (requires platforms running)
npm run lint           # ESLint
npm run format:check   # Prettier check
npm run typecheck      # TypeScript check
npm run validate:ucp   # UCP spec compliance (74 checks)
```

### Local Platform Testing

```bash
# Start Magento 2 + Shopware 6
docker compose -f platforms/docker-compose.platforms.yml up -d

# Seed sample products
bash platforms/magento/setup-products.sh
bash platforms/shopware/setup-products.sh

# Run full demo
bash platforms/demo-curl.sh
```

See [platforms/README.md](platforms/README.md) for details.

---

## 10. Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

- Bug reports: [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md)
- New adapters: [Adapter Request template](.github/ISSUE_TEMPLATE/adapter_request.md)
- Features: [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md)

All contributors must sign the [CLA](CLA.md).

---

## 11. License

UCP Gateway is licensed under the [Business Source License 1.1](LICENSE).

- **Change Date:** Four years from each release
- **Change License:** Apache 2.0
- **Additional Use Grant:** Non-production, evaluation, and development use is free.

For commercial production use, contact [Momentum Group s. r. o.](https://getmomentum.today).
