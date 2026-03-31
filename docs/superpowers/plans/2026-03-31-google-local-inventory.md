# Google Local Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push merchant products to Google Free Local Listings via Merchant API, with OAuth onboarding, daily product feed cron, real-time inventory updates, and a dashboard page.

**Architecture:** OAuth flow for Google Merchant Center (same pattern as POS adapters), feed generation from Supabase products, daily cron for product feed + real-time inventory push in sync engine and webhooks. New `google_merchant_connections` table stores tokens.

**Tech Stack:** Next.js, Supabase, Google Merchant API (googleapis), Vitest

**Spec:** `docs/superpowers/specs/2026-03-31-google-local-inventory-design.md`

---

## File Structure

### New files
| File | Responsibility |
|---|---|
| `supabase/migrations/037_google_merchant_connections.sql` | DB table for Google connections |
| `src/lib/google/merchant.ts` | Google Merchant API client (auth, refresh, product submit, inventory submit) |
| `src/lib/google/feed.ts` | Transform Supabase products → Google product format |
| `src/lib/google/inventory.ts` | `pushInventoryToGoogle(merchantId, productIds?)` |
| `src/app/api/google/auth/route.ts` | Initiate Google OAuth |
| `src/app/api/google/callback/route.ts` | OAuth callback, store tokens |
| `src/app/api/google/disconnect/route.ts` | Remove Google connection |
| `src/app/api/cron/google-feed/route.ts` | Daily product feed cron |
| `src/app/dashboard/google/page.tsx` | Dashboard Google page |
| `tests/lib/google/feed.test.ts` | Tests for feed transformation |

### Modified files
| File | Change |
|---|---|
| `src/lib/pos/sync-engine.ts` | Add `pushInventoryToGoogle` call after enrichment |
| `src/app/api/webhooks/square/route.ts` | Add `pushInventoryToGoogle` call |
| `src/app/api/webhooks/shopify/route.ts` | Add `pushInventoryToGoogle` call |
| `src/app/api/webhooks/lightspeed/route.ts` | Add `pushInventoryToGoogle` call |
| `src/app/api/webhooks/zettle/route.ts` | Add `pushInventoryToGoogle` call |
| `src/app/api/cron/sync-sumup/route.ts` | Add `pushInventoryToGoogle` call |
| `src/components/dashboard/sidebar.tsx` | Add "Google" nav item |
| `vercel.json` | Add google-feed cron |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/037_google_merchant_connections.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/037_google_merchant_connections.sql`:

```sql
-- Google Merchant Center connections (one per merchant)
CREATE TABLE google_merchant_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE UNIQUE NOT NULL,
    google_merchant_id text NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_at timestamptz NOT NULL,
    store_code text NOT NULL,
    products_pushed integer DEFAULT 0,
    last_feed_at timestamptz,
    last_feed_status text DEFAULT 'pending'
        CHECK (last_feed_status IN ('pending', 'success', 'error')),
    last_feed_error text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_google_merchant_connections_merchant ON google_merchant_connections(merchant_id);

ALTER TABLE google_merchant_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "merchants_own_google_connection"
    ON google_merchant_connections FOR ALL
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
```

- [ ] **Step 2: Apply migration locally**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx supabase db push`

- [ ] **Step 3: Commit**

```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && git add supabase/migrations/037_google_merchant_connections.sql && git commit -m "feat(google): add google_merchant_connections table"
```

---

### Task 2: Google Merchant API client

**Files:**
- Create: `src/lib/google/merchant.ts`

- [ ] **Step 1: Create the Google Merchant API client**

Create `src/lib/google/merchant.ts`:

