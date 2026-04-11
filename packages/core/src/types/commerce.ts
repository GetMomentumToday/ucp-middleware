/**
 * Normalised commerce domain types shared across all adapters.
 * All monetary values are integers in the smallest currency unit (cents).
 * All types are immutable.
 *
 * Types that match UCP spec use z.infer<typeof Schema> from @omnixhq/ucp-js-sdk.
 * Gateway-internal types (Product, Cart, LineItem, etc.) stay local.
 */

import type { z } from 'zod';
import type {
  PostalAddressSchema,
  BuyerSchema,
  TotalSchema,
  LinkSchema,
  MessageError as SdkMessageError,
  MessageWarning as SdkMessageWarning,
  MessageInfo as SdkMessageInfo,
  ServiceResponse,
  CapabilityResponse,
  ProductSchema,
  VariantSchema,
  CartSchema,
  CartCreateRequestSchema,
  CartUpdateRequestSchema,
  SearchFiltersSchema,
  UcpResponseCatalogSchema,
  UcpResponseCartSchema,
  OrderSchema,
  OrderLineItemSchema,
  OrderLineItemStatusEnumSchema,
  AdjustmentSchema,
  ExpectationSchema,
  FulfillmentEventSchema,
  FulfillmentExtensionFulfillmentSchema,
  FulfillmentExtensionFulfillmentMethodSchema,
  FulfillmentExtensionFulfillmentGroupSchema,
  FulfillmentExtensionFulfillmentOptionSchema,
  FulfillmentDestinationSchema,
} from '@omnixhq/ucp-js-sdk';

/* ---------------------------------------------------------------------------
 * SDK-derived types — single source of truth from @omnixhq/ucp-js-sdk
 * ------------------------------------------------------------------------- */

export type PostalAddress = z.infer<typeof PostalAddressSchema>;

export type Buyer = z.infer<typeof BuyerSchema>;

export type Total = z.infer<typeof TotalSchema>;

export type TotalType = Total['type'];

export type CheckoutLink = z.infer<typeof LinkSchema>;

export type UCPMessage = SdkMessageError | SdkMessageWarning | SdkMessageInfo;

/* ---------------------------------------------------------------------------
 * Discovery profile — aligned with UCP spec using SDK response types
 *
 * Uses ServiceResponse and CapabilityResponse from the SDK which include
 * transport/endpoint and extends fields respectively. The hand-authored
 * UcpDiscoveryProfileSchema in the SDK uses the base UcpEntity which is
 * too strict, so we define our own profile type using the correct subtypes.
 * ------------------------------------------------------------------------- */

export interface UCPProfile {
  readonly ucp: {
    readonly version: string;
    readonly services?: Readonly<Record<string, readonly ServiceResponse[]>>;
    readonly capabilities?: Readonly<Record<string, readonly CapabilityResponse[]>>;
    readonly payment_handlers?: Readonly<Record<string, readonly Record<string, unknown>[]>>;
  };
  readonly signing_keys: readonly JsonWebKey[];
}

export interface JsonWebKey {
  readonly kty: string;
  readonly kid: string;
  readonly [key: string]: unknown;
}

/**
 * Simplified payment handler returned by adapters.
 * Enriched to full UCP PaymentHandler in the response builder.
 */
export interface PaymentHandler {
  readonly id: string;
  readonly name: string;
  readonly type: 'offline' | 'redirect' | 'card' | 'wallet' | 'other';
}

/* ---------------------------------------------------------------------------
 * SDK-derived catalog/cart types
 * ------------------------------------------------------------------------- */

export type SdkProduct = z.infer<typeof ProductSchema>;

export type SdkVariant = z.infer<typeof VariantSchema>;

export type SdkCart = z.infer<typeof CartSchema>;

export type SdkCartCreateRequest = z.infer<typeof CartCreateRequestSchema>;

export type SdkCartUpdateRequest = z.infer<typeof CartUpdateRequestSchema>;

export type SdkSearchFilters = z.infer<typeof SearchFiltersSchema>;

export type SdkCatalogResponse = z.infer<typeof UcpResponseCatalogSchema>;

export type SdkCartResponse = z.infer<typeof UcpResponseCartSchema>;

/* ---------------------------------------------------------------------------
 * SDK-derived order types — inferred from SDK schemas
 * ------------------------------------------------------------------------- */

export type SdkOrder = z.infer<typeof OrderSchema>;

export type OrderLineItemStatus = z.infer<typeof OrderLineItemStatusEnumSchema>;

export type OrderLineItem = z.infer<typeof OrderLineItemSchema>;

export type OrderAdjustment = z.infer<typeof AdjustmentSchema>;

export type OrderFulfillmentExpectation = z.infer<typeof ExpectationSchema>;

export type OrderFulfillmentEvent = z.infer<typeof FulfillmentEventSchema>;

/* ---------------------------------------------------------------------------
 * SDK-derived fulfillment extension types (checkout flow)
 * ------------------------------------------------------------------------- */

export type FulfillmentDestination = z.infer<typeof FulfillmentDestinationSchema>;

