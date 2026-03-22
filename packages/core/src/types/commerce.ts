/**
 * Normalised commerce domain types shared across all adapters.
 * These are the canonical shapes used by the UCP engine.
 */

export interface Product {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly description: string | null;
  readonly price: number;
  readonly currency: string;
  readonly inStock: boolean;
  readonly images: readonly string[];
  readonly attributes: Readonly<Record<string, string>>;
}

export interface ProductQuery {
  readonly search?: string;
  readonly page?: number;
  readonly limit?: number;
  readonly categoryId?: string;
}

export interface CartItem {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly currency: string;
}

export interface Cart {
  readonly id: string;
  readonly items: readonly CartItem[];
  readonly subtotal: number;
  readonly currency: string;
}

export interface OrderPayload {
  readonly cartId: string;
  readonly customerEmail: string;
  readonly shippingAddress: Address;
  readonly billingAddress: Address;
}

export interface Address {
  readonly firstName: string;
  readonly lastName: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly postalCode: string;
  readonly country: string;
}

export interface Order {
  readonly id: string;
  readonly status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  readonly total: number;
  readonly currency: string;
  readonly createdAt: string;
}
