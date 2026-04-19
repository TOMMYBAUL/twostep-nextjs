/**
 * Two-Step — Seed 5 high-quality demo merchants
 *
 * Creates realistic boutiques with real brand products, Serper images,
 * and AI categorization. Uses launch_cohort=999 for easy cleanup.
 *
 * Usage:
 *   node scripts/seed-quality-merchants.mjs          # create
 *   node scripts/seed-quality-merchants.mjs --clean   # remove
 *
 * Requires: .env.local with SUPABASE_SERVICE_ROLE_KEY, SERPER_API_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ──
const envPath = resolve(__dirname, "..", ".env.local");
try {
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
            value = value.slice(1, -1);
        if (!process.env[key]) process.env[key] = value;
    }
} catch { console.error("Could not read .env.local"); process.exit(1); }

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const serperKey = process.env.SERPER_API_KEY;

if (!supabaseUrl || !serviceKey) { console.error("Missing Supabase config"); process.exit(1); }
const supabase = createClient(supabaseUrl, serviceKey);

const DEMO_COHORT = 999;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Cleanup ──
if (process.argv.includes("--clean")) {
    const { data: merchants } = await supabase.from("merchants").select("id").eq("launch_cohort", DEMO_COHORT);
    if (!merchants?.length) { console.log("No demo merchants."); process.exit(0); }
    const ids = merchants.map((m) => m.id);
    const { data: products } = await supabase.from("products").select("id").in("merchant_id", ids);
    const pids = products?.map((p) => p.id) ?? [];
    if (pids.length) {
        await supabase.from("product_tags").delete().in("product_id", pids);
        await supabase.from("stock").delete().in("product_id", pids);
        await supabase.from("image_jobs").delete().in("product_id", pids);
        await supabase.from("feed_events").delete().in("merchant_id", ids);
    }
    await supabase.from("products").delete().in("merchant_id", ids);
    await supabase.from("invoices").delete().in("merchant_id", ids);
    await supabase.from("consumer_follows").delete().in("merchant_id", ids);
    // Get user_ids before deleting merchants
    const { data: mWithUsers } = await supabase.from("merchants").select("user_id").in("id", ids);
    const userIds = mWithUsers?.map((m) => m.user_id).filter(Boolean) ?? [];
    await supabase.from("merchants").delete().in("id", ids);
    // Clean auth users
    for (const uid of userIds) {
        await supabase.auth.admin.deleteUser(uid);
    }
    console.log(`✅ Cleaned ${ids.length} demo merchants, ${pids.length} products, ${userIds.length} auth users.`);
    process.exit(0);
}

// ── Serper Image Search ──
async function searchImage(query) {
    if (!serperKey) return null;
    try {
        const res = await fetch("https://google.serper.dev/images", {
            method: "POST",
            headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
            body: JSON.stringify({ q: query, gl: "fr", hl: "fr", num: 5 }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const images = data.images || [];
        // Pick first large-enough image from e-commerce domain
        const ecomDomains = ["amazon", "zalando", "asos", "sephora", "nike", "adidas", "fnac", "nocibe", "marionnaud", "newbalance", "puma"];
        const good = images.find((img) => {
            const w = img.imageWidth || 0;
            const h = img.imageHeight || 0;
            return w >= 400 && h >= 400 && img.imageUrl?.startsWith("https");
        });
        return good?.imageUrl || images[0]?.imageUrl || null;
    } catch { return null; }
}

// ── 5 Quality Merchants ──
const MERCHANTS = [
    {
        name: "L'Atelier de Léa",
        address: "23 Rue de la Pomme",
        city: "Toulouse",
        lat: 43.6030,
        lng: 1.4458,
        description: "Mode femme, créateurs français et marques émergentes. Sélection pointue au cœur de Toulouse.",
        phone: "05 61 22 33 44",
        category: "mode",
        products: [
            { name: "Robe midi Riviera", brand: "Sézane", price: 195, qty: 3, sizes: ["S", "M", "L"] },
            { name: "Blazer Boris oversize", brand: "Ba&sh", price: 295, qty: 2, sizes: ["36", "38", "40"] },
            { name: "Top Étoile brodé", brand: "Isabel Marant", price: 165, qty: 4, sizes: ["XS", "S", "M", "L"] },
            { name: "Jean Flinster slim", brand: "Maje", price: 225, qty: 3, sizes: ["36", "38", "40"] },
            { name: "Robe Rockin manches courtes", brand: "Claudie Pierlot", price: 245, qty: 2, sizes: ["36", "38"] },
            { name: "Pull col V cachemire", brand: "Eric Bompard", price: 185, qty: 5, sizes: ["S", "M", "L", "XL"] },
            { name: "Jupe plissée Soleil", brand: "Sézane", price: 130, qty: 3, sizes: ["34", "36", "38", "40"] },
            { name: "Chemisier en soie Vera", brand: "Ba&sh", price: 175, qty: 4, sizes: ["S", "M", "L"] },
            { name: "Manteau Idalgo laine", brand: "Maje", price: 475, qty: 2, sizes: ["36", "38", "40"] },
            { name: "Sandales cuir dorées", brand: "Sézane", price: 155, qty: 3, sizes: ["37", "38", "39", "40"] },
            { name: "T-shirt col rond en lin", brand: "American Vintage", price: 55, qty: 8, sizes: ["XS", "S", "M", "L", "XL"] },
            { name: "Pantalon fluide palazzo", brand: "Bash", price: 195, qty: 3, sizes: ["36", "38", "40"] },
            { name: "Sac bandoulière Milo", brand: "Sézane", price: 210, qty: 2 },
            { name: "Boucles d'oreilles créoles dorées", brand: "Aurélie Bidermann", price: 85, qty: 6 },
            { name: "Écharpe en laine mérinos", brand: "Johnstons of Elgin", price: 145, qty: 4 },
        ],
    },
    {
        name: "Sole Store",
        address: "9 Rue des Arts",
        city: "Toulouse",
        lat: 43.6005,
        lng: 1.4470,
        description: "Sneakers culture, éditions limitées et classiques. Le rendez-vous des passionnés de kicks à Toulouse.",
        phone: "05 61 55 66 77",
        category: "chaussures",
        products: [
            { name: "Air Force 1 '07 White", brand: "Nike", price: 119, qty: 5, sizes: ["40", "41", "42", "43", "44", "45"] },
            { name: "Samba OG White/Black", brand: "Adidas", price: 110, qty: 4, sizes: ["39", "40", "41", "42", "43", "44"] },
            { name: "550 White Grey", brand: "New Balance", price: 130, qty: 3, sizes: ["40", "41", "42", "43", "44"] },
            { name: "Dunk Low Panda", brand: "Nike", price: 119, qty: 4, sizes: ["38", "39", "40", "41", "42", "43"] },
            { name: "Gazelle Indoor Blue", brand: "Adidas", price: 110, qty: 3, sizes: ["39", "40", "41", "42", "43"] },
            { name: "Suede Classic XXI", brand: "Puma", price: 85, qty: 6, sizes: ["39", "40", "41", "42", "43", "44"] },
            { name: "Club C 85 Vintage", brand: "Reebok", price: 100, qty: 4, sizes: ["40", "41", "42", "43"] },
            { name: "574 Core Grey", brand: "New Balance", price: 100, qty: 5, sizes: ["40", "41", "42", "43", "44", "45"] },
            { name: "Air Max 90 White", brand: "Nike", price: 140, qty: 3, sizes: ["41", "42", "43", "44"] },
            { name: "Stan Smith Lux Off-White", brand: "Adidas", price: 120, qty: 4, sizes: ["39", "40", "41", "42", "43"] },
            { name: "Gel-1130 White/Clay", brand: "Asics", price: 130, qty: 3, sizes: ["40", "41", "42", "43", "44"] },
            { name: "Old Skool Classic", brand: "Vans", price: 80, qty: 6, sizes: ["38", "39", "40", "41", "42", "43", "44"] },
            { name: "Chuck Taylor All Star Hi", brand: "Converse", price: 75, qty: 5, sizes: ["38", "39", "40", "41", "42", "43"] },
            { name: "Air Jordan 1 Low White/Grey", brand: "Nike", price: 129, qty: 3, sizes: ["41", "42", "43", "44"] },
            { name: "2002R Rain Cloud", brand: "New Balance", price: 150, qty: 2, sizes: ["42", "43", "44"] },
        ],
    },
    {
        name: "Peau Douce",
        address: "14 Rue Croix-Baragnon",
        city: "Toulouse",
        lat: 43.5992,
        lng: 1.4478,
        description: "Institut de beauté et cosmétiques naturels. Marques françaises, soins visage et corps.",
        phone: "05 61 33 22 11",
        category: "cosmétique",
        products: [
            { name: "Huile Prodigieuse 50ml", brand: "Nuxe", price: 26, qty: 10 },
            { name: "Vinoperfect Sérum Éclat 30ml", brand: "Caudalie", price: 49, qty: 6 },
            { name: "Crème Concentrée Lait 75ml", brand: "Embryolisse", price: 16, qty: 12 },
            { name: "Sérum Vitamine C Pure 30ml", brand: "Typology", price: 24, qty: 8 },
            { name: "Eau Micellaire Sensibio 250ml", brand: "Bioderma", price: 12, qty: 15 },
            { name: "Crème Hydratante Riche 50ml", brand: "Avène", price: 18, qty: 10 },
            { name: "Masque Éclat Express 75ml", brand: "Caudalie", price: 22, qty: 7 },
            { name: "Fond de Teint Healthy Mix", brand: "Bourjois", price: 15, qty: 8 },
            { name: "Rouge à Lèvres Velvet Mat", brand: "Bourjois", price: 14, qty: 12 },
            { name: "Eau Thermale Spray 300ml", brand: "Avène", price: 9, qty: 20 },
            { name: "Crème Mains Réparatrice 50ml", brand: "Neutrogena", price: 7, qty: 15 },
            { name: "Huile Démaquillante 150ml", brand: "Typology", price: 19, qty: 6 },
            { name: "Palette Yeux Nude 12 couleurs", brand: "L'Oréal Paris", price: 18, qty: 5 },
            { name: "Sérum Acide Hyaluronique 30ml", brand: "La Roche-Posay", price: 35, qty: 8 },
            { name: "Baume Lèvres Réparateur", brand: "Nuxe", price: 12, qty: 10 },
        ],
    },
    {
        name: "Maison Dorée",
        address: "18 Rue Saint-Rome",
        city: "Toulouse",
        lat: 43.6015,
        lng: 1.4440,
        description: "Bijouterie artisanale et horlogerie. Créations uniques et marques iconiques depuis 2015.",
        phone: "05 61 44 55 66",
        category: "bijouterie",
        products: [
            { name: "Bracelet Moments Argent", brand: "Pandora", price: 65, qty: 5 },
            { name: "Montre Minuit Rose Gold", brand: "Cluse", price: 99, qty: 4 },
            { name: "Collier Cœur Cristal", brand: "Swarovski", price: 89, qty: 3 },
            { name: "Montre Classic Petite 28mm", brand: "Daniel Wellington", price: 159, qty: 3 },
            { name: "Boucles Créoles Or Rose", brand: "Agatha Paris", price: 55, qty: 6 },
            { name: "Bague Solitaire Argent 925", brand: "Pandora", price: 49, qty: 8 },
            { name: "Bracelet Jonc Plaqué Or", brand: "Agatha Paris", price: 45, qty: 5 },
            { name: "Montre Heritage Automatic", brand: "Tissot", price: 495, qty: 2 },
            { name: "Collier Chaîne Maille Forçat", brand: "Maty", price: 79, qty: 4 },
            { name: "Pendentif Lettre Initiale Or", brand: "PDPAOLA", price: 39, qty: 10 },
            { name: "Bracelet Tennis Cristaux", brand: "Swarovski", price: 129, qty: 3 },
            { name: "Montre Iconic Link 32mm", brand: "Daniel Wellington", price: 199, qty: 2 },
            { name: "Alliance Or 18 carats", brand: "Maty", price: 350, qty: 3 },
            { name: "Boucles Perle Naturelle", brand: "PDPAOLA", price: 59, qty: 5 },
            { name: "Coffret Nettoyage Bijoux", brand: "Pandora", price: 25, qty: 8 },
        ],
    },
    {
        name: "Chez Nous",
        address: "31 Rue de la Colombette",
        city: "Toulouse",
        lat: 43.6048,
        lng: 1.4520,
        description: "Décoration intérieure, objets du quotidien et cadeaux. L'art de vivre à la toulousaine.",
        phone: "05 61 77 88 99",
        category: "décoration",
        products: [
            { name: "Bougie Baies 190g", brand: "Diptyque", price: 62, qty: 4 },
            { name: "Diffuseur Fleur d'Oranger 200ml", brand: "Maison Berger", price: 28, qty: 6 },
            { name: "Vase cylindre verre fumé H25", brand: "Bloomingville", price: 29, qty: 5 },
            { name: "Coussin lin naturel 45x45", brand: "Linum", price: 35, qty: 8 },
            { name: "Plaid tricot coton 130x170", brand: "Maisons du Monde", price: 49, qty: 3 },
            { name: "Cadre photo chêne 20x30", brand: "Moebe", price: 42, qty: 6 },
            { name: "Miroir rond doré Ø50", brand: "Bloomingville", price: 59, qty: 3 },
            { name: "Set 4 assiettes grès beige", brand: "HK Living", price: 48, qty: 5 },
            { name: "Lampe à poser céramique", brand: "Maisons du Monde", price: 55, qty: 4 },
            { name: "Tasse cappuccino 200ml grès", brand: "HK Living", price: 14, qty: 12 },
            { name: "Bougie parfumée Figuier 300g", brand: "P.F. Candle Co", price: 32, qty: 5 },
            { name: "Panier seagrass naturel M", brand: "Bloomingville", price: 25, qty: 7 },
            { name: "Affiche botanique A3", brand: "The Poster Club", price: 38, qty: 4 },
            { name: "Carafe verre soufflé 1L", brand: "Serax", price: 35, qty: 5 },
            { name: "Savon Marseille Cube 300g", brand: "Fer à Cheval", price: 8, qty: 20 },
        ],
    },
];

// ── Main ──
async function main() {
    console.log("=== Seeding 5 quality demo merchants ===\n");

    // Clean existing demo merchants first
    console.log("Cleaning old demo merchants...");
    const { data: existing } = await supabase.from("merchants").select("id").eq("launch_cohort", DEMO_COHORT);
    if (existing?.length) {
        const eids = existing.map((m) => m.id);
        const { data: eprods } = await supabase.from("products").select("id").in("merchant_id", eids);
        const epids = eprods?.map((p) => p.id) ?? [];
        if (epids.length) {
            await supabase.from("product_tags").delete().in("product_id", epids);
            await supabase.from("stock").delete().in("product_id", epids);
            await supabase.from("image_jobs").delete().in("product_id", epids);
            await supabase.from("feed_events").delete().in("merchant_id", eids);
        }
        await supabase.from("products").delete().in("merchant_id", eids);
        await supabase.from("invoices").delete().in("merchant_id", eids);
        await supabase.from("consumer_follows").delete().in("merchant_id", eids);
        await supabase.from("merchants").delete().in("id", eids);
        console.log(`  Removed ${eids.length} old merchants, ${epids.length} products.\n`);
    }

    let totalProducts = 0;
    let totalImages = 0;

    for (const m of MERCHANTS) {
        console.log(`\n── ${m.name} (${m.category}) ──`);

        // Create demo auth user
        const slug = m.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
        const demoEmail = `demo-${slug}@seed.twostep.local`;
        const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
            email: demoEmail,
            password: `seed-${crypto.randomUUID().slice(0, 8)}`,
            email_confirm: true,
        });
        if (authErr) { console.error(`  ERROR creating user: ${authErr.message}`); continue; }

        // Create merchant
        const merchantId = crypto.randomUUID();
        const { error: mErr } = await supabase.from("merchants").insert({
            id: merchantId,
            user_id: authUser.user.id,
            name: m.name,
            address: m.address,
            city: m.city,
            location: `POINT(${m.lng} ${m.lat})`,
            description: m.description,
            phone: m.phone,
            plan: "premium",
            status: "active",
            launch_cohort: DEMO_COHORT,
            opening_hours: JSON.stringify({
                lundi: "10:00-19:00",
                mardi: "10:00-19:00",
                mercredi: "10:00-19:00",
                jeudi: "10:00-19:00",
                vendredi: "10:00-19:00",
                samedi: "10:00-19:00",
                dimanche: "Fermé",
            }),
        });
        if (mErr) { console.error(`  ERROR creating merchant: ${mErr.message}`); continue; }
        console.log(`  ✓ Merchant created (${demoEmail})`);

        // Create products
        for (const p of m.products) {
            const productId = crypto.randomUUID();
            const fullName = p.brand ? `${p.brand} ${p.name}` : p.name;

            // Search image via Serper
            let photoUrl = null;
            if (serperKey) {
                const query = p.brand
                    ? `${p.brand} ${p.name} product`
                    : `${p.name} product`;
                photoUrl = await searchImage(query);
                if (photoUrl) totalImages++;
                await sleep(250); // respect rate limit
            }

            const { error: pErr } = await supabase.from("products").insert({
                id: productId,
                merchant_id: merchantId,
                name: fullName,
                price: p.price,
                visible: true,
                available_sizes: p.sizes || null,
                photo_url: photoUrl,
                photo_source: photoUrl ? "serper" : null,
            });

            if (pErr) { console.error(`  ERROR product ${fullName}: ${pErr.message}`); continue; }

            // Create stock
            await supabase.from("stock").upsert({
                product_id: productId,
                quantity: p.qty,
            });

            // Create product tags for brand
            if (p.brand) {
                await supabase.from("product_tags").insert({
                    product_id: productId,
                    tag_type: "brand",
                    tag_value: p.brand,
                    source: "seed",
                    confidence: 100,
                });
            }

            totalProducts++;
            process.stdout.write(`  ${photoUrl ? "📸" : "⬜"} ${fullName}\n`);
        }

        console.log(`  ✓ ${m.products.length} products created`);
    }

    console.log(`\n=== DONE ===`);
    console.log(`Merchants: ${MERCHANTS.length}`);
    console.log(`Products: ${totalProducts}`);
    console.log(`Images found: ${totalImages}`);
    console.log(`\nNext steps:`);
    console.log(`  1. Start dev server: npm run dev`);
    console.log(`  2. Categorize: curl -X POST http://localhost:3001/api/categorize`);
    console.log(`  3. Process images: the rembg worker handles this automatically`);
}

main().catch(console.error);
