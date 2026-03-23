export interface ShopwareConfig {
  readonly storeUrl: string;
  readonly accessKey: string;
}

export interface ShopwarePrice {
  readonly gross: number;
  readonly net: number;
  readonly currencyId: string;
}

export interface ShopwareCalculatedPrice {
  readonly unitPrice: number;
  readonly totalPrice: number;
}

export interface ShopwareCover {
  readonly media?: ShopwareMedia | undefined;
}

export interface ShopwareMedia {
  readonly url?: string | undefined;
}

export interface ShopwareTranslated {
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
}

export interface ShopwareProduct {
  readonly id: string;
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
  readonly productNumber: string;
  readonly price: readonly ShopwarePrice[] | null;
  readonly calculatedPrice?: ShopwareCalculatedPrice | null | undefined;
  readonly stock?: number | undefined;
  readonly available?: boolean | undefined;
  readonly cover?: ShopwareCover | null | undefined;
  readonly translated?: ShopwareTranslated | undefined;
}

export interface ShopwareProductListResponse {
  readonly elements: readonly ShopwareProduct[];
}

export interface ShopwareContextResponse {
  readonly salesChannel?: ShopwareSalesChannel | undefined;
  readonly currency?: ShopwareCurrency | undefined;
}

export interface ShopwareSalesChannel {
  readonly name?: string | undefined;
  readonly id?: string | undefined;
}

export interface ShopwareCurrency {
  readonly isoCode?: string | undefined;
}
