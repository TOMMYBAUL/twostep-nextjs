/**
 * Test script: simulates the full invoice pipeline for Dear Skin CSV.
 * Uses service_role to bypass auth. Run with: node scripts/test-invoice-pipeline.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load env
const envPath = resolve(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) env[key.trim()] = rest.join("=").trim();
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serviceKey);

const MERCHANT_ID = "1e24990c-9421-49a2-8c71-70d89780fc9f"; // Two-Step Test Store

async function main() {
    console.log("=== TEST PIPELINE FACTURE DEAR SKIN ===\n");

    // 1. Clean up previous test data
    console.log("1. Nettoyage des anciennes données test...");
    const { data: oldInvoices } = await supabase
        .from("invoices")
        .select("id")
        .eq("merchant_id", MERCHANT_ID)
        .eq("supplier_name", "TEST-Dear-Skin");

    if (oldInvoices?.length) {
        for (const inv of oldInvoices) {
            await supabase.from("invoice_items").delete().eq("invoice_id", inv.id);
            await supabase.from("invoices").delete().eq("id", inv.id);
        }
        console.log(`   Supprimé ${oldInvoices.length} anciennes factures test`);
    }

    // Also clean up products from previous test runs
    const { data: oldProducts } = await supabase
        .from("products")
        .select("id")
        .eq("merchant_id", MERCHANT_ID)
        .in("name", [
            "Heartleaf BHA Pore Deep Cleansing Foam 150ml",
            "Heartleaf Pore Control Cleansing Oil 200ml",
            "Azelaic Acid 10 Hyaluron Redness Soothing Serum 30ml",
            "Bio-Collagen Real Deep Mask",
            "Madeca Cream 50ml",
            "Advanced Snail 96 Mucin Power Essence 100ml",
            "Aloe Soothing Sun Cream SPF50+ 50ml",
            "Madagascar Centella Toning Toner 210ml",
            "Clean It Zero Cleansing Balm Original 100ml",
            "Madecassoside Cica Gel Sheet Mask",
        ]);

    if (oldProducts?.length) {
        for (const p of oldProducts) {
            await supabase.from("stock").delete().eq("product_id", p.id);
            await supabase.from("feed_events").delete().eq("product_id", p.id);
            await supabase.from("products").delete().eq("id", p.id);
        }
        console.log(`   Supprimé ${oldProducts.length} anciens produits test`);
    }

    // 2. Create invoice
    console.log("\n2. Création de la facture...");
    const { data: invoice, error: invErr } = await supabase
        .from("invoices")
        .insert({
            merchant_id: MERCHANT_ID,
            supplier_name: "TEST-Dear-Skin",
            source: "upload",
            status: "parsed",
        })
        .select()
        .single();

    if (invErr) {
        console.error("   ERREUR création facture:", invErr.message);
        return;
    }
    console.log(`   Facture créée: ${invoice.id}`);

    // 3. Parse CSV and insert items
    console.log("\n3. Parsing CSV et insertion des items...");
    const csv = readFileSync("test-data/facture-dear-skin.csv", "utf-8");
    const lines = csv.trim().split("\n").slice(1); // skip header

    const items = lines.map((line) => {
        const [name, brand, unitPrice, sellingPrice, quantity] = line.split(";");
        return {
            invoice_id: invoice.id,
            name: name.trim(),
            brand: brand?.trim() || null,
            ean: null,
            sku: null,
            quantity: parseInt(quantity),
            unit_price_ht: parseFloat(unitPrice),
            status: "detected",
        };
    });

    const { error: itemsErr } = await supabase.from("invoice_items").insert(items);
    if (itemsErr) {
        console.error("   ERREUR insertion items:", itemsErr.message);
        return;
    }
    console.log(`   ${items.length} items insérés`);
    for (const item of items) {
        console.log(`   - ${item.brand} ${item.name} | SKU: ${item.sku} | EAN: ${item.ean ?? "∅"} | ${item.quantity}x @ ${item.unit_price_ht}€`);
    }

    // 4. Call validate endpoint
    console.log("\n4. Validation de la facture via API...");
    console.log("   (enrichissement EAN + images en cours, patience...)\n");

    // Build selling prices (TTC values from CSV)
    const { data: insertedItems } = await supabase
        .from("invoice_items")
        .select("id, name")
        .eq("invoice_id", invoice.id);

    const sellingPrices = {};
    for (const ii of insertedItems ?? []) {
        const csvLine = lines.find((l) => l.includes(ii.name));
        if (csvLine) {
            const ttc = parseFloat(csvLine.split(";")[3]);
            sellingPrices[ii.id] = ttc;
        }
    }

    const validateUrl = `http://localhost:3001/api/invoices/${invoice.id}/validate`;

    // Get user session for the merchant owner
    const { data: merchantData } = await supabase
        .from("merchants")
        .select("user_id")
        .eq("id", MERCHANT_ID)
        .single();

    if (!merchantData?.user_id) {
        console.error("   ERREUR: pas de user_id pour le marchand");
        return;
    }

    const { data: userData } = await supabase.auth.admin.getUserById(merchantData.user_id);
    const userEmail = userData?.user?.email;
    if (!userEmail) {
        console.error("   ERREUR: user sans email");
        return;
    }

    // Generate a magic link to get a valid session token
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: userEmail,
    });

    if (linkErr || !linkData?.properties?.hashed_token) {
        console.error("   ERREUR magic link:", linkErr?.message);
        return;
    }

    // Verify the OTP to get a session
    const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
        token_hash: linkData.properties.hashed_token,
        type: "magiclink",
    });

    if (verifyErr || !verifyData?.session?.access_token) {
        console.error("   ERREUR vérification OTP:", verifyErr?.message);
        return;
    }

    const accessToken = verifyData.session.access_token;
    const refreshToken = verifyData.session.refresh_token;
    console.log("   → Session authentifiée (access_token OK)");

    // Next.js SSR reads cookies via the @supabase/ssr package
    // The cookie name format is: sb-<project-ref>-auth-token
    const projectRef = supabaseUrl.replace("https://", "").split(".")[0];
    const cookieName = `sb-${projectRef}-auth-token`;
    const cookieValue = JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
    });

    // Supabase SSR splits large cookies into chunks: base64 encode first
    // Actually, the @supabase/ssr chunked cookie format uses .0, .1, etc.
    // For a single chunk, the cookie name is just the base name
    const encodedCookie = `${cookieName}=${encodeURIComponent(cookieValue)}`;

    console.log("   → Appel de l'API validate avec cookie auth...");
    const startTime = Date.now();
    const res = await fetch(validateUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Cookie": encodedCookie,
        },
        body: JSON.stringify({ selling_prices: sellingPrices }),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!res.ok) {
        const errText = await res.text();
        console.error(`   ERREUR validation (${res.status}): ${errText}`);
        console.log("\n   ⚠️  L'endpoint nécessite une session auth.");
        console.log("   → Teste manuellement dans le dashboard marchand.");
        console.log(`   → Invoice ID: ${invoice.id}`);
        console.log(`   → Marchand: Two-Step Test Store`);

        // Print what we CAN verify: the items are properly inserted
        console.log("\n5. Vérification des données insérées...");
        const { data: checkItems } = await supabase
            .from("invoice_items")
            .select("name, sku, brand, ean, quantity, unit_price_ht, status")
            .eq("invoice_id", invoice.id);

        console.log("\n   Items en base:");
        for (const ci of checkItems ?? []) {
            console.log(`   ✅ ${ci.brand ?? "?"} | ${ci.name} | SKU:${ci.sku ?? "∅"} | EAN:${ci.ean ?? "∅"} | ${ci.quantity}x @ ${ci.unit_price_ht}€ | ${ci.status}`);
        }
        console.log(`\n   Brand propagé: ${(checkItems ?? []).filter(i => i.brand).length}/${(checkItems ?? []).length} items ont une marque`);
        console.log(`   SKU propagé: ${(checkItems ?? []).filter(i => i.sku).length}/${(checkItems ?? []).length} items ont un SKU`);
        return;
    }

    const result = await res.json();
    console.log(`   ✅ Validation terminée en ${elapsed}s`);
    console.log(`   Résultat:`, JSON.stringify(result, null, 2));

    // 5. Check enrichment results
    console.log("\n5. Vérification des produits enrichis...");
    const { data: products } = await supabase
        .from("products")
        .select("name, brand, ean, sku, photo_url, photo_source, canonical_name, category")
        .eq("merchant_id", MERCHANT_ID)
        .in("name", items.map((i) => i.name));

    for (const p of products ?? []) {
        const hasPhoto = p.photo_url ? "📸" : "❌";
        const hasEan = p.ean ? `EAN:${p.ean}` : "EAN:∅";
        console.log(`   ${hasPhoto} ${p.brand ?? "?"} | ${p.name} | ${hasEan} | SKU:${p.sku ?? "∅"} | photo:${p.photo_source ?? "none"} | cat:${p.category ?? "?"}`);
    }

    const withPhotos = (products ?? []).filter((p) => p.photo_url).length;
    const withEan = (products ?? []).filter((p) => p.ean).length;
    const withBrand = (products ?? []).filter((p) => p.brand).length;

    console.log(`\n   === RÉSUMÉ ===`);
    console.log(`   Photos: ${withPhotos}/${products?.length ?? 0}`);
    console.log(`   EAN trouvés: ${withEan}/${products?.length ?? 0}`);
    console.log(`   Brand: ${withBrand}/${products?.length ?? 0}`);
}

main().catch(console.error);
