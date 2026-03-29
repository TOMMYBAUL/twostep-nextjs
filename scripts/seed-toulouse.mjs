/**
 * Two-Step — Seed script: 8 premium Toulouse merchants with POS-like size variants
 *
 * Simulates the real POS sync workflow:
 *   1. Products arrive with size in name (e.g. "Air Force 1 '07 — 42")
 *   2. Same EAN prefix (12 chars) groups size variants together
 *   3. A principal is elected, available_sizes computed, variants hidden
 *
 * Usage:
 *   node scripts/seed-toulouse.mjs
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
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

// ─── Utility ─────────────────────────────────────────────

function uuid() { return crypto.randomUUID(); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return Math.round((Math.random() * (max - min) + min) * 100) / 100; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function futureDate(d) { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString(); }
function pastDate(d) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString(); }

/** Pick a random subset of `n` items from array */
function sample(arr, n) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, arr.length));
}

// ─── Photo helpers (Unsplash HD) ─────────────────────────

const cover = (id) => `https://images.unsplash.com/${id}?w=1400&h=700&fit=crop&q=85`;
const store = (id) => `https://images.unsplash.com/${id}?w=800&h=800&fit=crop&q=85`;
const logo  = (id) => `https://images.unsplash.com/${id}?w=200&h=200&fit=crop&q=85`;
const prod  = (id) => `https://images.unsplash.com/${id}?w=800&h=800&fit=crop&q=85`;

// ─── Size definitions ────────────────────────────────────

const SHOE_SIZES = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45];
const CLOTHING_SIZES = ["XS", "S", "M", "L", "XL"];

/** How many sizes each product gets */
function randomSizeSubset(sizeType) {
    if (sizeType === "shoe") return sample(SHOE_SIZES, randInt(5, 7));
    if (sizeType === "clothing") return sample(CLOTHING_SIZES, randInt(3, 5));
    return [];
}

// ─── 8 Premium Toulouse Merchants ────────────────────────