export type FulfillmentOption = z.infer<typeof FulfillmentExtensionFulfillmentOptionSchema>;

export type FulfillmentGroup = z.infer<typeof FulfillmentExtensionFulfillmentGroupSchema>;

export type FulfillmentMethod = z.infer<typeof FulfillmentExtensionFulfillmentMethodSchema>;

export type Fulfillment = z.infer<typeof FulfillmentExtensionFulfillmentSchema>;

export interface EmbeddedCheckoutConfig {
  readonly url: string;
  readonly type?: 'iframe' | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

/* ---------------------------------------------------------------------------
 * UCPOrder — SDK Order + gateway-only created_at field
 * ------------------------------------------------------------------------- */

export type UCPOrder = SdkOrder & { readonly created_at: string };

/** @deprecated Use UCPOrder instead */
export type OrderConfirmation = UCPOrder;

/* ---------------------------------------------------------------------------
 * OrderFulfillment — object shape used in order responses
 * ------------------------------------------------------------------------- */

export interface OrderFulfillment {
  readonly expectations: readonly OrderFulfillmentExpectation[];
  readonly events: readonly OrderFulfillmentEvent[];
}

/* ---------------------------------------------------------------------------
 * Gateway-internal types — adapter contract (flat, simple)
 * ------------------------------------------------------------------------- */

export interface ProductRating {
  readonly value: number;
  readonly scale_max: number;
  readonly count: number;
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
  readonly categories: readonly string[];
  readonly rating?: ProductRating | undefined;
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
  readonly shipping_address: PostalAddress;
  readonly billing_address?: PostalAddress | undefined;
  readonly selected_shipping_method?: string | undefined;
}

export interface PlaceOrderContext {
  readonly shipping_address?: PostalAddress | undefined;
  readonly billing_address?: PostalAddress | undefined;
  readonly buyer_email?: string | undefined;
  readonly selected_shipping_method?: string | undefined;
}

export interface PaymentToken {
  readonly token: string;
  readonly provider: string;
}

export type PlatformOrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'canceled';

export interface PlatformOrder {
  readonly id: string;
  readonly status: PlatformOrderStatus;
  readonly total_cents: number;
  readonly currency: string;
  readonly created_at_iso: string;
}

/** @deprecated Use PlatformOrder instead */
export type Order = PlatformOrder;

/* ---------------------------------------------------------------------------
 * Order update types — for order lifecycle (shipped/refunded/etc.)
 * ------------------------------------------------------------------------- */

export interface OrderFulfillmentEventInput {
  readonly type: string;
  readonly line_items: readonly { readonly id: string; readonly quantity: number }[];
  readonly tracking_number?: string | undefined;
  readonly tracking_url?: string | undefined;
  readonly carrier?: string | undefined;
  readonly description?: string | undefined;
}

export interface OrderAdjustmentInput {
  readonly type: string;
  readonly status: 'pending' | 'completed' | 'failed';
  readonly line_items?: readonly { readonly id: string; readonly quantity: number }[] | undefined;
  readonly amount?: number | undefined;
  readonly description?: string | undefined;
}

export interface OrderUpdateInput {
  readonly fulfillment_event?: OrderFulfillmentEventInput | undefined;
  readonly adjustment?: OrderAdjustmentInput | undefined;
}

export interface PlatformOrderDetails extends PlatformOrder {
  readonly line_items: ReadonlyArray<LineItem & { readonly _fulfilled?: number }>;
  readonly fulfillment_events: readonly OrderFulfillmentEvent[];
  readonly fulfillment_expectations: readonly OrderFulfillmentExpectation[];
  readonly adjustments: readonly OrderAdjustment[];
}

/* ---------------------------------------------------------------------------
 * Identity linking types (gateway-internal, not in SDK)
 * ------------------------------------------------------------------------- */

export interface IdentityLinkingMechanism {
  readonly type: 'oauth2';
  readonly issuer: string;
  readonly client_id: string;
  readonly scopes: readonly string[];
}

export interface IdentityLinkingConfig {
  readonly mechanisms: readonly IdentityLinkingMechanism[];
}

/* ---------------------------------------------------------------------------
 * AP2 Mandate types (autonomous agent payments)
 * ------------------------------------------------------------------------- */

export interface Ap2Mandate {
  readonly mandate: string;
  readonly agent_key?: JsonWebKey | undefined;
  readonly scope?: Readonly<Record<string, unknown>> | undefined;
}

export type MerchantAuthorization = string;

/* ---------------------------------------------------------------------------
 * Business-side profile types
 * ------------------------------------------------------------------------- */

export interface UCPBusinessProfile {
  readonly ucp: {
    readonly version: string;
    readonly services: Readonly<
      Record<string, readonly { readonly version: string; readonly transport: string }[]>
    >;
    readonly capabilities?: Readonly<Record<string, readonly { readonly version: string }[]>>;
    readonly payment_handlers: Readonly<Record<string, readonly Record<string, unknown>[]>>;
  };
}
