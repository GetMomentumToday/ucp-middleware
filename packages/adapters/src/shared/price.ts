const CENTS_PER_DOLLAR = 100;

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * CENTS_PER_DOLLAR);
}

export function grossPriceToCents(grossPrice: number): number {
  return Math.round(grossPrice * CENTS_PER_DOLLAR);
}
