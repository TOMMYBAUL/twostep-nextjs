# Enrichissement EAN automatique — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrichir automatiquement les produits avec EAN via UPCitemdb (plan payant) + OpenEAN, en synchrone pendant le sync POS + cron filet de sécurité.

**Architecture:** Le lookup EAN existant (`src/lib/ean/lookup.ts`) est branché dans le sync engine après l'upsert produit. Un rate limiter protège des limites API. Un cron horaire rattrape les échecs. Les composants consommateur affichent `canonical_name ?? name`.

**Tech Stack:** Next.js, Supabase, UPCitemdb API (plan payant $10/mois), Vitest

**Spec:** `docs/superpowers/specs/2026-03-31-enrichissement-ean-design.md`

---

## File Structure

### Modified files
| File | Responsibility |
|---|---|
| `src/lib/ean/lookup.ts` | Endpoint payant UPCitemdb + retry logic |
| `src/lib/pos/sync-engine.ts` | Appel enrichissement après upsert |
| `src/app/(consumer)/product/[id]/page.tsx` | Select + affichage canonical_name |
| `src/app/(consumer)/product/[id]/product-detail.tsx` | Affichage canonical_name |
| `src/app/(consumer)/favorites/page.tsx` | Affichage canonical_name |
| `src/app/(consumer)/shop/[id]/shop-profile.tsx` | Affichage canonical_name |
| `src/app/api/favorites/route.ts` | Select canonical_name |
| `src/app/api/promotions/route.ts` | Select canonical_name |
| `src/app/api/merchants/[id]/intents/route.ts` | Select canonical_name |
| `src/app/dashboard/stock/page.tsx` | Affichage canonical_name |
| `vercel.json` | Ajout cron enrich-ean |

### New files
| File | Responsibility |
|---|---|
| `src/lib/ean/rate-limiter.ts` | Token bucket rate limiter pour UPCitemdb |
| `src/lib/ean/enrich.ts` | Fonction `enrichNewProducts(merchantId)` |
| `src/app/api/cron/enrich-ean/route.ts` | Cron filet de sécurité horaire |
| `tests/lib/ean/rate-limiter.test.ts` | Tests du rate limiter |
| `tests/lib/ean/enrich.test.ts` | Tests enrichissement |

---

### Task 1: Rate limiter

**Files:**
- Create: `src/lib/ean/rate-limiter.ts`
- Test: `tests/lib/ean/rate-limiter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/ean/rate-limiter.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRateLimiter } from "@/lib/ean/rate-limiter";

describe("Rate limiter", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it("allows requests under the limit", async () => {
        const limiter = createRateLimiter(5, 60_000); // 5 per minute
        for (let i = 0; i < 5; i++) {
            await limiter.acquire(); // should not throw
        }
    });

    it("delays requests over the limit", async () => {
        const limiter = createRateLimiter(2, 60_000); // 2 per minute
        await limiter.acquire();
        await limiter.acquire();
        const promise = limiter.acquire(); // should wait
        vi.advanceTimersByTime(60_000);
        await promise; // resolves after window resets
    });

    it("resets after the time window", async () => {
        const limiter = createRateLimiter(1, 1_000); // 1 per second
        await limiter.acquire();
        vi.advanceTimersByTime(1_001);
        await limiter.acquire(); // should not wait
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx vitest run tests/lib/ean/rate-limiter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/ean/rate-limiter.ts`:

```typescript
type RateLimiter = {
    acquire: () => Promise<void>;
};

export function createRateLimiter(maxRequests: number, windowMs: number): RateLimiter {
    const timestamps: number[] = [];

    async function acquire(): Promise<void> {
        const now = Date.now();
        // Remove expired timestamps
        while (timestamps.length > 0 && timestamps[0] <= now - windowMs) {
            timestamps.shift();
        }

        if (timestamps.length >= maxRequests) {
            const oldestExpiry = timestamps[0] + windowMs;
            const waitMs = oldestExpiry - now;
            if (waitMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, waitMs));
                // Clean again after waiting
                const afterWait = Date.now();
                while (timestamps.length > 0 && timestamps[0] <= afterWait - windowMs) {
                    timestamps.shift();
                }
            }
        }

        timestamps.push(Date.now());
    }

    return { acquire };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx vitest run tests/lib/ean/rate-limiter.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && git add src/lib/ean/rate-limiter.ts tests/lib/ean/rate-limiter.test.ts && git commit -m "feat(ean): add token-bucket rate limiter for UPCitemdb API"
```

