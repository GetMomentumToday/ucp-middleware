import type {
  Cart,
  CheckoutContext,
  LineItem,
  Order,
  PaymentToken,
  PlatformAdapter,
  Product,
  SearchQuery,
  Totals,
  UCPProfile,
} from '@ucp-middleware/core';
import { AdapterError, notFound } from '@ucp-middleware/core';

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────

interface ShopwareConfig {
  readonly storeUrl: string;
  readonly accessKey: string;
}

// ──────────────────────────────────────────────
// Shopware API response types (partial)
// ──────────────────────────────────────────────

interface ShopwarePrice {
  readonly gross: number;
  readonly net: number;
  readonly currencyId: string;
}

interface ShopwareCover {
  readonly media?: ShopwareMedia | undefined;
}

interface ShopwareMedia {
  readonly url?: string | undefined;
}

interface ShopwareCalculatedPrice {
  readonly unitPrice: number;
  readonly totalPrice: number;
}

interface ShopwareProduct {
  readonly id: string;
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
  readonly productNumber: string;
  readonly price: readonly ShopwarePrice[] | null;
  readonly calculatedPrice?: ShopwareCalculatedPrice | null | undefined;
  readonly stock?: number | undefined;
  readonly available?: boolean | undefined;
  readonly cover?: ShopwareCover | null | undefined;
  readonly translated?: ShopwareTranslated | undefined;
}

interface ShopwareTranslated {
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
}

interface ShopwareProductListResponse {
  readonly elements: readonly ShopwareProduct[];
}

interface ShopwareContextResponse {
  readonly salesChannel?: ShopwareSalesChannel | undefined;
  readonly currency?: ShopwareCurrency | undefined;
}

interface ShopwareSalesChannel {
  readonly name?: string | undefined;
  readonly id?: string | undefined;
}

interface ShopwareCurrency {
  readonly isoCode?: string | undefined;
}

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const DEFAULT_LIMIT = 20;
const DEFAULT_PAGE = 1;
const CENTS_MULTIPLIER = 100;
const UCP_SPEC_VERSION = '2026-01-11';
const NOT_IMPLEMENTED_STATUS = 501;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function toCents(gross: number): number {
  return Math.round(gross * CENTS_MULTIPLIER);
}

function extractTitle(product: ShopwareProduct): string {
  return product.translated?.name ?? product.name ?? product.productNumber;
}

function extractDescription(product: ShopwareProduct): string | null {
  return product.translated?.description ?? product.description ?? null;
}

function extractImageUrl(cover: ShopwareCover | null | undefined): readonly string[] {
  const url = cover?.media?.url;
  return url ? [url] : [];
}

function extractPrice(product: ShopwareProduct): number {
  // Store API returns calculatedPrice (not price array)
  if (product.calculatedPrice) {
    return toCents(product.calculatedPrice.unitPrice);
  }
  // Fallback to admin-style price array
  const first = product.price?.[0];
  return first ? toCents(first.gross) : 0;
}

function extractCurrency(prices: readonly ShopwarePrice[] | null, fallback: string): string {
  // Shopware prices have currencyId (UUID), not ISO code.
  // We use the fallback from the sales channel context.
  return fallback;
}

function mapProduct(raw: ShopwareProduct, currency: string): Product {
  return {
    id: raw.id,
    title: extractTitle(raw),
    description: extractDescription(raw),
    price: extractPrice(raw),
    currency: extractCurrency(raw.price, currency),
    in_stock: raw.available ?? false,
    stock_quantity: raw.stock ?? 0,
    images: extractImageUrl(raw.cover),
    variants: [],
  };
}

function notImplemented(): never {
  throw new AdapterError('PLATFORM_ERROR', 'Not implemented', NOT_IMPLEMENTED_STATUS);
}

// ──────────────────────────────────────────────
// Adapter
// ──────────────────────────────────────────────

