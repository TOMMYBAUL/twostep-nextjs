/**
 * Seed a realistic test boutique "Le Comptoir Sneakers" with:
 * - 6 products (not one per size — one product with available_sizes JSON)
 * - Stock per size variant
 * - Product images processed through rembg pipeline
 *
 * Run: node scripts/seed-test-boutique.mjs
 * Prereq: ALTER TABLE products ADD COLUMN available_sizes JSONB DEFAULT '[]'::jsonb;
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const REMBG_URL = process.env.REMBG_API_URL || "http://195.201.229.146:7000";

const MERCHANT_SIRET = "90312478500019";

// ─── Products ────────────────────────────────────────────────────────

const PRODUCTS = [
    {
        name: "Nike Air Force 1 '07",
        brand: "Nike",
        category: "Chaussures",
        price: 119.99,
        image: "https://images.unsplash.com/photo-1600269112105-5c2c1c06eb30?w=800&q=80",
        sizes: [
            { size: "38", quantity: 2 },
            { size: "39", quantity: 3 },
            { size: "40", quantity: 0 },
            { size: "41", quantity: 5 },
            { size: "42", quantity: 4 },
            { size: "43", quantity: 1 },
            { size: "44", quantity: 0 },
            { size: "45", quantity: 2 },
        ],
    },
    {
        name: "New Balance 574",
        brand: "New Balance",
        category: "Chaussures",
        price: 99.99,
        image: "https://images.unsplash.com/photo-1539185441755-769473a23570?w=800&q=80",
        sizes: [
            { size: "39", quantity: 1 },
            { size: "40", quantity: 3 },
            { size: "41", quantity: 2 },
            { size: "42", quantity: 6 },
            { size: "43", quantity: 4 },
            { size: "44", quantity: 0 },
        ],
    },
    {
        name: "Adidas Stan Smith",
        brand: "Adidas",
        category: "Chaussures",
        price: 109.99,
        image: "https://images.unsplash.com/photo-1587563871167-1ee9c731aefb?w=800&q=80",
        sizes: [
            { size: "36", quantity: 1 },
            { size: "37", quantity: 2 },
            { size: "38", quantity: 3 },
            { size: "39", quantity: 0 },
            { size: "40", quantity: 4 },
            { size: "41", quantity: 2 },
            { size: "42", quantity: 5 },
            { size: "43", quantity: 1 },
        ],
    },
    {
        name: "Vans Old Skool",
        brand: "Vans",
        category: "Chaussures",
        price: 79.99,
        image: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800&q=80",
        sizes: [
            { size: "38", quantity: 2 },
            { size: "39", quantity: 0 },
            { size: "40", quantity: 1 },
            { size: "41", quantity: 3 },
            { size: "42", quantity: 2 },
            { size: "43", quantity: 0 },
        ],
    },
    {
        name: "T-Shirt Premium Coton Bio",
        brand: "Le Comptoir",
        category: "Mode",
        price: 34.99,
        image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80",
        sizes: [
            { size: "S", quantity: 5 },
            { size: "M", quantity: 8 },
            { size: "L", quantity: 4 },
            { size: "XL", quantity: 2 },
            { size: "XXL", quantity: 0 },
        ],
    },
    {
        name: "Hoodie Oversize Premium",
        brand: "Le Comptoir",
        category: "Mode",
        price: 69.99,
        image: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&q=80",
        sizes: [
            { size: "S", quantity: 0 },
            { size: "M", quantity: 3 },
            { size: "L", quantity: 5 },
            { size: "XL", quantity: 2 },
        ],
    },
];

// ─── Image processing via rembg ──────────────────────────────────────

async function processImage(sourceUrl) {
    console.log("    Downloading image...");
    const imgRes = await fetch(sourceUrl);
    if (!imgRes.ok) throw new Error(`Download failed: ${imgRes.status}`);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    console.log("    Sending to rembg...");
    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(imgBuffer)]), "image.png");

    const rembgRes = await fetch(`${REMBG_URL}/api/remove`, {
        method: "POST",
        body: formData,
    });

    if (!rembgRes.ok) {
        const text = await rembgRes.text();
        throw new Error(`rembg error: ${rembgRes.status} ${text}`);
    }

    return Buffer.from(await rembgRes.arrayBuffer());
}

// ─── Seed logic ──────────────────────────────────────────────────────

async function seed() {
    // 1. Find or clean existing merchant
    const { data: existing } = await supabase
        .from("merchants")
        .select("id")
        .eq("siret", MERCHANT_SIRET)
        .maybeSingle();

    let merchantId;

    if (existing) {
        merchantId = existing.id;
        console.log(`Merchant exists: ${merchantId}`);

        // Delete old products and their stock
        const { data: oldProds } = await supabase
            .from("products")
            .select("id")
            .eq("merchant_id", merchantId);

        if (oldProds?.length) {
            const ids = oldProds.map(p => p.id);
            await supabase.from("stock").delete().in("product_id", ids);
            await supabase.from("image_jobs").delete().in("product_id", ids);
            await supabase.from("products").delete().eq("merchant_id", merchantId);
            console.log(`  Cleaned ${ids.length} old products`);
        }
    } else {
        // Create user + merchant
        let userId;
        const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
            email: "test-boutique@twostep.fr",
            password: "TestBoutique2026!",
            email_confirm: true,
        });

        if (authErr) {
            const { data: users } = await supabase.auth.admin.listUsers();
            const found = users?.users?.find(u => u.email === "test-boutique@twostep.fr");
            if (!found) throw authErr;
            userId = found.id;
        } else {
            userId = authUser.user.id;
        }

        const { data: merchant, error: merchErr } = await supabase
            .from("merchants")
            .insert({
                user_id: userId,
                name: "Le Comptoir Sneakers",
                address: "15 rue Saint-Rome",
                city: "Toulouse",
                phone: "05 61 99 12 34",
                description: "Boutique de sneakers premium au coeur de Toulouse. Nike, New Balance, Adidas — toutes les pointures.",
                status: "active",
                siret: MERCHANT_SIRET,
                siret_verified: true,
                photo_url: "https://images.unsplash.com/photo-1556906781-9a412961c28c?w=400&h=400&fit=crop",
                opening_hours: {
                    mon: { open: "10:00", close: "19:00" },
                    tue: { open: "10:00", close: "19:00" },
                    wed: { open: "10:00", close: "19:00" },
                    thu: { open: "10:00", close: "19:00" },
                    fri: { open: "10:00", close: "19:30" },
                    sat: { open: "09:30", close: "19:30" },
                    sun: null,
                },
                pos_type: "square",
                plan: "free",
                launch_cohort: 1,
                naf_code: "47.72A",
                location: "SRID=4326;POINT(1.4420 43.6030)",
            })
            .select("id")
            .single();

        if (merchErr) throw merchErr;
        merchantId = merchant.id;
        console.log(`Created merchant: ${merchantId}`);
    }

    // 2. Create products
    console.log(`\nCreating ${PRODUCTS.length} products...\n`);

    for (const product of PRODUCTS) {
        const totalStock = product.sizes.reduce((sum, s) => sum + s.quantity, 0);

        console.log(`  ${product.name} (${product.sizes.length} tailles, ${totalStock} en stock)`);

        // Process image through rembg
        let processedUrl = null;
        try {
            const processed = await processImage(product.image);
            console.log(`    rembg OK (${(processed.length / 1024).toFixed(0)} KB)`);
            // We can't upload to R2 from here, so we'll store the original
            // and create an image_job for async processing
            processedUrl = null; // Will be processed async
        } catch (err) {
            console.log(`    rembg failed: ${err.message} — using original`);
        }

        const { data: created, error: prodErr } = await supabase
            .from("products")
            .insert({
                merchant_id: merchantId,
                name: product.name,
                brand: product.brand,
                category: product.category?.toLowerCase(),
                price: product.price,
                photo_url: product.image,
                photo_processed_url: processedUrl,
                available_sizes: product.sizes,
                pos_item_id: `seed-${product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
                pos_provider: "manual",
            })
            .select("id")
            .single();

        if (prodErr) {
            console.error(`    ERROR: ${prodErr.message}`);
            continue;
        }

        // Insert stock (total across all sizes)
        await supabase.from("stock").insert({
            product_id: created.id,
            quantity: totalStock,
        });

        // Create image job for async processing
        await supabase.from("image_jobs").insert({
            product_id: created.id,
            merchant_id: merchantId,
            source_url: product.image,
            status: "pending",
        });

        const inStock = product.sizes.filter(s => s.quantity > 0).map(s => s.size).join(", ");
        const oos = product.sizes.filter(s => s.quantity === 0).map(s => s.size).join(", ");
        console.log(`    En stock: ${inStock || "—"}`);
        if (oos) console.log(`    Rupture: ${oos}`);
    }

    console.log(`\nDone! ${PRODUCTS.length} products created.`);
    console.log(`Merchant ID: ${merchantId}`);
    console.log(`\nLogin: test-boutique@twostep.fr / TestBoutique2026!`);
    console.log(`\nTo process images, call: POST /api/images/process (cron or manual)`);
}

seed().catch(err => { console.error("FATAL:", err); process.exit(1); });
