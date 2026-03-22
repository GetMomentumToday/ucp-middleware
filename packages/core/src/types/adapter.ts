import type { Cart, Order, OrderPayload, Product, ProductQuery } from './commerce.js';

/**
 * The contract every platform adapter must satisfy.
 * Implementations live in @ucp-middleware/adapters.
 */
export interface IShopAdapter {
  /** Human-readable identifier for this adapter, e.g. "magento", "shopify" */
  readonly name: string;

  /** Retrieve a single product by its platform-native ID */
  getProduct(id: string): Promise<Product>;

  /** List/search products */
  listProducts(query: ProductQuery): Promise<readonly Product[]>;

  /** Retrieve a cart by its platform-native ID */
  getCart(cartId: string): Promise<Cart>;

  /** Place an order from an existing cart */
  createOrder(payload: OrderPayload): Promise<Order>;

  /** Retrieve an order by its platform-native ID */
  getOrder(orderId: string): Promise<Order>;
}