/**
 * Shopware 6 Store API adapter (catalog read-only).
 * Implements getProfile, searchProducts, and getProduct.
 * Cart / checkout / order methods throw "Not implemented".
 */
export class ShopwareAdapter implements PlatformAdapter {
  readonly name = 'shopware';

  private readonly storeUrl: string;
  private readonly accessKey: string;
  private contextToken: string | undefined;
  private cachedCurrency: string = 'EUR';

  constructor(config: ShopwareConfig) {
    this.storeUrl = config.storeUrl.replace(/\/+$/, '');
    this.accessKey = config.accessKey;
  }

  // ── HTTP layer ──────────────────────────────

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'sw-access-key': this.accessKey,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    if (this.contextToken !== undefined) {
      headers['sw-context-token'] = this.contextToken;
    }

    return headers;
  }

  private storeContextToken(response: Response): void {
    const token = response.headers.get('sw-context-token');
    if (token) {
      this.contextToken = token;
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.storeUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: this.buildHeaders(),
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    this.storeContextToken(response);

    if (!response.ok) {
      if (response.status === 404) {
        throw notFound('PRODUCT_NOT_FOUND', path);
      }
      const text = await response.text();
      throw new AdapterError(
        'PLATFORM_ERROR',
        `Shopware API error ${String(response.status)}: ${text}`,
        response.status,
      );
    }

    return (await response.json()) as T;
  }

  // ── PlatformAdapter methods ─────────────────

  async getProfile(): Promise<UCPProfile> {
    const ctx = await this.request<ShopwareContextResponse>('GET', '/store-api/context');

    const channelName = ctx.salesChannel?.name ?? 'Shopware Store';
    this.cachedCurrency = ctx.currency?.isoCode ?? 'EUR';

    return {
      ucp: UCP_SPEC_VERSION,
      name: channelName,
      capabilities: [
        { name: 'catalog.search', version: '1.0' },
        { name: 'catalog.get', version: '1.0' },
      ],
      links: [
        { rel: 'self', href: `${this.storeUrl}/store-api` },
      ],
      signing_keys: [],
    };
  }

  async searchProducts(query: SearchQuery): Promise<readonly Product[]> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, 100);
    const page = query.page ?? DEFAULT_PAGE;

    const body = {
      limit,
      page,
      filter: [
        { type: 'contains', field: 'name', value: query.q },
      ],
      includes: {
        product: [
          'id',
          'name',
          'description',
          'productNumber',
          'price',
          'stock',
          'available',
          'calculatedPrice',
          'cover',
          'translated',
        ],
      },
    };

    const response = await this.request<ShopwareProductListResponse>(
      'POST',
      '/store-api/product',
      body,
    );

    const elements = response.elements ?? [];
    return elements.map((raw) => mapProduct(raw, this.cachedCurrency));
  }

  async getProduct(id: string): Promise<Product> {
    let response: ShopwareProduct;
    try {
      response = await this.request<ShopwareProduct>('POST', `/store-api/product/${id}`);
    } catch (error: unknown) {
      if (error instanceof AdapterError && error.code === 'PRODUCT_NOT_FOUND') {
        throw notFound('PRODUCT_NOT_FOUND', id);
      }
      throw error;
    }

    // Shopware wraps single product in { product: ... } or returns it directly
    // depending on version. Handle the direct case from POST /store-api/product/{id}.
    const raw = (response as unknown as { product?: ShopwareProduct | undefined }).product ?? response;
    return mapProduct(raw, this.cachedCurrency);
  }

  async createCart(): Promise<Cart> {
    return notImplemented();
  }

  async addToCart(_cartId: string, _items: readonly LineItem[]): Promise<Cart> {
    return notImplemented();
  }

  async calculateTotals(_cartId: string, _ctx: CheckoutContext): Promise<Totals> {
    return notImplemented();
  }

  async placeOrder(_cartId: string, _payment: PaymentToken): Promise<Order> {
    return notImplemented();
  }

  async getOrder(_id: string): Promise<Order> {
    return notImplemented();
  }
}
