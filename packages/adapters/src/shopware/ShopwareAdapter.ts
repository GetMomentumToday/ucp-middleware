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
import type {
  ShopwareConfig,
  ShopwareContextResponse,
  ShopwareProduct,
  ShopwareProductListResponse,
} from './shopware-types.js';
import { mapShopwareProduct, unwrapShopwareProduct } from './shopware-mappers.js';

export type { ShopwareConfig } from './shopware-types.js';

const DEFAULT_LIMIT = 20;
const PRODUCT_INCLUDES = [
  'id', 'name', 'description', 'productNumber', 'price',
  'calculatedPrice', 'stock', 'available', 'cover', 'translated',
] as const;

function notImplemented(): never {
  throw new AdapterError('PLATFORM_ERROR', 'Not implemented', 501);
}

export class ShopwareAdapter implements PlatformAdapter {
  readonly name = 'shopware';

  private readonly storeUrl: string;
  private readonly accessKey: string;
  private contextToken: string | undefined;
  private cachedCurrency = 'EUR';

  constructor(config: ShopwareConfig) {
    this.storeUrl = config.storeUrl.replace(/\/+$/, '');
    this.accessKey = config.accessKey;
  }

  async getProfile(): Promise<UCPProfile> {
    const ctx = await this.request<ShopwareContextResponse>('GET', '/store-api/context');
    const channelName = ctx.salesChannel?.name ?? 'Shopware Store';
    this.cachedCurrency = ctx.currency?.isoCode ?? 'EUR';

    return {
      ucp: '2026-01-11',
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
    const page = query.page ?? 1;

    const response = await this.request<ShopwareProductListResponse>(
      'POST',
      '/store-api/product',
      {
        limit,
        page,
        filter: [{ type: 'contains', field: 'name', value: query.q }],
        includes: { product: [...PRODUCT_INCLUDES] },
      },
    );

    const elements = response.elements ?? [];
    return elements.map((raw) => mapShopwareProduct(raw, this.cachedCurrency));
  }

  async getProduct(id: string): Promise<Product> {
    try {
      const response = await this.request<ShopwareProduct>('POST', `/store-api/product/${id}`);
      const product = unwrapShopwareProduct(response);
      return mapShopwareProduct(product, this.cachedCurrency);
    } catch (error: unknown) {
      if (error instanceof AdapterError && error.code === 'PRODUCT_NOT_FOUND') {
        throw notFound('PRODUCT_NOT_FOUND', id);
      }
      throw error;
    }
  }

  async createCart(): Promise<Cart> { return notImplemented(); }
  async addToCart(_cartId: string, _items: readonly LineItem[]): Promise<Cart> { return notImplemented(); }
  async calculateTotals(_cartId: string, _ctx: CheckoutContext): Promise<Totals> { return notImplemented(); }
  async placeOrder(_cartId: string, _payment: PaymentToken): Promise<Order> { return notImplemented(); }
  async getOrder(_id: string): Promise<Order> { return notImplemented(); }

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
}
