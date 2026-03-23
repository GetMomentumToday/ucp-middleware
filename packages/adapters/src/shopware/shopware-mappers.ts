import type { Product } from '@ucp-middleware/core';
import type { ShopwareProduct } from './shopware-types.js';
import { grossPriceToCents } from '../shared/price.js';

export function mapShopwareProduct(raw: ShopwareProduct, currency: string): Product {
  return {
    id: raw.id,
    title: extractTitle(raw),
    description: extractDescription(raw),
    price_cents: extractPrice(raw),
    currency,
    in_stock: raw.available ?? false,
    stock_quantity: raw.stock ?? 0,
    images: extractCoverImageUrl(raw.cover),
    variants: [],
  };
}

export function unwrapShopwareProduct(response: unknown): ShopwareProduct {
  const wrapped = response as { product?: ShopwareProduct | undefined };
  return wrapped.product ?? (response as ShopwareProduct);
}

function extractTitle(product: ShopwareProduct): string {
  return product.translated?.name ?? product.name ?? product.productNumber;
}

function extractDescription(product: ShopwareProduct): string | null {
  return product.translated?.description ?? product.description ?? null;
}

function extractCoverImageUrl(cover: ShopwareProduct['cover']): readonly string[] {
  const url = cover?.media?.url;
  return url ? [url] : [];
}

function extractPrice(product: ShopwareProduct): number {
  if (product.calculatedPrice) {
    return grossPriceToCents(product.calculatedPrice.unitPrice);
  }
  const firstPrice = product.price?.[0];
  return firstPrice ? grossPriceToCents(firstPrice.gross) : 0;
}
