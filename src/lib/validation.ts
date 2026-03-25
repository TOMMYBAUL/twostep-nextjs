import { z } from "zod";
import { NextResponse } from "next/server";

// ── Reusable field schemas ──────────────────────────────────────────

export const geoSchema = z.object({
    lat: z.coerce.number().min(-90).max(90, "lat must be [-90, 90]"),
    lng: z.coerce.number().min(-180).max(180, "lng must be [-180, 180]"),
    radius: z.coerce.number().min(1).max(50).default(10),
});

export const paginationSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ── Route-specific schemas ──────────────────────────────────────────

export const discoverQuery = geoSchema.extend({
    section: z.enum(["promos", "trending", "nearby"]),
    category: z.string().max(100).nullish(),
});

export const searchQuery = geoSchema.extend({
    q: z.string().max(200, "Search query too long (max 200)").default(""),
    radius: z.coerce.number().min(1).max(50).default(5),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const autocompleteQuery = z.object({
    q: z.string().max(200, "Query too long (max 200)").default(""),
});

export const nearbyQuery = geoSchema.extend({
    category: z.string().max(100).nullish(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const feedQuery = geoSchema.extend({
    cursor: z.coerce.number().default(999999),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const favoriteBody = z.object({
    product_id: z.string().uuid("product_id must be a valid UUID"),
});

export const followBody = z.object({
    merchant_id: z.string().uuid("merchant_id must be a valid UUID"),
});

export const productBody = z.object({
    name: z.string().min(1, "name is required").max(300),
    ean: z.string().max(50).nullish(),
    description: z.string().max(5000).nullish(),
    category: z.string().max(100).nullish(),
    price: z.number().min(0, "price must be >= 0").nullish(),
    photo_url: z.string().url().max(2000).nullish(),
    initial_quantity: z.number().int().min(0).nullish(),
});

export const promotionBody = z.object({
    product_id: z.string().uuid("product_id must be a valid UUID"),
    sale_price: z.number().positive("sale_price must be > 0"),
    starts_at: z.string().datetime().optional(),
    ends_at: z.string().datetime().nullish(),
});

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Parse query params from URLSearchParams using a Zod schema.
 * Returns validated data or a 400 NextResponse.
 */
export function parseQuery<T extends z.ZodTypeAny>(
    searchParams: URLSearchParams,
    schema: T,
): { data: z.infer<T> } | { error: NextResponse } {
    const raw: Record<string, string | null> = {};
    const shape = (schema as unknown as z.ZodObject<any>).shape ?? {};
    for (const key of Object.keys(shape)) {
        const value = searchParams.get(key);
        if (value !== null) raw[key] = value;
    }
    const result = schema.safeParse(raw);
    if (!result.success) {
        const message = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        return { error: NextResponse.json({ error: message }, { status: 400 }) };
    }
    return { data: result.data };
}

/**
 * Parse a JSON request body using a Zod schema.
 * Returns validated data or a 400 NextResponse.
 */
export async function parseBody<T extends z.ZodTypeAny>(
    request: Request,
    schema: T,
): Promise<{ data: z.infer<T> } | { error: NextResponse }> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return { error: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) };
    }
    const result = schema.safeParse(body);
    if (!result.success) {
        const message = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        return { error: NextResponse.json({ error: message }, { status: 400 }) };
    }
    return { data: result.data };
}