const MERCHANTS = [
    {
        name: "Chez Simone",
        address: "34 rue Pharaon", city: "Toulouse", quartier: "Saint-Étienne",
        lat: 43.596285, lng: 1.444322,
        description: "Prêt-à-porter femme — Sézane, Bash, Des Petits Hauts, Marie Sixtine. Sélection bohème-chic dans un écrin de pierre rose, au cœur du quartier des antiquaires.",
        category: "mode", sizeType: "clothing",
        phone: "05 61 90 12 56",
        opening_hours: { tuesday: { open: "10:30", close: "19:00" }, wednesday: { open: "10:30", close: "19:00" }, thursday: { open: "10:30", close: "19:00" }, friday: { open: "10:30", close: "19:30" }, saturday: { open: "10:00", close: "19:30" } },
        photo_url: store("photo-1441986300917-64674bd600d8"),
        cover_photo_url: cover("photo-1490481651871-ab68de25d43d"),
        logo_url: logo("photo-1558171813-4c088753af8f"),
    },
    {
        name: "Urban Mix",
        address: "38 boulevard de Strasbourg", city: "Toulouse", quartier: "Matabiau",
        lat: 43.60837, lng: 1.446218,
        description: "Streetwear & culture urbaine — The North Face, Stüssy, Carhartt WIP, New Era. Éditions limitées et exclusivités.",
        category: "mode", sizeType: "clothing",
        phone: "05 61 67 89 34",
        opening_hours: { monday: { open: "10:30", close: "19:00" }, tuesday: { open: "10:30", close: "19:00" }, wednesday: { open: "10:30", close: "19:00" }, thursday: { open: "10:30", close: "19:00" }, friday: { open: "10:30", close: "19:30" }, saturday: { open: "10:00", close: "19:30" } },
        photo_url: store("photo-1567401893414-76b7b1e5a7a5"),
        cover_photo_url: cover("photo-1551488831-00ddcb6c6bd3"),
        logo_url: logo("photo-1556821840-3a63f95609a7"),
    },
    {
        name: "Sneakers District",
        address: "8 rue Saint-Rome", city: "Toulouse", quartier: "Capitole",
        lat: 43.601889, lng: 1.443604,
        description: "Sneakers premium — Nike, Adidas, New Balance, Asics. Éditions limitées, restocks, et classiques intemporels.",
        category: "chaussures", sizeType: "shoe",
        phone: "05 61 34 56 78",
        opening_hours: { monday: { open: "10:30", close: "19:00" }, tuesday: { open: "10:30", close: "19:00" }, wednesday: { open: "10:30", close: "19:00" }, thursday: { open: "10:30", close: "19:00" }, friday: { open: "10:30", close: "19:30" }, saturday: { open: "10:00", close: "20:00" } },
        photo_url: store("photo-1552346154-21d32810aba3"),
        cover_photo_url: cover("photo-1556906781-9a412961c28c"),
        logo_url: logo("photo-1549298916-b41d501d3772"),
    },
    {
        name: "L'Écrin Doré",
        address: "22 rue de Metz", city: "Toulouse", quartier: "Esquirol",
        lat: 43.600145, lng: 1.443063,
        description: "Bijouterie & horlogerie — Pandora, Swarovski, Seiko, Daniel Wellington. Gravure et réparation sur place.",
        category: "bijoux", sizeType: null,
        phone: "05 61 45 67 89",
        opening_hours: { monday: { open: "10:00", close: "19:00" }, tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "10:00", close: "19:00" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "19:00" }, saturday: { open: "10:00", close: "19:00" } },
        photo_url: store("photo-1573408301185-9146fe634ad0"),
        cover_photo_url: cover("photo-1611652022419-a9419f74343d"),
        logo_url: logo("photo-1599643478518-a784e5dc4c8f"),
    },
    {
        name: "Maison Parfu'M",
        address: "17 rue Croix-Baragnon", city: "Toulouse", quartier: "Saint-Étienne",
        lat: 43.599614, lng: 1.446642,
        description: "Parfumerie de niche & beauté — Diptyque, Byredo, Le Labo, Nuxe, Caudalie.",
        category: "beaute", sizeType: null,
        phone: "05 61 01 23 45",
        opening_hours: { tuesday: { open: "10:30", close: "19:00" }, wednesday: { open: "10:30", close: "19:00" }, thursday: { open: "10:30", close: "19:00" }, friday: { open: "10:30", close: "19:30" }, saturday: { open: "10:00", close: "19:00" } },
        photo_url: store("photo-1522335789203-aabd1fc54bc9"),
        cover_photo_url: cover("photo-1596462502278-27bfdc403348"),
        logo_url: logo("photo-1563170351-be82bc888aa4"),
    },
    {
        name: "Run & Trail Toulouse",
        address: "12 rue Bayard", city: "Toulouse", quartier: "Jean-Jaurès",
        lat: 43.608577, lng: 1.447441,
        description: "Spécialiste running & trail — Hoka, Salomon, Brooks, Garmin. Analyse de foulée gratuite.",
        category: "sport", sizeType: "shoe",
        phone: "05 61 78 90 12",
        opening_hours: { tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "10:00", close: "19:00" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "19:30" }, saturday: { open: "09:30", close: "19:00" } },
        photo_url: store("photo-1460353581641-37baddab0fa2"),
        cover_photo_url: cover("photo-1476480862126-209bfaa8edc8"),
        logo_url: logo("photo-1542291026-7eec264c27ff"),
    },
    {
        name: "Maison Pastel",
        address: "6 rue des Arts", city: "Toulouse", quartier: "Capitole",
        lat: 43.601987, lng: 1.445856,
        description: "Concept store déco & lifestyle — bougies artisanales, céramiques, linge de maison, objets design.",
        category: "deco", sizeType: null,
        phone: "05 61 55 44 33",
        opening_hours: { monday: { open: "10:00", close: "19:00" }, tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "10:00", close: "19:00" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "19:30" }, saturday: { open: "10:00", close: "19:30" } },
        photo_url: store("photo-1616046229478-9901c5536a45"),
        cover_photo_url: cover("photo-1615529182904-14819c35db37"),
        logo_url: logo("photo-1603006905003-be475563bc59"),
    },
    {
        name: "Les Canailles",
        address: "25 rue des Tourneurs", city: "Toulouse", quartier: "Carmes",
        lat: 43.598400, lng: 1.444500,
        description: "Épicerie fine & cave — cafés torréfiés à Toulouse, thés, confitures artisanales, vins naturels.",
        category: "epicerie", sizeType: null,
        phone: "05 61 22 33 44",
        opening_hours: { tuesday: { open: "09:30", close: "19:30" }, wednesday: { open: "09:30", close: "19:30" }, thursday: { open: "09:30", close: "19:30" }, friday: { open: "09:30", close: "20:00" }, saturday: { open: "09:00", close: "20:00" }, sunday: { open: "09:00", close: "13:00" } },
        photo_url: store("photo-1556742049-0cfed4f6a45d"),
        cover_photo_url: cover("photo-1543168256-418811576931"),
        logo_url: logo("photo-1559056199-641a0ac8b55e"),
    },
];

