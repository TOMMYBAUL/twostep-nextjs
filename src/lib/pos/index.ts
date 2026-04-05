import type { IPOSAdapter } from "./types";
import { squareAdapter } from "./square";
import { shopifyAdapter } from "./shopify";
import { lightspeedAdapter } from "./lightspeed";
import { zettleAdapter } from "./zettle";
import { clictillAdapter } from "./clictill";
import { fastmagAdapter } from "./fastmag";

export const POS_PROVIDERS = ["square", "shopify", "lightspeed", "zettle", "clictill", "fastmag"] as const;
export type POSProvider = (typeof POS_PROVIDERS)[number];

const adapters: Record<POSProvider, IPOSAdapter> = {
    square: squareAdapter,
    shopify: shopifyAdapter,
    lightspeed: lightspeedAdapter,
    zettle: zettleAdapter,
    clictill: clictillAdapter,
    fastmag: fastmagAdapter,
};

export function getAdapter(provider: string): IPOSAdapter {
    const adapter = adapters[provider as POSProvider];
    if (!adapter) throw new Error(`Unknown POS provider: ${provider}`);
    return adapter;
}

export { type IPOSAdapter, type POSAdapterOptions, type POSProduct, type POSStockUpdate, type POSPromo } from "./types";
