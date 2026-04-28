/**
 * TEMPORARY debug route — bypass admin auth via shared secret header.
 *
 * Used to validate CLIP V1 E2E pipeline without needing a browser session
 * on the preview deploy (cookie domain mismatch, login flow flaky).
 *
 * SECURITY :
 * - Disabled hard in production (`VERCEL_ENV === "production"` returns 404)
 * - Requires `X-Debug-Secret` header == `CLIP_DEBUG_SECRET` env (Sensitive)
 * - To be REMOVED post-merge with the rest of the debug scaffolding.
 */

import { NextRequest, NextResponse } from "next/server";

import { embedAndStoreProduct } from "@/lib/enrichment/clip-pipeline";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest): Promise<NextResponse> {
    if (process.env.VERCEL_ENV === "production") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const expected = process.env.CLIP_DEBUG_SECRET;
    const provided = req.headers.get("x-debug-secret");
    if (!expected || !provided || provided !== expected) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    let body: { productId?: string };
    try {
        body = (await req.json()) as { productId?: string };
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const productId = body.productId;
    if (typeof productId !== "string" || !UUID_REGEX.test(productId)) {
        return NextResponse.json({ error: "invalid_product_id" }, { status: 400 });
    }

    const outcome = await embedAndStoreProduct(productId);

    if (outcome.status === "failed") {
        return NextResponse.json(
            { status: outcome.status, error: outcome.error },
            { status: 500 },
        );
    }

    return NextResponse.json(outcome);
}
