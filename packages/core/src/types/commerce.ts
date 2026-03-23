/**
 * Normalised commerce domain types shared across all adapters.
 * All monetary values are integers in the smallest currency unit (cents).
 * All types are immutable.
 */

export interface UCPProfile {
  readonly ucp: string;
  readonly name: string;
  readonly capabilities: readonly Capability[];
  readonly links: readonly ProfileLink[];
  readonly signing_keys: readonly JsonWebKey[];
}

export interface Capability {
  readonly name: string;
  readonly version: string;
}

export interface ProfileLink {
  readonly rel: string;
  readonly href: string;
}

export interface JsonWebKey {
  readonly kty: string;
  readonly kid: string;
  readonly [key: string]: unknown;
}

export interface Product {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly price_cents: number;
  readonly currency: string;
  readonly in_stock: boolean;
  readonly stock_quantity: number;
  readonly images: readonly string[];
  readonly variants: readonly ProductVariant[];
}

export interface ProductVariant {
  readonly id: string;
  readonly title: string;
  readonly price_cents: number;
  readonly in_stock: boolean;
  readonly attributes: Readonly<Record<string, string>>;
}

export interface SearchQuery {
  readonly q: string;
  readonly category?: string | undefined;
  readonly min_price_cents?: number | undefined;
  readonly max_price_cents?: number | undefined;
  readonly in_stock?: boolean | undefined;
  readonly limit?: number | undefined;
  readonly page?: number | undefined;
}

export interface Cart {
  readonly id: string;
  readonly items: readonly LineItem[];
  readonly currency: string;
}

export interface LineItem {
  readonly product_id: string;
  readonly variant_id?: string;
  readonly title: string;
  readonly quantity: number;
  readonly unit_price_cents: number;
}

export interface CheckoutContext {
  readonly shipping_address: Address;
  readonly billing_address?: Address | undefined;
}

export interface Totals {
  readonly subtotal_cents: number;
  readonly shipping_cents: number;
  readonly tax_cents: number;
  readonly total_cents: number;
  readonly currency: string;
}

export interface Address {
  readonly first_name: string;
  readonly last_name: string;
  readonly line1: string;
  readonly line2?: string | undefined;
  readonly city: string;
  readonly postal_code: string;
  readonly region?: string | undefined;
  readonly country_iso2: string;
}

export interface PaymentToken {
  readonly token: string;
  readonly provider: string;
}

export interface Order {
  readonly id: string;
  readonly status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  readonly total_cents: number;
  readonly currency: string;
  readonly created_at_iso: string;
}
