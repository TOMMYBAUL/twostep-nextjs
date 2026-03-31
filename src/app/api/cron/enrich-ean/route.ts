import { NextRequest, NextResponse } from "next/server";
import { selectProductsToEnrich } from "@/lib/ean/enrich";
import { lookupEan } from "@/lib/ean/lookup";
import { captureError } from "@/lib/error";

export async function POST(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const products = await selectProductsToEnrich(undefined, 50);

    let enriched = 0;
    let failed = 0;

    for (const product of products) {
        try {
            const success = await lookupEan(product.ean, product.id);
            if (success) enriched++;
            else failed++;
        } catch (err) {
            failed++;
            captureError(err, { productId: product.id, ean: product.ean, cron: "enrich-ean" });
        }
    }

    return NextResponse.json({ enriched, failed, total: products.length });
}
