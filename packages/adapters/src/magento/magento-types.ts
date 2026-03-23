export interface MagentoStoreConfig {
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

export interface MagentoProduct {
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

export interface MagentoSearchResult {
  readonly items: readonly MagentoProduct[];
  readonly total_count: number;
}

export interface MagentoAdapterConfig {
  readonly storeUrl: string;
  readonly apiKey: string;
}
