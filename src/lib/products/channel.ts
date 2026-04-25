export type ProductChannel = "online" | "in_store" | "multi";

export function resolveChannel(merchant: { has_online_store: boolean }): ProductChannel {
    return merchant.has_online_store ? "multi" : "in_store";
}

export function splitProductIds(
    baseId: string,
    channel: ProductChannel,
): { online?: string; in_store?: string } {
    if (channel === "multi") {
        return { online: `${baseId}-online`, in_store: `${baseId}-instore` };
    }
    if (channel === "online") {
        return { online: baseId };
    }
    return { in_store: baseId };
}