```typescript
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/email/encryption";
import { captureError } from "@/lib/error";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const MERCHANT_API_BASE = "https://merchantapi.googleapis.com";

type GoogleTokens = {
    access_token: string;
    refresh_token: string;
    expires_at: string;
};

type GoogleConnection = {
    id: string;
    merchant_id: string;
    google_merchant_id: string;
    access_token: string;
    refresh_token: string;
    expires_at: string;
    store_code: string;
};

// ─── OAuth ──────────────────────────────────────────────────────────

export function getGoogleAuthUrl(merchantId: string): string {
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        response_type: "code",
        scope: "https://www.googleapis.com/auth/content",
        access_type: "offline",
        prompt: "consent",
        state: `google:${merchantId}`,
    });
    return `${GOOGLE_AUTH_URL}?${params}`;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokens> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
            grant_type: "authorization_code",
        }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.error || "Google OAuth failed");

    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
}

// ─── Token management ───────────────────────────────────────────────

export async function refreshGoogleToken(refreshToken: string): Promise<GoogleTokens | null> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            grant_type: "refresh_token",
        }),
    });

    const data = await res.json();
    if (!res.ok) return null;

    return {
        access_token: data.access_token,
        refresh_token: refreshToken, // Google doesn't always return a new refresh token
        expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
}

/**
 * Get a valid access token for a merchant's Google connection.
 * Refreshes automatically if expired.
 * Returns null if no connection or refresh fails.
 */
export async function getGoogleAccessToken(merchantId: string): Promise<{
    accessToken: string;
    connection: GoogleConnection;
} | null> {
    const supabase = createAdminClient();

    const { data: conn } = await supabase
        .from("google_merchant_connections")
        .select("*")
        .eq("merchant_id", merchantId)
        .single();

    if (!conn) return null;

    let accessToken = decrypt(conn.access_token);
    const expiresAt = new Date(conn.expires_at).getTime();
    const fiveMinFromNow = Date.now() + 5 * 60 * 1000;

    if (expiresAt < fiveMinFromNow) {
        const refreshed = await refreshGoogleToken(decrypt(conn.refresh_token));
        if (!refreshed) {
            await supabase
                .from("google_merchant_connections")
                .update({ last_feed_status: "error", last_feed_error: "Token expired" })
                .eq("id", conn.id);
            return null;
        }

        await supabase
            .from("google_merchant_connections")
            .update({
                access_token: encrypt(refreshed.access_token),
                refresh_token: encrypt(refreshed.refresh_token),
                expires_at: refreshed.expires_at,
            })
            .eq("id", conn.id);

        accessToken = refreshed.access_token;
    }

    return { accessToken, connection: conn };
}

// ─── Merchant API helpers ───────────────────────────────────────────

export async function googleMerchantFetch(
    path: string,
    accessToken: string,
    options?: RequestInit,
): Promise<Record<string, unknown>> {
    const res = await fetch(`${MERCHANT_API_BASE}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ...options?.headers,
        },
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as Record<string, unknown>).message as string || `Google API error: ${res.status}`);
    }

    return res.json();
}

/**
 * Get the merchant's Merchant Center account ID from Google.
 */