---

### Task 2: Upgrade lookup.ts to paid endpoint + retry

**Files:**
- Modify: `src/lib/ean/lookup.ts`
- Modify: `tests/lib/ean/lookup.test.ts`

- [ ] **Step 1: Write the failing test for UPCitemdb paid endpoint**

Add to `tests/lib/ean/lookup.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { parseOpenEanResponse, parseUpcItemDbResponse } from "@/lib/ean/lookup";

describe("EAN lookup", () => {
    it("parses Open EAN Database response", () => {
        const response = {
            name: "Coca-Cola 33cl",
            brand: "Coca-Cola",
            image: "https://example.com/coca.jpg",
        };
        const result = parseOpenEanResponse(response);
        expect(result.name).toBe("Coca-Cola 33cl");
        expect(result.brand).toBe("Coca-Cola");
        expect(result.photo_url).toBe("https://example.com/coca.jpg");
    });

    it("handles missing fields", () => {
        const result = parseOpenEanResponse({ name: "Unknown Product" });
        expect(result.brand).toBeNull();
        expect(result.photo_url).toBeNull();
    });

    it("parses UPCitemdb paid API response", () => {
        const response = {
            items: [{
                title: "New Balance 574 Core Grey",
                brand: "New Balance",
                images: ["https://example.com/nb574.jpg", "https://example.com/nb574-2.jpg"],
                category: "Shoes > Athletic",
            }],
        };
        const result = parseUpcItemDbResponse(response);
        expect(result).not.toBeNull();
        expect(result!.name).toBe("New Balance 574 Core Grey");
        expect(result!.brand).toBe("New Balance");
        expect(result!.photo_url).toBe("https://example.com/nb574.jpg");
        expect(result!.category).toBe("shoes > athletic");
    });

    it("returns null for empty UPCitemdb response", () => {
        const result = parseUpcItemDbResponse({ items: [] });
        expect(result).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx vitest run tests/lib/ean/lookup.test.ts`
Expected: FAIL — `parseUpcItemDbResponse` not exported

- [ ] **Step 3: Rewrite lookup.ts with paid endpoint + retry + rate limiter**

Replace `src/lib/ean/lookup.ts` with:

```typescript
import { createAdminClient } from "@/lib/supabase/admin";
import { createImageJob } from "@/lib/images/jobs";
import { createRateLimiter } from "@/lib/ean/rate-limiter";

type EanResult = {
    name: string;
    brand: string | null;
    photo_url: string | null;
    category: string | null;
    source: string;
};

// Rate limiter: 25 requests/minute (UPCitemdb paid plan)
const upcRateLimiter = createRateLimiter(25, 60_000);

export function parseOpenEanResponse(data: Record<string, unknown>): Omit<EanResult, "source"> {
    return {
        name: String(data.name ?? "Unknown"),
        brand: data.brand ? String(data.brand) : null,
        photo_url: data.image ? String(data.image) : null,
        category: data.category_name ? String(data.category_name).toLowerCase() : null,
    };
}

export function parseUpcItemDbResponse(data: Record<string, unknown>): Omit<EanResult, "source"> | null {
    const items = data.items as Array<Record<string, unknown>> | undefined;
    const item = items?.[0];
    if (!item) return null;
    return {
        name: item.title ? String(item.title) : "Unknown",
        brand: item.brand ? String(item.brand) : null,
        photo_url: Array.isArray(item.images) && item.images.length > 0 ? String(item.images[0]) : null,
        category: item.category ? String(item.category).toLowerCase() : null,
    };
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 1): Promise<Response | null> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5_000);
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeout);
            if (res.status === 429) return null; // Rate limited — let cron retry
            if (res.ok) return res;
        } catch {
            if (attempt === retries) return null;
        }
    }
    return null;
}

async function fetchFromUpcDatabase(ean: string): Promise<EanResult | null> {
    const apiKey = process.env.UPCITEMDB_API_KEY;
    if (!apiKey) return null;

    await upcRateLimiter.acquire();

    const res = await fetchWithRetry(
        `https://api.upcitemdb.com/prod/v1/lookup?upc=${ean}`,
        { headers: { "user_key": apiKey, "Accept": "application/json" } },
    );
    if (!res) return null;

    const data = await res.json();
    const parsed = parseUpcItemDbResponse(data);
    if (!parsed) return null;
    return { ...parsed, source: "upc_database" };
}

