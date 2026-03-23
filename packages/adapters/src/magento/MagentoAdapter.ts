import type {
  PlatformAdapter,
  UCPProfile,
  SearchQuery,
  Product,
  Cart,
  LineItem,
  CheckoutContext,
  Totals,
  PaymentToken,
  Order,
} from '@ucp-middleware/core';
import { AdapterError, notFound } from '@ucp-middleware/core';

// ── Types for Magento REST API responses ─────────────────────────────────

interface MagentoStoreConfig {
  readonly id: number;
  readonly code: string;
  readonly website_id: number;
  readonly locale: string;
  readonly base_currency_code: string;
  readonly default_display_currency_code: string;
  readonly timezone: string;
  readonly weight_unit: string;
  readonly base_url: string;
  readonly base_link_url: string;
  readonly secure_base_url: string;
  readonly secure_base_link_url: string;
}

interface MagentoProduct {
  readonly id: number;
  readonly sku: string;
  readonly name: string;
  readonly price: number;
  readonly status: number;
  readonly visibility: number;
  readonly type_id: string;
  readonly weight: number;
  readonly extension_attributes: {
    readonly stock_item?: {
      readonly qty: number;
      readonly is_in_stock: boolean;
    };
  };
  readonly custom_attributes?: readonly {
    readonly attribute_code: string;
    readonly value: string;
  }[];
  readonly media_gallery_entries?: readonly {
    readonly id: number;
    readonly media_type: string;
    readonly label: string | null;
    readonly file: string;
    readonly types: readonly string[];
  }[];
}

interface MagentoSearchResult {
  readonly items: readonly MagentoProduct[];
  readonly total_count: number;
}

// ── Config ───────────────────────────────────────────────────────────────

export interface MagentoAdapterConfig {
  readonly storeUrl: string;
  readonly apiKey: string;
}

// ── Adapter ──────────────────────────────────────────────────────────────

export class MagentoAdapter implements PlatformAdapter {
  readonly name = 'magento';
  private readonly config: MagentoAdapterConfig;

  constructor(config: MagentoAdapterConfig) {
    this.config = config;
  }

  async getProfile(): Promise<UCPProfile> {
    const configs = await this.get<MagentoStoreConfig[]>('/rest/V1/store/storeConfigs');
    const store = configs[0];
    const storeName = store ? `Magento Store (${store.code})` : 'Magento Store';

    return {
      ucp: '2026-01-11',
      name: storeName,
      capabilities: [
        { name: 'catalog.search', version: '1.0' },
        { name: 'catalog.product', version: '1.0' },
      ],
      links: [
        { rel: 'catalog', href: '/ucp/products' },
        { rel: 'checkout', href: '/ucp/checkout-sessions' },
      ],
      signing_keys: [],
    };
  }

  async searchProducts(query: SearchQuery): Promise<readonly Product[]> {
    const limit = Math.min(query.limit ?? 20, 100);
    const page = query.page ?? 1;

    const params = new URLSearchParams();
    params.set('searchCriteria[filterGroups][0][filters][0][field]', 'name');
    params.set('searchCriteria[filterGroups][0][filters][0][value]', `%${query.q}%`);
    params.set('searchCriteria[filterGroups][0][filters][0][conditionType]', 'like');
    params.set('searchCriteria[pageSize]', String(limit));
    params.set('searchCriteria[currentPage]', String(page));

    const result = await this.get<MagentoSearchResult>(`/rest/V1/products?${params.toString()}`);

    return result.items.map((item) => mapMagentoProduct(item, this.config.storeUrl));
  }

  async getProduct(id: string): Promise<Product> {
    try {
      const item = await this.get<MagentoProduct>(`/rest/V1/products/${encodeURIComponent(id)}`);
      return mapMagentoProduct(item, this.config.storeUrl);
    } catch (err) {
      if (err instanceof AdapterError && err.statusCode === 404) {
        throw notFound('PRODUCT_NOT_FOUND', id);
      }
      throw err;
    }
  }

  async createCart(): Promise<Cart> {
    throw new AdapterError('PLATFORM_ERROR', 'Not implemented: createCart', 501);
  }

  async addToCart(_cartId: string, _items: readonly LineItem[]): Promise<Cart> {
    throw new AdapterError('PLATFORM_ERROR', 'Not implemented: addToCart', 501);
  }

  async calculateTotals(_cartId: string, _ctx: CheckoutContext): Promise<Totals> {
    throw new AdapterError('PLATFORM_ERROR', 'Not implemented: calculateTotals', 501);
  }

  async placeOrder(_cartId: string, _payment: PaymentToken): Promise<Order> {
    throw new AdapterError('PLATFORM_ERROR', 'Not implemented: placeOrder', 501);
  }

  async getOrder(_id: string): Promise<Order> {
    throw new AdapterError('PLATFORM_ERROR', 'Not implemented: getOrder', 501);
  }

  // ── HTTP helpers ───────────────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    const url = `${this.config.storeUrl}${path}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 404) {
        throw new AdapterError('PRODUCT_NOT_FOUND', `Magento 404: ${body}`, 404);
      }
      throw new AdapterError(
        'PLATFORM_ERROR',
        `Magento API error ${response.status}: ${body}`,
        response.status,
      );
    }

    return (await response.json()) as T;
  }
}

// ── Mappers ──────────────────────────────────────────────────────────────

function mapMagentoProduct(item: MagentoProduct, storeUrl: string): Product {
  const description = getCustomAttribute(item, 'description') ?? getCustomAttribute(item, 'short_description');
  const stockItem = item.extension_attributes?.stock_item;
  const images = (item.media_gallery_entries ?? [])
    .filter((e) => e.media_type === 'image')
    .map((e) => `${storeUrl}/pub/media/catalog/product${e.file}`);

  return {
    id: item.sku,
    title: item.name,
    description: description ?? null,
    price: Math.round(item.price * 100), // float dollars → integer cents
    currency: 'USD',
    in_stock: stockItem?.is_in_stock ?? true,
    stock_quantity: stockItem?.qty ?? 0,
    images,
    variants: [],
  };
}

function getCustomAttribute(item: MagentoProduct, code: string): string | undefined {
  return item.custom_attributes?.find((a) => a.attribute_code === code)?.value;
}
