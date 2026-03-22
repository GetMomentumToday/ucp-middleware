/**
 * @ucp-middleware/core
 *
 * UCP Engine — types, routing, normalisation, and adapter interfaces.
 * This is the contract that all platform adapters must implement.
 */

export type { IShopAdapter } from './types/adapter.js';
export type {
  Product,
  ProductQuery,
  Cart,
  CartItem,
  OrderPayload,
  Order,
} from './types/commerce.js';