async function fetchFromOpenEan(ean: string): Promise<EanResult | null> {
    const res = await fetchWithRetry(
        `https://openean.fdcc.info/EANOpenSearch?ean=${ean}&format=json`,
        {},
    );
    if (!res) return null;

    const data = await res.json();
    if (!data?.name) return null;
    return { ...parseOpenEanResponse(data), source: "open_ean" };
}

/**
 * Lookup EAN in cache, then external APIs.
 * Updates product and ean_lookups cache.
 */
export async function lookupEan(ean: string, productId: string): Promise<boolean> {
    const supabase = createAdminClient();

    // Check cache first
    const { data: cached } = await supabase
        .from("ean_lookups")
        .select("*")
        .eq("ean", ean)
        .single();

    if (cached) {
        await applyEnrichment(supabase, productId, cached);
        return true;
    }

    // Try external APIs: UPCitemdb first (better coverage), then OpenEAN
    const result = await fetchFromUpcDatabase(ean) ?? await fetchFromOpenEan(ean);
    if (!result) return false;

    // Cache the result
    await supabase.from("ean_lookups").upsert({
        ean,
        name: result.name,
        brand: result.brand,
        photo_url: result.photo_url,
        category: result.category,
        source: result.source,
        fetched_at: new Date().toISOString(),
    });

    await applyEnrichment(supabase, productId, result);
    return true;
}