// ─── Product photos (Unsplash HD) ────────────────────────

const PRODUCT_PHOTOS = {
    "Robe midi fleurie":        prod("photo-1612336307429-8a898d10e223"),
    "Blouse en soie":           prod("photo-1564257631407-4deb1f99d992"),
    "Pull col V cachemire":     prod("photo-1620799140408-edc6dcb6d633"),
    "Jean flare taille haute":  prod("photo-1541099649105-f69ad21f3246"),
    "Trench classique":         prod("photo-1591047139829-d91aecb6caea"),
    "Jupe plissée midi":        prod("photo-1583496661160-fb5886a0aaaa"),
    "Cardigan oversize":        prod("photo-1578587018452-892bacefd3f2"),
    "Sac cabas cuir":           prod("photo-1548036328-c9fa89d128fa"),
    "Hoodie Logo":              prod("photo-1556821840-3a63f95609a7"),
    "T-shirt oversize":         prod("photo-1521572163474-6864f9cf17ab"),
    "Cargo pants":              prod("photo-1591195853828-11db59a44f6b"),
    "Casquette 9FORTY":         prod("photo-1576871337632-b9aef4c17ab9"),
    "Doudoune sans manches":    prod("photo-1544441893-675973e31985"),
    "Veste coach":              prod("photo-1609709295948-17d77cb2a69b"),
    "Sweat col rond":           prod("photo-1626497764746-6dc36546b388"),
    "Bob bucket hat":           prod("photo-1601637155580-ac6c49428450"),
    "Air Force 1 '07":          prod("photo-1606107557195-0e29a4b5b4aa"),
    "Stan Smith":               prod("photo-1520256862855-398228c41684"),
    "574 Classic":              prod("photo-1539185441755-769473a23570"),
    "Gel-1130":                 prod("photo-1542291026-7eec264c27ff"),
    "Old Skool":                prod("photo-1525966222134-fcfa99b8ae77"),
    "Chuck Taylor All Star":    prod("photo-1463100099107-aa0980c362e6"),
    "Clifton 9":                prod("photo-1551107696-a4b0c5a0d9a2"),
    "Speedcross 6":             prod("photo-1595341888016-a392ef81b7de"),
    "Bracelet Moments":         prod("photo-1535632066927-ab7c9ab60908"),
    "Collier Tennis":           prod("photo-1599643478518-a784e5dc4c8f"),
    "Boucles d'oreilles cristal": prod("photo-1605100804763-247f67b3557e"),
    "Montre Neutra Chrono":     prod("photo-1524592094714-0f0654e20314"),
    "Montre Presage":           prod("photo-1587836374828-4dbafa94cf0e"),
    "Montre Minuit Mesh":       prod("photo-1611591437281-460bfbe1220a"),
    "G-Shock GA-2100":          prod("photo-1614164185128-e4ec99c436d7"),
    "Charm Cœur":               prod("photo-1535632787350-4e68ef0ac584"),
    "Bougie Baies":             prod("photo-1572726729207-a78d6feb18d7"),
    "Eau de parfum Gypsy Water":prod("photo-1541643600914-78b084683601"),
    "Eau de parfum Santal 33":  prod("photo-1585386959984-a4155224a1ad"),
    "Crème Prodigieuse Boost":  prod("photo-1611930022073-b7a4ba5fcccd"),
    "Eau Micellaire":           prod("photo-1556228578-0d85b1a4d571"),
    "Vinosource-Hydra sérum":   prod("photo-1608248543803-ba4f8c70ae0b"),
    "Rose Hand Cream":          prod("photo-1571781926291-c477ebfd024b"),
    "Huile démaquillante":      prod("photo-1619451334792-150fd785ee74"),
    "Clifton 9 Running":        prod("photo-1551107696-a4b0c5a0d9a2"),
    "Speedcross 6 Trail":       prod("photo-1595341888016-a392ef81b7de"),
    "Ghost 15":                 prod("photo-1460353581641-37baddab0fa2"),
    "Forerunner 265":           prod("photo-1523275335684-37898b6baf30"),
    "Sac à dos Trail 15L":      prod("photo-1553062407-98eeb64c6a62"),
    "Legging Fly Fast":         prod("photo-1506629082955-511b1aa562c8"),
    "Brassière Impact Run":     prod("photo-1518459031867-a89b944bffe4"),
    "Chaussettes compression":  prod("photo-1556228453-efd6c1ff04f6"),
    "Bougie artisanale cèdre":  prod("photo-1572726729207-a78d6feb18d7"),
    "Vase en grès":             prod("photo-1631125915902-d8abe9225ff2"),
    "Coussin en lin":           prod("photo-1616627561950-9f746e330187"),
    "Carnet en cuir":           prod("photo-1531346878377-a5be20888e57"),
    "Tasse céramique":          prod("photo-1514228742587-6b1558fcca3d"),
    "Plaid en laine":           prod("photo-1600607687644-c7171b42498f"),
    "Diffuseur de parfum":      prod("photo-1608571423902-eed4a5ad8108"),
    "Miroir rond laiton":       prod("photo-1618220179428-22790b461013"),
    "Café grain Colombie":      prod("photo-1559056199-641a0ac8b55e"),
    "Thé matcha cérémonial":    prod("photo-1515823064-d6e0c04616a7"),
    "Confiture framboise":      prod("photo-1563805042-7684c019e1cb"),
    "Huile d'olive premium":    prod("photo-1474979266404-7eaacbcd87c5"),
    "Tablette chocolat noir":   prod("photo-1549007994-cb92caebd54b"),
    "Vin naturel rosé":         prod("photo-1558001373-7b93ee48ffa0"),
    "Fromage affiné":           prod("photo-1452195100486-9cc805987862"),
    "Miel de montagne":         prod("photo-1587049352846-4a222e784d38"),
};

