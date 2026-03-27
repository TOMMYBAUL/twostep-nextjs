import type { IPOSAdapter } from "./types";
import { squareAdapter } from "./square";
import { shopifyAdapter } from "./shopify";
import { lightspeedAdapter } from "./lightspeed";
import { sumupAdapter } from "./sumup";
import { zettleAdapter } from "./zettle";

export const POS_PROVIDERS = ["square", "shopify", "lightspeed", "sumup", "zettle"] as const;
export type POSProvider = (typeof POS_PROVIDERS)[number];

const adapters: Record<POSProvider, IPOSAdapter> = {
    square: squareAdapter,
    shopify: shopifyAdapter,
    lightspeed: lightspeedAdapter,
    sumup: sumupAdapter,
    zettle: zettleAdapter,
};

export function getAdapter(provider: string): IPOSAdapter {
    const adapter = adapters[provider as POSProvider];
    if (!adapter) throw new Error(`Unknown POS provider: ${provider}`);
    return adapter;
}

export { type IPOSAdapter, type POSProduct, type POSStockUpdate, type POSPromo } from "./types";