async function applyEnrichment(
    supabase: ReturnType<typeof createAdminClient>,
    productId: string,
    data: { name?: string | null; brand?: string | null; photo_url?: string | null; category?: string | null },
): Promise<void> {
    const updateData: Record<string, unknown> = {};

    if (data.brand) updateData.brand = data.brand;
    if (data.category) updateData.category = data.category;
    if (data.name && data.name !== "Unknown") updateData.canonical_name = data.name;
    if (data.photo_url) updateData.photo_url = data.photo_url;

    if (Object.keys(updateData).length > 0) {
        await supabase.from("products").update(updateData).eq("id", productId);
    }

    if (data.photo_url) {
        const { data: prod } = await supabase.from("products").select("merchant_id, photo_processed_url").eq("id", productId).single();
        if (prod && !prod.photo_processed_url) {
            await createImageJob(productId, prod.merchant_id, data.photo_url);
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx vitest run tests/lib/ean/lookup.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && git add src/lib/ean/lookup.ts tests/lib/ean/lookup.test.ts && git commit -m "feat(ean): upgrade to UPCitemdb paid endpoint with rate limiter and retry"
```

---

### Task 3: Create enrichNewProducts function

**Files:**
- Create: `src/lib/ean/enrich.ts`
- Test: `tests/lib/ean/enrich.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/ean/enrich.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { selectProductsToEnrich } from "@/lib/ean/enrich";

// Mock admin client
vi.mock("@/lib/supabase/admin", () => {
    const mockProducts = [
        { id: "p1", ean: "3614272049529" },
        { id: "p2", ean: "0194956623215" },
    ];
    return {
        createAdminClient: vi.fn(() => ({
            from: vi.fn((table: string) => {
                if (table === "products") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                not: vi.fn().mockReturnValue({
                                    is: vi.fn().mockReturnValue({
                                        data: mockProducts,
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                return { select: vi.fn().mockReturnThis() };
            }),
        })),
    };
});

describe("enrichNewProducts", () => {
    it("selectProductsToEnrich returns products with EAN but no canonical_name", async () => {
        const products = await selectProductsToEnrich("merchant-123");
        expect(products).toHaveLength(2);
        expect(products[0].ean).toBe("3614272049529");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx vitest run tests/lib/ean/enrich.test.ts`
Expected: FAIL — `selectProductsToEnrich` not found

- [ ] **Step 3: Write implementation**

Create `src/lib/ean/enrich.ts`:

```typescript
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupEan } from "@/lib/ean/lookup";
import { captureError } from "@/lib/error";

type ProductToEnrich = { id: string; ean: string };

/**
 * Select products with EAN that haven't been enriched yet.
 */
export async function selectProductsToEnrich(
    merchantId?: string,
    limit?: number,
): Promise<ProductToEnrich[]> {
    const supabase = createAdminClient();

    let query = supabase
        .from("products")
        .select("id, ean")
        .not("ean", "is", null)
        .is("canonical_name", null);

    if (merchantId) {
        query = query.eq("merchant_id", merchantId);
    }

    if (limit) {
        query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data.filter((p): p is ProductToEnrich => p.ean !== null);
}

/**
 * Enrich all non-enriched products for a merchant.
 * Called synchronously during POS sync.
 */
export async function enrichNewProducts(merchantId: string): Promise<{ enriched: number; failed: number }> {
    const products = await selectProductsToEnrich(merchantId);

    let enriched = 0;
    let failed = 0;

    for (const product of products) {
        try {
            const success = await lookupEan(product.ean, product.id);
            if (success) enriched++;
            else failed++;
        } catch (err) {
            failed++;
            captureError(err, { productId: product.id, ean: product.ean, context: "ean-enrich" });
        }
    }

    return { enriched, failed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx vitest run tests/lib/ean/enrich.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && git add src/lib/ean/enrich.ts tests/lib/ean/enrich.test.ts && git commit -m "feat(ean): add enrichNewProducts function for sync-time enrichment"
```

---

### Task 4: Wire enrichment into sync engine

**Files:**
- Modify: `src/lib/pos/sync-engine.ts`

- [ ] **Step 1: Add import and call in sync-engine.ts**

At the top of `src/lib/pos/sync-engine.ts`, add the import:

```typescript
import { enrichNewProducts } from "@/lib/ean/enrich";
```

Then in `syncMerchantPOS`, after the "Promos sync" section and before "Variant grouping by EAN", add:

```typescript
        // ─── EAN enrichment (best-effort) ────────────────────────────

        try {
            const enrichResult = await enrichNewProducts(merchantId);
            result.products_enriched = enrichResult.enriched;
        } catch (err) {
            // Enrichment failure must never break the sync
            captureError(err, { merchantId, context: "ean-enrich-during-sync" });
        }
```

Also add `products_enriched: number;` to the `SyncResult` type:

```typescript
export type SyncResult = {
    products_created: number;
    products_updated: number;
    stock_updated: number;
    promos_imported: number;
    products_enriched: number;
};
```

And initialize it in the result object:

```typescript
        const result: SyncResult = {
            products_created: 0,
            products_updated: 0,
            stock_updated: 0,
            promos_imported: 0,
            products_enriched: 0,
        };
```

- [ ] **Step 2: Run existing tests to verify nothing breaks**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx vitest run`
Expected: All existing tests PASS

- [ ] **Step 3: Commit**

```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && git add src/lib/pos/sync-engine.ts && git commit -m "feat(ean): wire enrichment into POS sync engine"
```

---

### Task 5: Cron filet de sécurité

**Files:**
- Create: `src/app/api/cron/enrich-ean/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create the cron route**

Create `src/app/api/cron/enrich-ean/route.ts`:

```typescript
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
```

- [ ] **Step 2: Add cron schedule to vercel.json**

In `vercel.json`, add the new cron entry to the `crons` array:

```json
{
    "path": "/api/cron/enrich-ean",
    "schedule": "0 * * * *"
}
```

The full `vercel.json` should now be:

```json
{
  "crons": [
    {
      "path": "/api/images/process",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/cron/sync-sumup",
      "schedule": "*/10 * * * *"
    },
    {
      "path": "/api/cron/enrich-ean",
      "schedule": "0 * * * *"
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && git add src/app/api/cron/enrich-ean/route.ts vercel.json && git commit -m "feat(ean): add hourly cron for enrichment catch-up"
```

---

### Task 6: Affichage canonical_name dans les composants consommateur

**Files:**
- Modify: `src/app/(consumer)/product/[id]/page.tsx`
- Modify: `src/app/(consumer)/product/[id]/product-detail.tsx`
- Modify: `src/app/(consumer)/favorites/page.tsx`
- Modify: `src/app/(consumer)/shop/[id]/shop-profile.tsx`

- [ ] **Step 1: Add canonical_name to product page query**

In `src/app/(consumer)/product/[id]/page.tsx`, update the select to include `canonical_name`:

Change:
```typescript
.select("slug, name, price, photo_url, category, description, ean, merchant_id, merchants(name, city, address, slug)")
```
To:
```typescript
.select("slug, name, canonical_name, price, photo_url, category, description, ean, merchant_id, merchants(name, city, address, slug)")
```

And in `generateMetadata`, use canonical_name:

Where `data.name` is used for the page title, change to `data.canonical_name ?? data.name`.

- [ ] **Step 2: Update product-detail.tsx**

In `src/app/(consumer)/product/[id]/product-detail.tsx`, wherever the product name is displayed, use `product.canonical_name ?? product.name`.

- [ ] **Step 3: Update favorites page**

In `src/app/(consumer)/favorites/page.tsx`:

Update the select query to include `canonical_name` in the products join, and display `product.canonical_name ?? product.name` instead of `product.name` in the UI.

- [ ] **Step 4: Update shop profile**

In `src/app/(consumer)/shop/[id]/shop-profile.tsx`:

Where product names are displayed (product list, grid), use `p.canonical_name ?? p.name`.

- [ ] **Step 5: Run build to verify no type errors**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx next build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && git add src/app/\(consumer\)/product/ src/app/\(consumer\)/favorites/ src/app/\(consumer\)/shop/ && git commit -m "feat(ean): display canonical_name in consumer product views"
```

---

### Task 7: Affichage canonical_name dans les API routes et dashboard

**Files:**
- Modify: `src/app/api/favorites/route.ts`
- Modify: `src/app/api/promotions/route.ts`
- Modify: `src/app/api/merchants/[id]/intents/route.ts`
- Modify: `src/app/dashboard/stock/page.tsx`

- [ ] **Step 1: Update API routes to select canonical_name**

In `src/app/api/favorites/route.ts`, update:
```typescript
.select("*, products(*, stock(quantity), merchants(name, address, city))")
```
This already selects `*` on products, so `canonical_name` is included. No change needed here.

In `src/app/api/promotions/route.ts`, update:
```typescript
.select("*, products(name, price, photo_url, merchant_id)")
```
To:
```typescript
.select("*, products(name, canonical_name, price, photo_url, merchant_id)")
```

In `src/app/api/merchants/[id]/intents/route.ts`, update:
```typescript
.select("id, selected_size, created_at, expires_at, products(name, photo_url, photo_processed_url), consumer_profiles:user_id(display_name)")
```
To:
```typescript
.select("id, selected_size, created_at, expires_at, products(name, canonical_name, photo_url, photo_processed_url), consumer_profiles:user_id(display_name)")
```

- [ ] **Step 2: Update dashboard stock page**

In `src/app/dashboard/stock/page.tsx`, where `product.name` is displayed, use `product.canonical_name ?? product.name`. Also ensure the select query includes `canonical_name`.

- [ ] **Step 3: Run build to verify**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx next build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && git add src/app/api/favorites/ src/app/api/promotions/ src/app/api/merchants/ src/app/dashboard/stock/ && git commit -m "feat(ean): add canonical_name to API routes and dashboard"
```

---

### Task 8: Configuration et variable d'environnement

**Files:**
- Modify: `.env.local` (local)
- Vercel env vars (production)

- [ ] **Step 1: Add UPCITEMDB_API_KEY to local env**

Add to `.env.local`:
```
UPCITEMDB_API_KEY=your_api_key_here
```

- [ ] **Step 2: Add to Vercel env vars**

Run:
```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx vercel env add UPCITEMDB_API_KEY production
```

Enter the API key when prompted.

- [ ] **Step 3: Final full test run**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Final commit if any remaining changes**

```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && git status
```

If there are uncommitted changes, commit them with an appropriate message.
