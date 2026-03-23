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
import { httpGet } from '../shared/http-client.js';
import { mapMagentoProduct } from './magento-mappers.js';
import type {
  MagentoAdapterConfig,
  MagentoStoreConfig,
  MagentoSearchResult,
  MagentoProduct,
} from './magento-types.js';

export type { MagentoAdapterConfig } from './magento-types.js';

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

    const params = buildSearchCriteriaParams(query.q, limit, page);
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

  private async get<T>(path: string): Promise<T> {
    return httpGet<T>(
      {
        baseUrl: this.config.storeUrl,
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Accept': 'application/json',
        },
      },
      path,
    );
  }
}

function buildSearchCriteriaParams(query: string, limit: number, page: number): URLSearchParams {
  const params = new URLSearchParams();
  params.set('searchCriteria[filterGroups][0][filters][0][field]', 'name');
  params.set('searchCriteria[filterGroups][0][filters][0][value]', `%${query}%`);
  params.set('searchCriteria[filterGroups][0][filters][0][conditionType]', 'like');
  params.set('searchCriteria[pageSize]', String(limit));
  params.set('searchCriteria[currentPage]', String(page));
  return params;
}