// ─── Product catalogs ────────────────────────────────────
// eanPrefix: first 12 chars — variants share this prefix

const CATALOGS = {
    mode: [
        { name: "Robe midi fleurie",       brand: "Sézane",            priceRange: [120, 180], eanPrefix: "541234567890" },
        { name: "Blouse en soie",           brand: "Bash",              priceRange: [150, 220], eanPrefix: "541234567891" },
        { name: "Pull col V cachemire",     brand: "Des Petits Hauts",  priceRange: [129, 189], eanPrefix: "541234567892" },
        { name: "Jean flare taille haute",  brand: "Sézane",            priceRange: [110, 140], eanPrefix: "541234567893" },
        { name: "Trench classique",         brand: "Marie Sixtine",     priceRange: [200, 320], eanPrefix: "541234567894" },
        { name: "Jupe plissée midi",        brand: "Bash",              priceRange: [95, 130],  eanPrefix: "541234567895" },
        { name: "Cardigan oversize",        brand: "Des Petits Hauts",  priceRange: [89, 129],  eanPrefix: "541234567896" },
        { name: "Sac cabas cuir",           brand: "Polène",            priceRange: [180, 280], eanPrefix: "541234567897", noSize: true },
    ],
    streetwear: [
        { name: "Hoodie Logo",             brand: "Stüssy",         priceRange: [95, 130],  eanPrefix: "541234567900" },
        { name: "T-shirt oversize",        brand: "Carhartt WIP",   priceRange: [35, 55],   eanPrefix: "541234567901" },
        { name: "Cargo pants",             brand: "Dickies",        priceRange: [65, 89],   eanPrefix: "541234567902" },
        { name: "Casquette 9FORTY",        brand: "New Era",        priceRange: [25, 35],   eanPrefix: "541234567903", noSize: true },
        { name: "Doudoune sans manches",   brand: "The North Face", priceRange: [160, 220], eanPrefix: "541234567904" },
        { name: "Veste coach",             brand: "Stüssy",         priceRange: [130, 170], eanPrefix: "541234567905" },
        { name: "Sweat col rond",          brand: "Champion",       priceRange: [65, 89],   eanPrefix: "541234567906" },
        { name: "Bob bucket hat",          brand: "Carhartt WIP",   priceRange: [30, 45],   eanPrefix: "541234567907", noSize: true },
    ],
    chaussures: [
        { name: "Air Force 1 '07",      brand: "Nike",       priceRange: [110, 130], eanPrefix: "541234567910" },
        { name: "Stan Smith",            brand: "Adidas",     priceRange: [90, 110],  eanPrefix: "541234567911" },
        { name: "574 Classic",           brand: "New Balance", priceRange: [90, 120], eanPrefix: "541234567912" },
        { name: "Gel-1130",              brand: "Asics",      priceRange: [120, 140], eanPrefix: "541234567913" },
        { name: "Old Skool",             brand: "Vans",       priceRange: [70, 85],   eanPrefix: "541234567914" },
        { name: "Chuck Taylor All Star", brand: "Converse",   priceRange: [60, 80],   eanPrefix: "541234567915" },
        { name: "Clifton 9",             brand: "Hoka",       priceRange: [140, 160], eanPrefix: "541234567916" },
        { name: "Speedcross 6",          brand: "Salomon",    priceRange: [130, 150], eanPrefix: "541234567917" },
    ],
    bijoux: [
        { name: "Bracelet Moments",          brand: "Pandora",   priceRange: [59, 89] },
        { name: "Charm Cœur",                brand: "Pandora",   priceRange: [29, 49] },
        { name: "Collier Tennis",             brand: "Swarovski", priceRange: [89, 159] },
        { name: "Boucles d'oreilles cristal", brand: "Swarovski", priceRange: [49, 79] },
        { name: "Montre Neutra Chrono",       brand: "Fossil",   priceRange: [149, 199] },
        { name: "Montre Presage",             brand: "Seiko",    priceRange: [350, 500] },
        { name: "G-Shock GA-2100",            brand: "Casio",    priceRange: [99, 129] },
        { name: "Montre Minuit Mesh",         brand: "Cluse",    priceRange: [89, 109] },
    ],
    beaute: [
        { name: "Bougie Baies",              brand: "Diptyque",     priceRange: [62, 72] },
        { name: "Eau de parfum Gypsy Water", brand: "Byredo",       priceRange: [145, 195] },
        { name: "Eau de parfum Santal 33",   brand: "Le Labo",      priceRange: [160, 220] },
        { name: "Crème Prodigieuse Boost",   brand: "Nuxe",         priceRange: [29, 39] },
        { name: "Eau Micellaire",            brand: "Bioderma",     priceRange: [12, 18] },
        { name: "Vinosource-Hydra sérum",    brand: "Caudalie",     priceRange: [28, 38] },
        { name: "Rose Hand Cream",           brand: "Dr. Hauschka", priceRange: [15, 22] },
        { name: "Huile démaquillante",       brand: "Nuxe",         priceRange: [18, 26] },
    ],
    sport: [
        { name: "Clifton 9 Running",      brand: "Hoka",         priceRange: [140, 160], eanPrefix: "541234567920" },
        { name: "Speedcross 6 Trail",      brand: "Salomon",      priceRange: [130, 150], eanPrefix: "541234567921" },
        { name: "Ghost 15",                brand: "Brooks",       priceRange: [130, 150], eanPrefix: "541234567922" },
        { name: "Forerunner 265",          brand: "Garmin",       priceRange: [399, 449], eanPrefix: "541234567923", noSize: true },
        { name: "Sac à dos Trail 15L",     brand: "Salomon",      priceRange: [89, 120],  eanPrefix: "541234567924", noSize: true },
        { name: "Legging Fly Fast",        brand: "Under Armour", priceRange: [60, 80],   eanPrefix: "541234567925" },
        { name: "Brassière Impact Run",    brand: "New Balance",  priceRange: [35, 50],   eanPrefix: "541234567926" },
        { name: "Chaussettes compression", brand: "Compressport", priceRange: [15, 25],   eanPrefix: "541234567927" },
    ],
    deco: [
        { name: "Bougie artisanale cèdre", brand: "Cire Trudon",       priceRange: [45, 75] },
        { name: "Vase en grès",             brand: "Jars Céramistes",   priceRange: [35, 65] },
        { name: "Coussin en lin",           brand: "Maison de Vacances", priceRange: [55, 85] },
        { name: "Carnet en cuir",           brand: "Papier Tigre",      priceRange: [18, 32] },
        { name: "Tasse céramique",          brand: "Jars Céramistes",   priceRange: [22, 38] },
        { name: "Plaid en laine",           brand: "Moismont",          priceRange: [89, 145] },
        { name: "Diffuseur de parfum",      brand: "P.F. Candle Co.",   priceRange: [30, 48] },
        { name: "Miroir rond laiton",       brand: "Atelier",           priceRange: [45, 75] },
    ],
    epicerie: [
        { name: "Café grain Colombie",   brand: "Mokaflor",              priceRange: [9, 16] },
        { name: "Thé matcha cérémonial", brand: "Ippodo",                priceRange: [25, 42] },
        { name: "Confiture framboise",   brand: "Christine Ferber",      priceRange: [8, 14] },
        { name: "Huile d'olive premium", brand: "Château d'Estoublon",   priceRange: [15, 28] },
        { name: "Tablette chocolat noir", brand: "Maison Bonnat",        priceRange: [6, 12] },
        { name: "Vin naturel rosé",      brand: "Domaine du Possible",   priceRange: [12, 19] },
        { name: "Fromage affiné",        brand: "Xavier David",          priceRange: [8, 18] },
        { name: "Miel de montagne",      brand: "Miel Martine",          priceRange: [10, 18] },
    ],
};

