import type { PublicServicePrice } from "@royal-palace/contracts";

export interface PublicPriceGroup {
  category: string;
  prices: readonly PublicServicePrice[];
}

export function groupPublicPrices(prices: readonly PublicServicePrice[]): PublicPriceGroup[] {
  const groups = new Map<string, PublicServicePrice[]>();
  for (const price of prices) {
    const category = price.service.category.trim() || "Other services";
    const group = groups.get(category) ?? [];
    group.push(price);
    groups.set(category, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, group]) => ({
      category,
      prices: group.sort((left, right) => left.service.name.localeCompare(right.service.name)),
    }));
}
