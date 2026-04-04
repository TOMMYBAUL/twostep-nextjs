/**
 * Two-Step — Seed ~35 demo merchants for map screenshot
 *
 * Adds fake merchants scattered across Toulouse with good Unsplash photos.
 * Tagged with launch_cohort = 999 for easy cleanup.
 *
 * Usage:
 *   node scripts/seed-demo-merchants.mjs          # insert
 *   node scripts/seed-demo-merchants.mjs --clean   # remove all demo merchants
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
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
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
    }
} catch {
    console.error("Could not read .env.local");
    process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceKey);

const DEMO_COHORT = 999; // tag to identify demo merchants

// ── Cleanup mode ──
if (process.argv.includes("--clean")) {
    // Get demo merchant IDs
    const { data: merchants } = await supabase
        .from("merchants")
        .select("id")
        .eq("launch_cohort", DEMO_COHORT);

    if (!merchants || merchants.length === 0) {
        console.log("No demo merchants to clean up.");
        process.exit(0);
    }

    const ids = merchants.map((m) => m.id);
    console.log(`Cleaning up ${ids.length} demo merchants...`);

    // Delete stock, products, then merchants
    await supabase.from("stock").delete().in("product_id",
        (await supabase.from("products").select("id").in("merchant_id", ids)).data?.map(p => p.id) ?? []
    );
    await supabase.from("products").delete().in("merchant_id", ids);
    await supabase.from("merchants").delete().in("id", ids);

    console.log("✅ Demo merchants cleaned up.");
    process.exit(0);
}

// ── Helpers ──
function uuid() { return crypto.randomUUID(); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return Math.round((Math.random() * (max - min) + min) * 100000) / 100000; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const store = (id) => `https://images.unsplash.com/${id}?w=800&h=800&fit=crop&q=85`;

// ── 35 demo merchants across Toulouse ──
// Centre: 43.6047, 1.4442 — spread ~3km radius
const DEMO_MERCHANTS = [
    // ─── Capitole / Hypercentre ───
    { name: "Atelier Victoire", address: "12 rue de la Pomme", lat: 43.6040, lng: 1.4430, cat: "mode", photo: "photo-1441984904996-e0b6ba687e04" },
    { name: "Comptoir des Cotonniers", address: "5 rue Saint-Antoine", lat: 43.6025, lng: 1.4460, cat: "mode", photo: "photo-1528698827591-e19cef1a992c" },
    { name: "Run & Co", address: "18 allées Jean Jaurès", lat: 43.6062, lng: 1.4500, cat: "sport", photo: "photo-1556906781-9a412961c28c" },
    { name: "Le Petit Souk", address: "27 rue Croix-Baragnon", lat: 43.5990, lng: 1.4470, cat: "décoration", photo: "photo-1555041469-a586c61ea9bc" },
    { name: "Lunettes & Co", address: "3 place Esquirol", lat: 43.6000, lng: 1.4440, cat: "optique", photo: "photo-1574258495973-f010dfbb5371" },

    // ─── Carmes / Saint-Étienne ───
    { name: "Maison Bleue", address: "15 rue des Filatiers", lat: 43.5975, lng: 1.4415, cat: "mode", photo: "photo-1567401893414-76b7b1e5a7a5" },
    { name: "Librairie Ombres Blanches", address: "50 rue Gambetta", lat: 43.5985, lng: 1.4395, cat: "livres", photo: "photo-1526243741027-444d633d7365" },
    { name: "Bazar Chic", address: "9 rue Boulbonne", lat: 43.5995, lng: 1.4485, cat: "accessoires", photo: "photo-1558618666-fcd25c85f82e" },
    { name: "Pâtisserie Manou", address: "41 rue Pharaon", lat: 43.5965, lng: 1.4450, cat: "alimentaire", photo: "photo-1517433670267-08bbd4be890f" },
    { name: "Cave des Jacobins", address: "12 rue des Jacobins", lat: 43.5988, lng: 1.4405, cat: "vins", photo: "photo-1506377247377-2a5b3b417ebb" },

    // ─── Saint-Cyprien ───
    { name: "Galerie 21", address: "21 rue de la République", lat: 43.5990, lng: 1.4330, cat: "art", photo: "photo-1577720643272-265f09367456" },
    { name: "Vélo City", address: "6 avenue de Muret", lat: 43.5940, lng: 1.4310, cat: "sport", photo: "photo-1571188654248-7a89013e8be8" },
    { name: "Roots Vintage", address: "33 rue Réclusane", lat: 43.5968, lng: 1.4345, cat: "vintage", photo: "photo-1558171813-4c088753af8f" },
    { name: "Chez Léonie", address: "8 place de la Patte d'Oie", lat: 43.5920, lng: 1.4290, cat: "mode", photo: "photo-1490481651871-ab68de25d43d" },

    // ─── Jean Jaurès / Marengo ───
    { name: "Tech Avenue", address: "45 allées Jean Jaurès", lat: 43.6070, lng: 1.4530, cat: "électronique", photo: "photo-1531297484001-80022131f5a1" },
    { name: "Pharmacie du Capitole", address: "2 rue de Metz", lat: 43.6035, lng: 1.4475, cat: "pharmacie", photo: "photo-1576602976047-174e57a47881" },
    { name: "Parfumerie Nolwen", address: "17 rue Alsace", lat: 43.6080, lng: 1.4495, cat: "beauté", photo: "photo-1522335789203-aabd1fc54bc9" },
    { name: "Kids Factory", address: "28 boulevard de Strasbourg", lat: 43.6085, lng: 1.4465, cat: "enfants", photo: "photo-1515488042361-ee00e0ddd4e4" },

    // ─── Saint-Aubin / Bonnefoy ───
    { name: "Fripes & Folk", address: "14 rue Matabiau", lat: 43.6110, lng: 1.4510, cat: "vintage", photo: "photo-1551488831-00ddcb6c6bd3" },
    { name: "Le Grenier Sport", address: "7 place Saint-Aubin", lat: 43.6075, lng: 1.4545, cat: "sport", photo: "photo-1556906781-9a412961c28c" },
    { name: "Fleur de Sel", address: "22 rue Bonnefoy", lat: 43.6115, lng: 1.4570, cat: "alimentaire", photo: "photo-1471943311424-646960669fbc" },

    // ─── Minimes / Compans ───
    { name: "Boutique Ariane", address: "55 avenue des Minimes", lat: 43.6160, lng: 1.4400, cat: "mode", photo: "photo-1441986300917-64674bd600d8" },
    { name: "L'Atelier du Cuir", address: "3 rue des Fontaines", lat: 43.6130, lng: 1.4420, cat: "maroquinerie", photo: "photo-1548036328-c9fa89d128fa" },
    { name: "Cycles Occitans", address: "19 rue Agathoise", lat: 43.6145, lng: 1.4380, cat: "sport", photo: "photo-1507003211169-0a1dd7228f2d" },

    // ─── Rangueil / Saint-Agne ───
    { name: "Bio & Local", address: "102 avenue de Rangueil", lat: 43.5850, lng: 1.4530, cat: "alimentaire", photo: "photo-1542838132-92c53300491e" },
    { name: "Outdoor Lab", address: "15 route de Narbonne", lat: 43.5790, lng: 1.4610, cat: "sport", photo: "photo-1445205170230-053b83016050" },
    { name: "La Fabrique", address: "8 rue Saint-Agne", lat: 43.5870, lng: 1.4440, cat: "artisanat", photo: "photo-1513364776144-60967b0f800f" },

    // ─── Côte Pavée / Guilhemery ───
    { name: "Optic Studio", address: "44 Grande Rue Saint-Michel", lat: 43.5930, lng: 1.4560, cat: "optique", photo: "photo-1511499767150-a48a237f0083" },
    { name: "Maroquinerie du Sud", address: "11 rue Ozenne", lat: 43.5955, lng: 1.4500, cat: "maroquinerie", photo: "photo-1547949003-9792a18a2601" },

    // ─── Lardenne / Purpan ───
    { name: "Garden Style", address: "70 route de Bayonne", lat: 43.6030, lng: 1.3950, cat: "jardinerie", photo: "photo-1416879595882-3373a0480b5b" },
    { name: "Zap Electronics", address: "CC Purpan", lat: 43.6100, lng: 1.4050, cat: "électronique", photo: "photo-1518770660439-4636190af475" },

    // ─── Borderouge / Trois-Cocus ───
    { name: "Happy Kids", address: "Centre Borderouge", lat: 43.6350, lng: 1.4480, cat: "enfants", photo: "photo-1566576912321-d58ddd7a6088" },
    { name: "So Sport", address: "24 chemin de Borderouge", lat: 43.6320, lng: 1.4510, cat: "sport", photo: "photo-1461896836934-bd45ba8f8e62" },

    // ─── Balma / L'Union (périphérie) ───
    { name: "Déco & Sens", address: "ZAC de Balma", lat: 43.6090, lng: 1.4890, cat: "décoration", photo: "photo-1586023492125-27b2c045efd7" },
    { name: "Sneaker Vault", address: "15 route de Lavaur", lat: 43.6250, lng: 1.4750, cat: "chaussures", photo: "photo-1552346154-21d32810aba3" },
];

async function seed() {
    console.log(`Seeding ${DEMO_MERCHANTS.length} demo merchants...`);

    // Create one auth user per demo merchant
    const userIds = [];
    for (let i = 0; i < DEMO_MERCHANTS.length; i++) {
        const email = `demo-map-${i}@twostep.local`;
        const { data } = await supabase.auth.admin.createUser({
            email,
            password: crypto.randomUUID(),
            user_metadata: { role: "demo" },
            email_confirm: true,
        });
        if (data?.user) {
            userIds.push(data.user.id);
        } else {
            // User might already exist — find it
            const { data: list } = await supabase.auth.admin.listUsers();
            const existing = list?.users?.find(u => u.email === email);
            userIds.push(existing?.id ?? uuid());
        }
    }

    const merchantRows = DEMO_MERCHANTS.map((m, i) => {
        const jLat = m.lat + rand(-0.001, 0.001);
        const jLng = m.lng + rand(-0.001, 0.001);
        return {
            id: uuid(),
            user_id: userIds[i],
            name: m.name,
            address: m.address,
            city: "Toulouse",
            location: `SRID=4326;POINT(${jLng} ${jLat})`,
            status: "active",
            description: `${m.cat.charAt(0).toUpperCase() + m.cat.slice(1)} — ${m.name}`,
            photo_url: store(m.photo),
            phone: `05 ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)}`,
            plan: "free",
            launch_cohort: DEMO_COHORT,
            siret_verified: true,
            opening_hours: {
                monday: { open: "10:00", close: "19:00" },
                tuesday: { open: "10:00", close: "19:00" },
                wednesday: { open: "10:00", close: "19:00" },
                thursday: { open: "10:00", close: "19:00" },
                friday: { open: "10:00", close: "19:30" },
                saturday: { open: "09:30", close: "19:30" },
            },
        };
    });

    const { error } = await supabase.from("merchants").insert(merchantRows);
    if (error) {
        console.error("Failed to insert merchants:", error.message);
        process.exit(1);
    }

    // Add 3-5 dummy products per merchant so they show up in queries
    const products = [];
    const stock = [];
    const PRODUCT_NAMES = [
        "T-shirt essentiel", "Jean slim", "Sneakers classic", "Sac bandoulière",
        "Veste légère", "Pull col rond", "Chemise lin", "Short chino",
        "Robe midi", "Blazer coton", "Baskets runner", "Écharpe laine",
        "Casquette logo", "Ceinture cuir", "Montre classique", "Lunettes soleil",
    ];

    for (const merchant of merchantRows) {
        const count = randInt(3, 6);
        for (let i = 0; i < count; i++) {
            const pid = uuid();
            products.push({
                id: pid,
                merchant_id: merchant.id,
                name: pick(PRODUCT_NAMES),
                price: randInt(15, 189) + 0.99,
                category: pick(["mode", "chaussures", "accessoires", "sport", "beauté"]),
                visible: true,
                created_at: new Date().toISOString(),
            });
            stock.push({
                product_id: pid,
                quantity: randInt(1, 20),
            });
        }
    }

    const { error: prodErr } = await supabase.from("products").insert(products);
    if (prodErr) console.error("Products error:", prodErr.message);

    const { error: stockErr } = await supabase.from("stock").insert(stock);
    if (stockErr) console.error("Stock error:", stockErr.message);

    console.log(`✅ ${merchantRows.length} demo merchants + ${products.length} products inserted.`);
    console.log(`   Tag: launch_cohort = ${DEMO_COHORT}`);
    console.log(`   Cleanup: node scripts/seed-demo-merchants.mjs --clean`);
}

seed();