function getCatalogForMerchant(m) {
    if (m.name === "Urban Mix") return CATALOGS.streetwear;
    return CATALOGS[m.category] || [];
}

// ─── EAN checksum digit ──────────────────────────────────

function eanCheckDigit(first12) {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        sum += parseInt(first12[i]) * (i % 2 === 0 ? 1 : 3);
    }
    return String((10 - (sum % 10)) % 10);
}

function makeEAN(prefix, idx) {
    // Replace last char of prefix with idx to create unique 12-char base, then add check digit
    const base = prefix.slice(0, 11) + String(idx % 10);
    return base + eanCheckDigit(base);
}

// ─── Seed Logic ─────────────────────────────────────────

async function seed() {
    console.log("🌱 Two-Step Seed — 8 Toulouse Merchants with POS-like size variants\n");

    // Cleanup
    console.log("Cleaning up previous seed data...");
    const { data: existingMerchants } = await supabase
        .from("merchants")
        .select("id, user_id")
        .eq("city", "Toulouse")
        .eq("status", "active")
        .like("phone", "05 61%");

    if (existingMerchants && existingMerchants.length > 0) {
        const merchantIds = existingMerchants.map((m) => m.id);
        const userIds = existingMerchants.map((m) => m.user_id);

        const { data: existingProducts } = await supabase
            .from("products")
            .select("id")
            .in("merchant_id", merchantIds);

        if (existingProducts && existingProducts.length > 0) {
            const productIds = existingProducts.map((p) => p.id);
            await supabase.from("favorites").delete().in("product_id", productIds);
            await supabase.from("feed_events").delete().in("product_id", productIds);
            await supabase.from("promotions").delete().in("product_id", productIds);
            await supabase.from("stock").delete().in("product_id", productIds);
            await supabase.from("products").delete().in("merchant_id", merchantIds);
        }

        await supabase.from("follows").delete().in("merchant_id", merchantIds);
        await supabase.from("feed_events").delete().in("merchant_id", merchantIds);
        await supabase.from("merchants").delete().in("id", merchantIds);

        for (const uid of userIds) {
            await supabase.auth.admin.deleteUser(uid);
        }
        console.log(`  Cleaned ${merchantIds.length} merchants.\n`);
    }

    // Create auth users
    console.log("Creating auth users...");
    const userIds = [];
    for (const m of MERCHANTS) {
        const email = `seed-${m.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}@demo.twostep.local`;
        const { data: user, error: userErr } = await supabase.auth.admin.createUser({
            email,
            password: `seed-demo-${uuid().slice(0, 8)}`,
            email_confirm: true,
            user_metadata: { role: "merchant", seed: true },
        });
        if (userErr) { console.error(`  Failed: ${m.name}:`, userErr.message); process.exit(1); }
        userIds.push(user.user.id);
    }
    console.log(`  ✓ ${userIds.length} users\n`);

    // Insert merchants
    console.log("Inserting merchants...");
    const merchantRows = MERCHANTS.map((m, i) => ({
        id: uuid(),
        user_id: userIds[i],
        name: m.name,
        address: m.address,
        city: m.city,
        location: `SRID=4326;POINT(${m.lng} ${m.lat})`,
        description: m.description,
        phone: m.phone,
        photo_url: m.photo_url,
        cover_photo_url: m.cover_photo_url,
        logo_url: m.logo_url,
        opening_hours: m.opening_hours,
        status: "active",
        plan: "free",
        launch_cohort: 1,
    }));

    const { error: merchantError } = await supabase.from("merchants").insert(merchantRows);
    if (merchantError) { console.error("Failed:", merchantError); process.exit(1); }
    console.log(`  ✓ ${merchantRows.length} merchants\n`);

    // Insert products with size variants
    console.log("Inserting products with size variants...");
    let totalProducts = 0;
    let totalVariants = 0;
    let totalPromos = 0;
    let totalEvents = 0;

    for (const merchantRow of merchantRows) {
        const merchantDef = MERCHANTS.find((m) => m.name === merchantRow.name);
        const catalog = getCatalogForMerchant(merchantDef);
        const sizeType = merchantDef.sizeType; // "shoe", "clothing", or null

        const numModels = Math.min(catalog.length, randInt(6, 8));
        const selectedModels = sample(catalog, numModels);

        const allProducts = [];   // all rows to insert (principals + variants)
        const modelGroups = [];   // { principalIdx, variants: [{idx, size, qty}] }

        for (const model of selectedModels) {
            const basePrice = rand(model.priceRange[0], model.priceRange[1]);
            const hasSizes = sizeType && !model.noSize && model.eanPrefix;

            if (hasSizes) {
                // Generate size variants like a real POS would
                const sizes = randomSizeSubset(sizeType);
                const group = { principalIdx: allProducts.length, variants: [] };

                for (let si = 0; si < sizes.length; si++) {
                    const size = String(sizes[si]);
                    const ean = makeEAN(model.eanPrefix, si);
                    const qty = Math.random() < 0.1 ? 0 : randInt(1, 8);

                    group.variants.push({ idx: allProducts.length, size, qty });

                    allProducts.push({
                        id: uuid(),
                        merchant_id: merchantRow.id,
                        name: `${model.name} — ${size}`,
                        brand: model.brand,
                        ean,
                        category: merchantDef.category,
                        price: basePrice,
                        size,
                        photo_url: PRODUCT_PHOTOS[model.name] || null,
                        visible: false, // will be set on principal after grouping
                        variant_of: null,
                        available_sizes: [],
                    });
                }

                modelGroups.push(group);
            } else {
                // No size — single product, directly visible
                const qty = Math.random() < 0.1 ? 0 : randInt(2, 30);
                const ean = model.eanPrefix ? makeEAN(model.eanPrefix, 0) : null;

                allProducts.push({
                    id: uuid(),
                    merchant_id: merchantRow.id,
                    name: model.name,
                    brand: model.brand,
                    ean,
                    category: merchantDef.category,
                    price: basePrice,
                    size: null,
                    photo_url: PRODUCT_PHOTOS[model.name] || null,
                    visible: true,
                    variant_of: null,
                    available_sizes: [],
                    _stockQty: qty,
                });
            }
        }

        // Apply grouping logic (like groupVariantsByEAN)
        for (const group of modelGroups) {
            const principalProduct = allProducts[group.principalIdx];

            // Build available_sizes
            const availableSizes = group.variants
                .map((v) => ({ size: v.size, quantity: v.qty }))
                .sort((a, b) => {
                    const na = parseFloat(a.size), nb = parseFloat(b.size);
                    if (!isNaN(na) && !isNaN(nb)) return na - nb;
                    const order = ["XXS", "XS", "S", "M", "L", "XL", "XXL"];
                    return order.indexOf(a.size) - order.indexOf(b.size);
                });

            const totalStock = availableSizes.reduce((s, v) => s + v.quantity, 0);

            // Principal: visible, has available_sizes, clean name (no size suffix)
            principalProduct.name = principalProduct.name.replace(/ — .+$/, "");
            principalProduct.visible = true;
            principalProduct.available_sizes = availableSizes;
            principalProduct._stockQty = totalStock;

            // Variants: point to principal
            for (let vi = 1; vi < group.variants.length; vi++) {
                const variantProduct = allProducts[group.variants[vi].idx];
                variantProduct.variant_of = principalProduct.id;
                variantProduct.visible = false;
                variantProduct._stockQty = group.variants[vi].qty;
            }
        }

        // Insert all products
        const insertRows = allProducts.map(({ _stockQty, ...rest }) => rest);
        const { error: prodError } = await supabase.from("products").insert(insertRows);
        if (prodError) { console.error(`  Products error for ${merchantRow.name}:`, prodError); continue; }

        // Insert stock
        const stockRows = allProducts.map((p) => ({
            product_id: p.id,
            quantity: p._stockQty ?? randInt(2, 30),
        }));
        await supabase.from("stock").insert(stockRows);

        // Promos on ~25% of visible products
        const visibleProducts = allProducts.filter((p) => p.visible);
        const promoProducts = visibleProducts.filter(() => Math.random() < 0.25);
        if (promoProducts.length > 0) {
            const promoRows = promoProducts.map((p) => ({
                product_id: p.id,
                sale_price: Math.round(p.price * (0.7 + Math.random() * 0.15) * 100) / 100,
                starts_at: pastDate(randInt(1, 7)),
                ends_at: futureDate(randInt(3, 21)),
            }));
            const { error: promoErr } = await supabase.from("promotions").insert(promoRows);
            if (!promoErr) totalPromos += promoRows.length;
        }

        // Feed events
        const feedEvents = visibleProducts.map((p) => ({
            merchant_id: merchantRow.id,
            product_id: p.id,
            event_type: "new_product",
            created_at: pastDate(randInt(1, 30)),
        }));
        for (const p of promoProducts) {
            feedEvents.push({
                merchant_id: merchantRow.id,
                product_id: p.id,
                event_type: "new_promo",
                created_at: pastDate(randInt(0, 5)),
            });
        }
        await supabase.from("feed_events").insert(feedEvents);
        totalEvents += feedEvents.length;

        const variantCount = allProducts.filter((p) => p.variant_of).length;
        totalProducts += visibleProducts.length;
        totalVariants += variantCount;
        console.log(`  ✓ ${merchantRow.name} — ${visibleProducts.length} produits (${variantCount} variantes taille)`);
    }

    console.log(`\n─── Summary ───`);
    console.log(`  Merchants:  ${merchantRows.length}`);
    console.log(`  Products:   ${totalProducts} visible (+ ${totalVariants} variantes)`);
    console.log(`  Promos:     ${totalPromos}`);
    console.log(`  Feed events: ${totalEvents}`);
    console.log(`\n✅ Seed complete!\n`);
}

seed().catch((err) => { console.error("Seed failed:", err); process.exit(1); });
