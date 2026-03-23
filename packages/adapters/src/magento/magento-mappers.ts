import type { Product } from '@ucp-middleware/core';
import type { MagentoProduct } from './magento-types.js';
import { dollarsToCents } from '../shared/price.js';

export function mapMagentoProduct(item: MagentoProduct, storeUrl: string): Product {
  const description = getCustomAttribute(item, 'description')
    ?? getCustomAttribute(item, 'short_description');
  const stockItem = item.extension_attributes?.stock_item;
  const images = extractProductImages(item, storeUrl);

  return {
    id: item.sku,
    title: item.name,
    description: description ?? null,
    price_cents: dollarsToCents(item.price),
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

function extractProductImages(item: MagentoProduct, storeUrl: string): readonly string[] {
  return (item.media_gallery_entries ?? [])
    .filter((e) => e.media_type === 'image')
    .map((e) => `${storeUrl}/pub/media/catalog/product${e.file}`);
}