export async function getGoogleMerchantId(accessToken: string): Promise<string> {
    const data = await googleMerchantFetch(
        "/accounts/v1beta/accounts",
        accessToken,
    );
    const accounts = data.accounts as Array<Record<string, string>> | undefined;
    if (!accounts || accounts.length === 0) {
        throw new Error("No Google Merchant Center account found");
    }
    // Account name format: "accounts/123456789"
    return accounts[0].name.replace("accounts/", "");
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && git add src/lib/google/merchant.ts && git commit -m "feat(google): add Merchant API client (OAuth, token refresh, API helpers)"
```

---

### Task 3: Feed generation (with tests)

**Files:**
- Create: `src/lib/google/feed.ts`
- Create: `tests/lib/google/feed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/google/feed.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { transformProductToGoogle, filterEligibleProducts } from "@/lib/google/feed";

describe("Google feed generation", () => {
    const baseProduct = {
        id: "prod-123",
        name: "NB 574 gris 42",
        canonical_name: "New Balance 574 Core Grey",
        ean: "0194956623215",
        price: 129.99,
        photo_processed_url: "https://r2.dev/products/abc/prod-123.webp",
        photo_url: "https://square.com/img/574.jpg",
        visible: true,
        stock: [{ quantity: 3 }],
    };

    it("transforms product to Google format", () => {
        const result = transformProductToGoogle(baseProduct, "store-001");
        expect(result.offerId).toBe("prod-123");
        expect(result.gtin).toBe("0194956623215");
        expect(result.title).toBe("New Balance 574 Core Grey");
        expect(result.price.value).toBe("129.99");
        expect(result.price.currency).toBe("EUR");
        expect(result.imageLink).toBe("https://r2.dev/products/abc/prod-123.webp");
        expect(result.availability).toBe("in_stock");
        expect(result.channel).toBe("local");
        expect(result.contentLanguage).toBe("fr");
        expect(result.targetCountry).toBe("FR");
        expect(result.condition).toBe("new");
        expect(result.storeCode).toBe("store-001");
    });

    it("uses name when canonical_name is null", () => {
        const product = { ...baseProduct, canonical_name: null };
        const result = transformProductToGoogle(product, "store-001");
        expect(result.title).toBe("NB 574 gris 42");
    });

    it("falls back to photo_url when photo_processed_url is null", () => {
        const product = { ...baseProduct, photo_processed_url: null };
        const result = transformProductToGoogle(product, "store-001");
        expect(result.imageLink).toBe("https://square.com/img/574.jpg");
    });

    it("marks out_of_stock when quantity is 0", () => {
        const product = { ...baseProduct, stock: [{ quantity: 0 }] };
        const result = transformProductToGoogle(product, "store-001");
        expect(result.availability).toBe("out_of_stock");
    });

    it("filters eligible products (has EAN, visible, has price)", () => {
        const products = [
            baseProduct,
            { ...baseProduct, id: "no-ean", ean: null },
            { ...baseProduct, id: "no-price", price: null },
            { ...baseProduct, id: "hidden", visible: false },
        ];
        const eligible = filterEligibleProducts(products);
        expect(eligible).toHaveLength(1);
        expect(eligible[0].id).toBe("prod-123");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx vitest run tests/lib/google/feed.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `src/lib/google/feed.ts`:

```typescript
type ProductRow = {
    id: string;
    name: string;
    canonical_name: string | null;
    ean: string | null;
    price: number | null;
    photo_processed_url: string | null;
    photo_url: string | null;
    visible: boolean;
    stock: Array<{ quantity: number }>;
};

type GoogleProduct = {
    offerId: string;
    gtin: string;
    title: string;
    price: { value: string; currency: string };
    imageLink: string | null;
    availability: "in_stock" | "out_of_stock";
    channel: "local";
    contentLanguage: "fr";
    targetCountry: "FR";
    condition: "new";
    storeCode: string;
};

export function transformProductToGoogle(product: ProductRow, storeCode: string): GoogleProduct {
    const quantity = product.stock?.[0]?.quantity ?? 0;

    return {
        offerId: product.id,
        gtin: product.ean!,
        title: product.canonical_name ?? product.name,
        price: {
            value: product.price!.toFixed(2),
            currency: "EUR",
        },
        imageLink: product.photo_processed_url ?? product.photo_url,
        availability: quantity > 0 ? "in_stock" : "out_of_stock",
        channel: "local",
        contentLanguage: "fr",
        targetCountry: "FR",
        condition: "new",
        storeCode,
    };
}

export function filterEligibleProducts(products: ProductRow[]): ProductRow[] {
    return products.filter(
        (p) => p.ean !== null && p.visible !== false && p.price !== null,
    );
}
```

- [ ] **Step 4: Run tests**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx vitest run tests/lib/google/feed.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && git add src/lib/google/feed.ts tests/lib/google/feed.test.ts && git commit -m "feat(google): add product feed transformation with tests"
```

---

### Task 4: Inventory push function

**Files:**
- Create: `src/lib/google/inventory.ts`

- [ ] **Step 1: Create inventory push module**

Create `src/lib/google/inventory.ts`:

```typescript
import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleAccessToken, googleMerchantFetch } from "@/lib/google/merchant";
import { captureError } from "@/lib/error";

/**
 * Push inventory updates to Google for a merchant.
 * Best-effort: never throws, always returns silently.
 * Called after POS sync and webhooks.
 *
 * @param merchantId - Two-Step merchant ID
 * @param productIds - Optional: only push these products. If omitted, push all visible products with EAN.
 */
export async function pushInventoryToGoogle(
    merchantId: string,
    productIds?: string[],
): Promise<void> {
    try {
        const auth = await getGoogleAccessToken(merchantId);
        if (!auth) return; // No Google connection — silently skip

        const supabase = createAdminClient();

        let query = supabase
            .from("products")
            .select("id, ean, stock(quantity)")
            .eq("merchant_id", merchantId)
            .eq("visible", true)
            .not("ean", "is", null);

        if (productIds && productIds.length > 0) {
            query = query.in("id", productIds);
        }

        const { data: products } = await query;
        if (!products || products.length === 0) return;

        const { connection, accessToken } = auth;
        const parent = `accounts/${connection.google_merchant_id}`;

        for (const product of products) {
            const quantity = (product as any).stock?.[0]?.quantity ?? 0;
            try {
                await googleMerchantFetch(
                    `/inventories/v1beta/${parent}/localInventories:insert`,
                    accessToken,
                    {
                        method: "POST",
                        body: JSON.stringify({
                            storeCode: connection.store_code,
                            productId: product.id,
                            availability: quantity > 0 ? "in_stock" : "out_of_stock",
                            quantity: quantity.toString(),
                        }),
                    },
                );
            } catch (err) {
                // Individual product failure — skip, don't break the loop
                captureError(err, {
                    merchantId,
                    productId: product.id,
                    context: "google-inventory-push",
                });
            }
        }
    } catch (err) {
        // Top-level failure (auth, DB) — log and return silently
        captureError(err, { merchantId, context: "google-inventory-push-top" });
    }
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && git add src/lib/google/inventory.ts && git commit -m "feat(google): add real-time inventory push to Google"
```

---

### Task 5: OAuth routes (auth, callback, disconnect)

**Files:**
- Create: `src/app/api/google/auth/route.ts`
- Create: `src/app/api/google/callback/route.ts`
- Create: `src/app/api/google/disconnect/route.ts`

- [ ] **Step 1: Create auth route**

Create `src/app/api/google/auth/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleAuthUrl } from "@/lib/google/merchant";

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("user_id", user.id)
            .single();

        if (!merchant) {
            return NextResponse.json({ error: "No merchant profile" }, { status: 403 });
        }

        const authUrl = getGoogleAuthUrl(merchant.id);
        return NextResponse.json({ auth_url: authUrl });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
```

- [ ] **Step 2: Create callback route**

Create `src/app/api/google/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeGoogleCode, getGoogleMerchantId } from "@/lib/google/merchant";
import { encrypt } from "@/lib/email/encryption";
import { captureError } from "@/lib/error";
import { getSiteUrl } from "@/lib/url";

export async function GET(request: NextRequest) {
    const baseUrl = getSiteUrl();
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");

    if (!code || !state) {
        return NextResponse.redirect(`${baseUrl}/dashboard/google?error=missing_params`);
    }

    // State format: google:{merchantId}
    const colonIdx = state.indexOf(":");
    if (colonIdx === -1 || state.slice(0, colonIdx) !== "google") {
        return NextResponse.redirect(`${baseUrl}/dashboard/google?error=invalid_state`);
    }

    const merchantId = state.slice(colonIdx + 1);
    const supabase = await createClient();

    // Verify merchant belongs to authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.redirect(`${baseUrl}/dashboard/google?error=auth_required`);
    }

    const { data: ownedMerchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("id", merchantId)
        .eq("user_id", user.id)
        .single();

    if (!ownedMerchant) {
        return NextResponse.redirect(`${baseUrl}/dashboard/google?error=forbidden`);
    }

    try {
        const tokens = await exchangeGoogleCode(code);
        const googleMerchantId = await getGoogleMerchantId(tokens.access_token);

        // Store Google connection
        await supabase
            .from("google_merchant_connections")
            .upsert({
                merchant_id: merchantId,
                google_merchant_id: googleMerchantId,
                access_token: encrypt(tokens.access_token),
                refresh_token: encrypt(tokens.refresh_token),
                expires_at: tokens.expires_at,
                store_code: `twostep-${merchantId.slice(0, 8)}`,
            }, { onConflict: "merchant_id" });

        return NextResponse.redirect(`${baseUrl}/dashboard/google?connected=true`);
    } catch (err) {
        captureError(err, { route: "google/callback", merchantId });
        return NextResponse.redirect(`${baseUrl}/dashboard/google?error=oauth_failed`);
    }
}
```

- [ ] **Step 3: Create disconnect route**

Create `src/app/api/google/disconnect/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("user_id", user.id)
            .single();

        if (!merchant) {
            return NextResponse.json({ error: "No merchant profile" }, { status: 403 });
        }

        await supabase
            .from("google_merchant_connections")
            .delete()
            .eq("merchant_id", merchant.id);

        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
```

- [ ] **Step 4: Commit**

```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && git add src/app/api/google/ && git commit -m "feat(google): add OAuth auth, callback, and disconnect routes"
```

---

### Task 6: Daily product feed cron

**Files:**
- Create: `src/app/api/cron/google-feed/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create the cron route**

Create `src/app/api/cron/google-feed/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleAccessToken, googleMerchantFetch } from "@/lib/google/merchant";
import { transformProductToGoogle, filterEligibleProducts } from "@/lib/google/feed";
import { captureError } from "@/lib/error";

export async function POST(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Find all merchants with active Google connections
    const { data: connections } = await supabase
        .from("google_merchant_connections")
        .select("merchant_id, store_code");

    if (!connections || connections.length === 0) {
        return NextResponse.json({ processed: 0, message: "No Google-connected merchants" });
    }

    let totalPushed = 0;
    let errors = 0;

    for (const conn of connections) {
        try {
            const auth = await getGoogleAccessToken(conn.merchant_id);
            if (!auth) {
                errors++;
                continue;
            }

            // Fetch all eligible products for this merchant
            const { data: products } = await supabase
                .from("products")
                .select("id, name, canonical_name, ean, price, photo_processed_url, photo_url, visible, stock(quantity)")
                .eq("merchant_id", conn.merchant_id);

            if (!products) continue;

            const eligible = filterEligibleProducts(products as any);
            const parent = `accounts/${auth.connection.google_merchant_id}`;

            let pushed = 0;
            for (const product of eligible) {
                try {
                    const googleProduct = transformProductToGoogle(product as any, conn.store_code);
                    await googleMerchantFetch(
                        `/products/v1beta/${parent}/productInputs:insert`,
                        auth.accessToken,
                        {
                            method: "POST",
                            body: JSON.stringify(googleProduct),
                        },
                    );
                    pushed++;
                } catch (err) {
                    captureError(err, {
                        merchantId: conn.merchant_id,
                        productId: product.id,
                        cron: "google-feed",
                    });
                }
            }

            // Update connection stats
            await supabase
                .from("google_merchant_connections")
                .update({
                    products_pushed: pushed,
                    last_feed_at: new Date().toISOString(),
                    last_feed_status: "success",
                    last_feed_error: null,
                })
                .eq("merchant_id", conn.merchant_id);

            totalPushed += pushed;
        } catch (err) {
            errors++;
            captureError(err, { merchantId: conn.merchant_id, cron: "google-feed" });

            await supabase
                .from("google_merchant_connections")
                .update({
                    last_feed_status: "error",
                    last_feed_error: err instanceof Error ? err.message : String(err),
                })
                .eq("merchant_id", conn.merchant_id);
        }
    }

    return NextResponse.json({
        merchants: connections.length,
        products_pushed: totalPushed,
        errors,
    });
}
```

- [ ] **Step 2: Add cron to vercel.json**

Add to the `crons` array in `vercel.json`:

```json
    ,{
      "path": "/api/cron/google-feed",
      "schedule": "0 3 * * *"
    }
```

- [ ] **Step 3: Commit**

```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && git add src/app/api/cron/google-feed/route.ts vercel.json && git commit -m "feat(google): add daily product feed cron"
```

---

### Task 7: Wire inventory push into sync engine and webhooks

**Files:**
- Modify: `src/lib/pos/sync-engine.ts`
- Modify: `src/app/api/webhooks/square/route.ts`
- Modify: `src/app/api/webhooks/shopify/route.ts`
- Modify: `src/app/api/webhooks/lightspeed/route.ts`
- Modify: `src/app/api/webhooks/zettle/route.ts`
- Modify: `src/app/api/cron/sync-sumup/route.ts`

- [ ] **Step 1: Add to sync engine**

In `src/lib/pos/sync-engine.ts`, add import at top:

```typescript
import { pushInventoryToGoogle } from "@/lib/google/inventory";
```

After the EAN enrichment block and before "Variant grouping by EAN", add:

```typescript
        // ─── Google inventory push (best-effort) ────────────────────

        try {
            await pushInventoryToGoogle(merchantId);
        } catch (err) {
            captureError(err, { merchantId, context: "google-inventory-during-sync" });
        }
```

- [ ] **Step 2: Add to Square webhook**

In `src/app/api/webhooks/square/route.ts`, add import at top:

```typescript
import { pushInventoryToGoogle } from "@/lib/google/inventory";
```

Before the `return NextResponse.json({ ok: true })` at line 76, add:

```typescript
        // Push updated stock to Google (best-effort)
        const merchantIds = [...new Set(updates.map((u) => u).filter(Boolean))];
        // We need the merchant_id from the product lookup above
        try {
            const merchantIdsToSync = new Set<string>();
            for (const update of updates) {
                const { data: p } = await supabase
                    .from("products")
                    .select("merchant_id")
                    .eq("pos_item_id", update.pos_item_id)
                    .single();
                if (p) merchantIdsToSync.add(p.merchant_id);
            }
            for (const mid of merchantIdsToSync) {
                await pushInventoryToGoogle(mid);
            }
        } catch {}
```

Actually, the webhook already looks up `product.merchant_id` for each update. Let's simplify — collect merchant IDs during the loop and push once at the end.

In `src/app/api/webhooks/square/route.ts`, after the `for` loop (line 74) and before `return NextResponse.json({ ok: true })` (line 76), add:

```typescript
        // Push to Google (best-effort, deduplicate merchant IDs)
        const merchantIdsForGoogle = new Set<string>();
        for (const update of updates) {
            const { data: p } = await supabase.from("products").select("merchant_id").eq("pos_item_id", update.pos_item_id).maybeSingle();
            if (p) merchantIdsForGoogle.add(p.merchant_id);
        }
        for (const mid of merchantIdsForGoogle) {
            pushInventoryToGoogle(mid).catch(() => {});
        }
```

Wait — the webhook already queries each product in the for loop. Let me re-read the code to avoid duplicate queries. The product is already queried at line 37-41. Better approach: collect merchant_id during the existing loop.

Simpler approach for all webhooks: add a single line after the existing try block, using the first product's merchant_id. Since webhooks from a single POS always belong to the same merchant:

After the for loop in each webhook, before the return statement, add:

```typescript
        // Push updated inventory to Google
        if (updates.length > 0) {
            const { data: firstProduct } = await supabase
                .from("products")
                .select("merchant_id")
                .eq("pos_item_id", updates[0].pos_item_id)
                .maybeSingle();
            if (firstProduct) {
                pushInventoryToGoogle(firstProduct.merchant_id).catch(() => {});
            }
        }
```

Apply this pattern to ALL 4 webhook files (Square, Shopify, Lightspeed, Zettle) with the same import + code block.

- [ ] **Step 3: Add to SumUp cron**

In `src/app/api/cron/sync-sumup/route.ts`, add import:

```typescript
import { pushInventoryToGoogle } from "@/lib/google/inventory";
```

After the stock update loop (around line 118, after `synced++`), add:

```typescript
            // Push to Google
            pushInventoryToGoogle(conn.merchant_id).catch(() => {});
```

- [ ] **Step 4: Run all tests**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && git add src/lib/pos/sync-engine.ts src/app/api/webhooks/ src/app/api/cron/sync-sumup/ && git commit -m "feat(google): wire inventory push into sync engine, webhooks, and SumUp cron"
```

---

### Task 8: Dashboard Google page

**Files:**
- Create: `src/app/dashboard/google/page.tsx`
- Modify: `src/components/dashboard/sidebar.tsx`

- [ ] **Step 1: Create the dashboard page**

Create `src/app/dashboard/google/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";
import { DashboardHeader } from "@/components/dashboard/header";

type GoogleConnection = {
    google_merchant_id: string;
    products_pushed: number;
    last_feed_at: string | null;
    last_feed_status: string;
    last_feed_error: string | null;
    store_code: string;
};

export default function GooglePage() {
    const { merchant } = useMerchant();
    const [connection, setConnection] = useState<GoogleConnection | null>(null);
    const [loading, setLoading] = useState(true);
    const [disconnecting, setDisconnecting] = useState(false);

    useEffect(() => {
        if (!merchant?.id) return;
        const supabase = createBrowserClient();
        supabase
            .from("google_merchant_connections")
            .select("google_merchant_id, products_pushed, last_feed_at, last_feed_status, last_feed_error, store_code")
            .eq("merchant_id", merchant.id)
            .maybeSingle()
            .then(({ data }) => {
                setConnection(data);
                setLoading(false);
            });
    }, [merchant?.id]);

    async function handleConnect() {
        const res = await fetch("/api/google/auth");
        const { auth_url } = await res.json();
        if (auth_url) window.location.href = auth_url;
    }

    async function handleDisconnect() {
        setDisconnecting(true);
        await fetch("/api/google/disconnect", { method: "POST" });
        setConnection(null);
        setDisconnecting(false);
    }

    function formatTimeAgo(dateStr: string): string {
        const diff = Date.now() - new Date(dateStr).getTime();
        const hours = Math.floor(diff / 3_600_000);
        if (hours < 1) return "il y a moins d'1h";
        if (hours < 24) return `il y a ${hours}h`;
        const days = Math.floor(hours / 24);
        return `il y a ${days}j`;
    }

    if (loading) {
        return (
            <>
                <DashboardHeader title="Google" storeName={merchant?.name} />
                <div className="mt-8 text-center text-sm text-[#8E96B0]">Chargement...</div>
            </>
        );
    }

    return (
        <>
            <DashboardHeader title="Google" storeName={merchant?.name} />

            <div className="mx-auto mt-6 max-w-lg">
                {!connection ? (
                    <div className="rounded-2xl border border-[#E8ECF4] bg-white p-8 text-center">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F5FF]">
                            <svg className="h-7 w-7 text-[#4285F4]" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                        </div>
                        <h2 className="text-lg font-semibold text-[#1A1F36]">
                            Rendez vos produits visibles sur Google
                        </h2>
                        <p className="mt-2 text-sm text-[#8E96B0]">
                            Vos produits apparaîtront gratuitement sur Google Shopping et Google Maps
                            quand un client cherche un produit près de chez vous.
                        </p>
                        <button
                            onClick={handleConnect}
                            className="mt-6 rounded-xl bg-[#4285F4] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#3367D6]"
                        >
                            Connecter à Google
                        </button>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-[#E8ECF4] bg-white p-8">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                                <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div>
                                <p className="font-semibold text-[#1A1F36]">Connecté à Google</p>
                                <p className="text-xs text-[#8E96B0]">
                                    Merchant ID : {connection.google_merchant_id}
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 space-y-3">
                            <div className="flex items-center justify-between rounded-xl bg-[#F8F9FC] px-4 py-3">
                                <span className="text-sm text-[#8E96B0]">Produits sur Google</span>
                                <span className="text-sm font-semibold text-[#1A1F36]">
                                    {connection.products_pushed}
                                </span>
                            </div>
                            <div className="flex items-center justify-between rounded-xl bg-[#F8F9FC] px-4 py-3">
                                <span className="text-sm text-[#8E96B0]">Dernière mise à jour</span>
                                <span className="text-sm font-semibold text-[#1A1F36]">
                                    {connection.last_feed_at
                                        ? formatTimeAgo(connection.last_feed_at)
                                        : "En attente"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between rounded-xl bg-[#F8F9FC] px-4 py-3">
                                <span className="text-sm text-[#8E96B0]">Statut</span>
                                <span className={`text-sm font-semibold ${
                                    connection.last_feed_status === "success"
                                        ? "text-green-600"
                                        : connection.last_feed_status === "error"
                                            ? "text-red-500"
                                            : "text-[#8E96B0]"
                                }`}>
                                    {connection.last_feed_status === "success"
                                        ? "Succès"
                                        : connection.last_feed_status === "error"
                                            ? `Erreur : ${connection.last_feed_error ?? "inconnue"}`
                                            : "En attente"}
                                </span>
                            </div>
                        </div>

                        <button
                            onClick={handleDisconnect}
                            disabled={disconnecting}
                            className="mt-6 text-sm text-red-500 transition hover:text-red-700 disabled:opacity-50"
                        >
                            {disconnecting ? "Déconnexion..." : "Déconnecter de Google"}
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}
```

- [ ] **Step 2: Add Google nav item to sidebar**

In `src/components/dashboard/sidebar.tsx`, add a new entry to the `navItems` array after the "Stock" entry (around line 38):

```typescript
    {
        href: "/dashboard/google",
        label: "Google",
        icon: (
            <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
        ),
    },
```

- [ ] **Step 3: Run build to verify**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && git add src/app/dashboard/google/ src/components/dashboard/sidebar.tsx && git commit -m "feat(google): add dashboard Google page with connect/disconnect and status"
```

---

### Task 9: Configuration and env vars

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: Add Google env vars to local env**

Add to `.env.local`:

```
GOOGLE_CLIENT_ID=TODO_SET_FROM_GOOGLE_CLOUD_CONSOLE
GOOGLE_CLIENT_SECRET=TODO_SET_FROM_GOOGLE_CLOUD_CONSOLE
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
```

- [ ] **Step 2: Document production env vars**

For production (Vercel), these need to be set:
```
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_REDIRECT_URI=https://www.twostep.fr/api/google/callback
```

- [ ] **Step 3: Final full test run**

Run: `cd C:/Users/thoma/Desktop/IA/twostep-nextjs && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Final commit if needed**

```bash
cd C:/Users/thoma/Desktop/IA/twostep-nextjs && git status
```
