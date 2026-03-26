/**
 * Two-Step — Seed script: 8 premium Toulouse merchants with HD photos
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
        // Strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
    }
} catch {
    console.error("Could not read .env.local — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY manually");
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

function uuid() {
    return crypto.randomUUID();
}

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min, max) {
    return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function futureDate(daysAhead) {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString();
}

function pastDate(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
}

// ─── Unsplash HD helpers ─────────────────────────────────
// Cover photos: 1400x700 for wide banner
// Store photos: 800x800 square
// Product photos: 800x800 square, high quality
const cover = (id) => `https://images.unsplash.com/${id}?w=1400&h=700&fit=crop&q=85`;
const store = (id) => `https://images.unsplash.com/${id}?w=800&h=800&fit=crop&q=85`;
const logo  = (id) => `https://images.unsplash.com/${id}?w=200&h=200&fit=crop&q=85`;
const prod  = (id) => `https://images.unsplash.com/${id}?w=800&h=800&fit=crop&q=85`;

// ─── 8 Premium Toulouse Merchants ────────────────────────

const MERCHANTS = [
    {
        name: "Chez Simone",
        address: "34 rue Pharaon",
        city: "Toulouse",
        quartier: "Saint-Étienne",
        lat: 43.596285, lng: 1.444322,
        description: "Prêt-à-porter femme — Sézane, Bash, Des Petits Hauts, Marie Sixtine. Sélection bohème-chic dans un écrin de pierre rose, au cœur du quartier des antiquaires.",
        category: "mode",
        phone: "05 61 90 12 56",
        opening_hours: { tuesday: { open: "10:30", close: "19:00" }, wednesday: { open: "10:30", close: "19:00" }, thursday: { open: "10:30", close: "19:00" }, friday: { open: "10:30", close: "19:30" }, saturday: { open: "10:00", close: "19:30" } },
        photo_url:       store("photo-1441986300917-64674bd600d8"),
        cover_photo_url: cover("photo-1490481651871-ab68de25d43d"),
        logo_url:        logo("photo-1558171813-4c088753af8f"),
    },
    {
        name: "Urban Mix",
        address: "38 boulevard de Strasbourg",
        city: "Toulouse",
        quartier: "Matabiau",
        lat: 43.60837, lng: 1.446218,
        description: "Streetwear & culture urbaine — The North Face, Stüssy, Carhartt WIP, New Era. Éditions limitées et exclusivités.",
        category: "mode",
        phone: "05 61 67 89 34",
        opening_hours: { monday: { open: "10:30", close: "19:00" }, tuesday: { open: "10:30", close: "19:00" }, wednesday: { open: "10:30", close: "19:00" }, thursday: { open: "10:30", close: "19:00" }, friday: { open: "10:30", close: "19:30" }, saturday: { open: "10:00", close: "19:30" } },
        photo_url:       store("photo-1567401893414-76b7b1e5a7a5"),
        cover_photo_url: cover("photo-1551488831-00ddcb6c6bd3"),
        logo_url:        logo("photo-1556821840-3a63f95609a7"),
    },
    {
        name: "Sneakers District",
        address: "8 rue Saint-Rome",
        city: "Toulouse",
        quartier: "Capitole",
        lat: 43.601889, lng: 1.443604,
        description: "Sneakers premium — Nike, Adidas, New Balance, Asics. Éditions limitées, restocks, et classiques intemporels. Le temple de la sneaker à Toulouse.",
        category: "chaussures",
        phone: "05 61 34 56 78",
        opening_hours: { monday: { open: "10:30", close: "19:00" }, tuesday: { open: "10:30", close: "19:00" }, wednesday: { open: "10:30", close: "19:00" }, thursday: { open: "10:30", close: "19:00" }, friday: { open: "10:30", close: "19:30" }, saturday: { open: "10:00", close: "20:00" } },
        photo_url:       store("photo-1552346154-21d32810aba3"),
        cover_photo_url: cover("photo-1556906781-9a412961c28c"),
        logo_url:        logo("photo-1549298916-b41d501d3772"),
    },
    {
        name: "L'Écrin Doré",
        address: "22 rue de Metz",
        city: "Toulouse",
        quartier: "Esquirol",
        lat: 43.600145, lng: 1.443063,
        description: "Bijouterie & horlogerie — Pandora, Swarovski, Seiko, Daniel Wellington. Gravure et réparation sur place. Conseil personnalisé depuis 2008.",
        category: "bijoux",
        phone: "05 61 45 67 89",
        opening_hours: { monday: { open: "10:00", close: "19:00" }, tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "10:00", close: "19:00" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "19:00" }, saturday: { open: "10:00", close: "19:00" } },
        photo_url:       store("photo-1573408301185-9146fe634ad0"),
        cover_photo_url: cover("photo-1611652022419-a9419f74343d"),
        logo_url:        logo("photo-1599643478518-a784e5dc4c8f"),
    },
    {
        name: "Maison Parfu'M",
        address: "17 rue Croix-Baragnon",
        city: "Toulouse",
        quartier: "Saint-Étienne",
        lat: 43.599614, lng: 1.446642,
        description: "Parfumerie de niche & beauté — Diptyque, Byredo, Le Labo, Nuxe, Caudalie. Échantillons offerts, conseil olfactif sur rendez-vous.",
        category: "beaute",
        phone: "05 61 01 23 45",
        opening_hours: { tuesday: { open: "10:30", close: "19:00" }, wednesday: { open: "10:30", close: "19:00" }, thursday: { open: "10:30", close: "19:00" }, friday: { open: "10:30", close: "19:30" }, saturday: { open: "10:00", close: "19:00" } },
        photo_url:       store("photo-1522335789203-aabd1fc54bc9"),
        cover_photo_url: cover("photo-1596462502278-27bfdc403348"),
        logo_url:        logo("photo-1563170351-be82bc888aa4"),
    },
    {
        name: "Run & Trail Toulouse",
        address: "12 rue Bayard",
        city: "Toulouse",
        quartier: "Jean-Jaurès",
        lat: 43.608577, lng: 1.447441,
        description: "Spécialiste running & trail — Hoka, Salomon, Brooks, Garmin. Analyse de foulée gratuite. Communauté de coureurs, sorties hebdomadaires.",
        category: "sport",
        phone: "05 61 78 90 12",
        opening_hours: { tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "10:00", close: "19:00" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "19:30" }, saturday: { open: "09:30", close: "19:00" } },
        photo_url:       store("photo-1460353581641-37baddab0fa2"),
        cover_photo_url: cover("photo-1476480862126-209bfaa8edc8"),
        logo_url:        logo("photo-1542291026-7eec264c27ff"),
    },
    {
        name: "Maison Pastel",
        address: "6 rue des Arts",
        city: "Toulouse",
        quartier: "Capitole",
        lat: 43.601987, lng: 1.445856,
        description: "Concept store déco & lifestyle — bougies artisanales, céramiques, linge de maison, objets design. Cadeaux et art de vivre dans un lieu lumineux.",
        category: "deco",
        phone: "05 61 55 44 33",
        opening_hours: { monday: { open: "10:00", close: "19:00" }, tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "10:00", close: "19:00" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "19:30" }, saturday: { open: "10:00", close: "19:30" } },
        photo_url:       store("photo-1616046229478-9901c5536a45"),
        cover_photo_url: cover("photo-1615529182904-14819c35db37"),
        logo_url:        logo("photo-1603006905003-be475563bc59"),
    },
    {
        name: "Les Canailles",
        address: "25 rue des Tourneurs",
        city: "Toulouse",
        quartier: "Carmes",
        lat: 43.598400, lng: 1.444500,
        description: "Épicerie fine & cave — cafés torréfiés à Toulouse, thés, confitures artisanales, vins naturels, fromages affinés. Paniers cadeaux sur commande.",
        category: "epicerie",
        phone: "05 61 22 33 44",
        opening_hours: { tuesday: { open: "09:30", close: "19:30" }, wednesday: { open: "09:30", close: "19:30" }, thursday: { open: "09:30", close: "19:30" }, friday: { open: "09:30", close: "20:00" }, saturday: { open: "09:00", close: "20:00" }, sunday: { open: "09:00", close: "13:00" } },
        photo_url:       store("photo-1556742049-0cfed4f6a45d"),
        cover_photo_url: cover("photo-1543168256-418811576931"),
        logo_url:        logo("photo-1559056199-641a0ac8b55e"),
    },
];

// ─── Product photos (hand-curated HD) ────────────────────

const PRODUCT_PHOTOS = {
    // ─── MODE FEMME (Chez Simone) ───
    "Robe midi fleurie":        prod("photo-1612336307429-8a898d10e223"),
    "Blouse en soie":           prod("photo-1564257631407-4deb1f99d992"),
    "Pull col V cachemire":     prod("photo-1620799140408-edc6dcb6d633"),
    "Jean flare taille haute":  prod("photo-1541099649105-f69ad21f3246"),
    "Trench classique":         prod("photo-1591047139829-d91aecb6caea"),
    "Jupe plissée midi":        prod("photo-1583496661160-fb5886a0aaaa"),
    "Cardigan oversize":        prod("photo-1578587018452-892bacefd3f2"),
    "Sac cabas cuir":           prod("photo-1548036328-c9fa89d128fa"),
    // ─── STREETWEAR (Urban Mix) ───
    "Hoodie Logo":              prod("photo-1556821840-3a63f95609a7"),
    "T-shirt oversize":         prod("photo-1521572163474-6864f9cf17ab"),
    "Cargo pants":              prod("photo-1591195853828-11db59a44f6b"),
    "Casquette 9FORTY":         prod("photo-1576871337632-b9aef4c17ab9"),
    "Doudoune sans manches":    prod("photo-1544441893-675973e31985"),
    "Veste coach":              prod("photo-1609709295948-17d77cb2a69b"),
    "Sweat col rond":           prod("photo-1626497764746-6dc36546b388"),
    "Bob bucket hat":           prod("photo-1601637155580-ac6c49428450"),
    // ─── SNEAKERS ───
    "Air Force 1 '07":          prod("photo-1606107557195-0e29a4b5b4aa"),
    "Stan Smith":               prod("photo-1520256862855-398228c41684"),
    "574 Classic":              prod("photo-1539185441755-769473a23570"),
    "Gel-1130":                 prod("photo-1542291026-7eec264c27ff"),
    "Old Skool":                prod("photo-1525966222134-fcfa99b8ae77"),
    "Chuck Taylor All Star":    prod("photo-1463100099107-aa0980c362e6"),
    "Clifton 9":                prod("photo-1551107696-a4b0c5a0d9a2"),
    "Speedcross 6":             prod("photo-1595341888016-a392ef81b7de"),
    // ─── BIJOUX ───
    "Bracelet Moments":         prod("photo-1535632066927-ab7c9ab60908"),
    "Collier Tennis":           prod("photo-1599643478518-a784e5dc4c8f"),
    "Boucles d'oreilles cristal": prod("photo-1605100804763-247f67b3557e"),
    "Montre Neutra Chrono":     prod("photo-1524592094714-0f0654e20314"),
    "Montre Presage":           prod("photo-1587836374828-4dbafa94cf0e"),
    "Montre Minuit Mesh":       prod("photo-1611591437281-460bfbe1220a"),
    "G-Shock GA-2100":          prod("photo-1614164185128-e4ec99c436d7"),
    "Charm Cœur":               prod("photo-1535632787350-4e68ef0ac584"),
    // ─── BEAUTÉ ───
    "Bougie Baies":             prod("photo-1572726729207-a78d6feb18d7"),
    "Eau de parfum Gypsy Water":prod("photo-1541643600914-78b084683601"),
    "Eau de parfum Santal 33":  prod("photo-1585386959984-a4155224a1ad"),
    "Crème Prodigieuse Boost":  prod("photo-1611930022073-b7a4ba5fcccd"),
    "Eau Micellaire":           prod("photo-1556228578-0d85b1a4d571"),
    "Vinosource-Hydra sérum":   prod("photo-1608248543803-ba4f8c70ae0b"),
    "Rose Hand Cream":          prod("photo-1571781926291-c477ebfd024b"),
    "Huile démaquillante":      prod("photo-1619451334792-150fd785ee74"),
    // ─── SPORT ───
    "Clifton 9 Running":        prod("photo-1551107696-a4b0c5a0d9a2"),
    "Speedcross 6 Trail":       prod("photo-1595341888016-a392ef81b7de"),
    "Ghost 15":                 prod("photo-1460353581641-37baddab0fa2"),
    "Forerunner 265":           prod("photo-1523275335684-37898b6baf30"),
    "Sac à dos Trail 15L":      prod("photo-1553062407-98eeb64c6a62"),
    "Legging Fly Fast":         prod("photo-1506629082955-511b1aa562c8"),
    "Brassière Impact Run":     prod("photo-1518459031867-a89b944bffe4"),
    "Chaussettes compression":  prod("photo-1556228453-efd6c1ff04f6"),
    // ─── DÉCO ───
    "Bougie artisanale cèdre":  prod("photo-1572726729207-a78d6feb18d7"),
    "Vase en grès":             prod("photo-1631125915902-d8abe9225ff2"),
    "Coussin en lin":           prod("photo-1616627561950-9f746e330187"),
    "Carnet en cuir":           prod("photo-1531346878377-a5be20888e57"),
    "Tasse céramique":          prod("photo-1514228742587-6b1558fcca3d"),
    "Plaid en laine":           prod("photo-1600607687644-c7171b42498f"),
    "Diffuseur de parfum":      prod("photo-1608571423902-eed4a5ad8108"),
    "Miroir rond laiton":       prod("photo-1618220179428-22790b461013"),
    // ─── ÉPICERIE ───
    "Café grain Colombie":      prod("photo-1559056199-641a0ac8b55e"),
    "Thé matcha cérémonial":    prod("photo-1515823064-d6e0c04616a7"),
    "Confiture framboise":      prod("photo-1563805042-7684c019e1cb"),
    "Huile d'olive premium":    prod("photo-1474979266404-7eaacbcd87c5"),
    "Tablette chocolat noir":   prod("photo-1549007994-cb92caebd54b"),
    "Vin naturel rosé":         prod("photo-1558001373-7b93ee48ffa0"),
    "Fromage affiné":           prod("photo-1452195100486-9cc805987862"),
    "Miel de montagne":         prod("photo-1587049352846-4a222e784d38"),
};

// ─── Product catalogs per category ───────────────────────

const PRODUCT_CATALOGS = {
    mode: [
        { name: "Robe midi fleurie", brand: "Sézane", priceRange: [120, 180], ean: "5412345678907" },
        { name: "Blouse en soie", brand: "Bash", priceRange: [150, 220], ean: "5412345678908" },
        { name: "Pull col V cachemire", brand: "Des Petits Hauts", priceRange: [129, 189], ean: "5412345678910" },
        { name: "Jean flare taille haute", brand: "Sézane", priceRange: [110, 140], ean: "5412345678916" },
        { name: "Trench classique", brand: "Marie Sixtine", priceRange: [200, 320], ean: "5412345678912" },
        { name: "Jupe plissée midi", brand: "Bash", priceRange: [95, 130], ean: "5412345678917" },
        { name: "Cardigan oversize", brand: "Des Petits Hauts", priceRange: [89, 129], ean: "5412345678918" },
        { name: "Sac cabas cuir", brand: "Polène", priceRange: [180, 280], ean: "5412345678919" },
    ],
    streetwear: [
        { name: "Hoodie Logo", brand: "Stüssy", priceRange: [95, 130], ean: "5412345678914" },
        { name: "T-shirt oversize", brand: "Carhartt WIP", priceRange: [35, 55], ean: "5412345678901" },
        { name: "Cargo pants", brand: "Dickies", priceRange: [65, 89], ean: "5412345678915" },
        { name: "Casquette 9FORTY", brand: "New Era", priceRange: [25, 35], ean: "5412345678913" },
        { name: "Doudoune sans manches", brand: "The North Face", priceRange: [160, 220], ean: "5412345678911" },
        { name: "Veste coach", brand: "Stüssy", priceRange: [130, 170], ean: "5412345678920" },
        { name: "Sweat col rond", brand: "Champion", priceRange: [65, 89], ean: "5412345678921" },
        { name: "Bob bucket hat", brand: "Carhartt WIP", priceRange: [30, 45], ean: "5412345678922" },
    ],
    chaussures: [
        { name: "Air Force 1 '07", brand: "Nike", priceRange: [110, 130], ean: "5412345679001" },
        { name: "Stan Smith", brand: "Adidas", priceRange: [90, 110], ean: "5412345679002" },
        { name: "574 Classic", brand: "New Balance", priceRange: [90, 120], ean: "5412345679003" },
        { name: "Gel-1130", brand: "Asics", priceRange: [120, 140], ean: "5412345679004" },
        { name: "Old Skool", brand: "Vans", priceRange: [70, 85], ean: "5412345679005" },
        { name: "Chuck Taylor All Star", brand: "Converse", priceRange: [60, 80], ean: "5412345679007" },
        { name: "Clifton 9", brand: "Hoka", priceRange: [140, 160], ean: "5412345679011" },
        { name: "Speedcross 6", brand: "Salomon", priceRange: [130, 150], ean: "5412345679012" },
    ],
    bijoux: [
        { name: "Bracelet Moments", brand: "Pandora", priceRange: [59, 89], ean: "5412345679101" },
        { name: "Charm Cœur", brand: "Pandora", priceRange: [29, 49], ean: "5412345679102" },
        { name: "Collier Tennis", brand: "Swarovski", priceRange: [89, 159], ean: "5412345679103" },
        { name: "Boucles d'oreilles cristal", brand: "Swarovski", priceRange: [49, 79], ean: "5412345679104" },
        { name: "Montre Neutra Chrono", brand: "Fossil", priceRange: [149, 199], ean: "5412345679105" },
        { name: "Montre Presage", brand: "Seiko", priceRange: [350, 500], ean: "5412345679107" },
        { name: "G-Shock GA-2100", brand: "Casio", priceRange: [99, 129], ean: "5412345679109" },
        { name: "Montre Minuit Mesh", brand: "Cluse", priceRange: [89, 109], ean: "5412345679110" },
    ],
    beaute: [
        { name: "Bougie Baies", brand: "Diptyque", priceRange: [62, 72], ean: "5412345679305" },
        { name: "Eau de parfum Gypsy Water", brand: "Byredo", priceRange: [145, 195], ean: "5412345679306" },
        { name: "Eau de parfum Santal 33", brand: "Le Labo", priceRange: [160, 220], ean: "5412345679307" },
        { name: "Crème Prodigieuse Boost", brand: "Nuxe", priceRange: [29, 39], ean: "5412345679301" },
        { name: "Eau Micellaire", brand: "Bioderma", priceRange: [12, 18], ean: "5412345679302" },
        { name: "Vinosource-Hydra sérum", brand: "Caudalie", priceRange: [28, 38], ean: "5412345679304" },
        { name: "Rose Hand Cream", brand: "Dr. Hauschka", priceRange: [15, 22], ean: "5412345679308" },
        { name: "Huile démaquillante", brand: "Nuxe", priceRange: [18, 26], ean: "5412345679311" },
    ],
    sport: [
        { name: "Clifton 9 Running", brand: "Hoka", priceRange: [140, 160], ean: "5412345679411" },
        { name: "Speedcross 6 Trail", brand: "Salomon", priceRange: [130, 150], ean: "5412345679412" },
        { name: "Ghost 15", brand: "Brooks", priceRange: [130, 150], ean: "5412345679413" },
        { name: "Forerunner 265", brand: "Garmin", priceRange: [399, 449], ean: "5412345679210" },
        { name: "Sac à dos Trail 15L", brand: "Salomon", priceRange: [89, 120], ean: "5412345679405" },
        { name: "Legging Fly Fast", brand: "Under Armour", priceRange: [60, 80], ean: "5412345679402" },
        { name: "Brassière Impact Run", brand: "New Balance", priceRange: [35, 50], ean: "5412345679403" },
        { name: "Chaussettes compression", brand: "Compressport", priceRange: [15, 25], ean: "5412345679407" },
    ],
    deco: [
        { name: "Bougie artisanale cèdre", brand: "Cire Trudon", priceRange: [45, 75], ean: "5412345679801" },
        { name: "Vase en grès", brand: "Jars Céramistes", priceRange: [35, 65], ean: "5412345679802" },
        { name: "Coussin en lin", brand: "Maison de Vacances", priceRange: [55, 85], ean: "5412345679803" },
        { name: "Carnet en cuir", brand: "Papier Tigre", priceRange: [18, 32], ean: "5412345679804" },
        { name: "Tasse céramique", brand: "Jars Céramistes", priceRange: [22, 38], ean: "5412345679805" },
        { name: "Plaid en laine", brand: "Moismont", priceRange: [89, 145], ean: "5412345679806" },
        { name: "Diffuseur de parfum", brand: "P.F. Candle Co.", priceRange: [30, 48], ean: "5412345679807" },
        { name: "Miroir rond laiton", brand: "Atelier", priceRange: [45, 75], ean: "5412345679808" },
    ],
    epicerie: [
        { name: "Café grain Colombie", brand: "Mokaflor", priceRange: [9, 16], ean: "5412345679901" },
        { name: "Thé matcha cérémonial", brand: "Ippodo", priceRange: [25, 42], ean: "5412345679902" },
        { name: "Confiture framboise", brand: "Christine Ferber", priceRange: [8, 14], ean: "5412345679903" },
        { name: "Huile d'olive premium", brand: "Château d'Estoublon", priceRange: [15, 28], ean: "5412345679904" },
        { name: "Tablette chocolat noir", brand: "Maison Bonnat", priceRange: [6, 12], ean: "5412345679905" },
        { name: "Vin naturel rosé", brand: "Domaine du Possible", priceRange: [12, 19], ean: "5412345679906" },
        { name: "Fromage affiné", brand: "Xavier David", priceRange: [8, 18], ean: "5412345679907" },
        { name: "Miel de montagne", brand: "Miel Martine", priceRange: [10, 18], ean: "5412345679908" },
    ],
};

// Map merchant category to product catalog
const CATEGORY_MAP = {
    mode: "mode",
    chaussures: "chaussures",
    bijoux: "bijoux",
    beaute: "beaute",
    sport: "sport",
    deco: "deco",
    epicerie: "epicerie",
};

// Urban Mix uses streetwear catalog, not mode
function getCatalogForMerchant(m) {
    if (m.name === "Urban Mix") return PRODUCT_CATALOGS.streetwear;
    return PRODUCT_CATALOGS[CATEGORY_MAP[m.category]] || [];
}

// ─── Seed Logic ─────────────────────────────────────────

async function seed() {
    console.log("🌱 Two-Step Seed — 8 Premium Toulouse Merchants\n");

    // Cleanup existing seed data (if re-running)
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

        // Get product IDs
        const { data: existingProducts } = await supabase
            .from("products")
            .select("id")
            .in("merchant_id", merchantIds);

        if (existingProducts && existingProducts.length > 0) {
            const productIds = existingProducts.map((p) => p.id);
            await supabase.from("feed_events").delete().in("product_id", productIds);
            await supabase.from("promotions").delete().in("product_id", productIds);
            await supabase.from("stock").delete().in("product_id", productIds);
            await supabase.from("products").delete().in("merchant_id", merchantIds);
        }

        await supabase.from("feed_events").delete().in("merchant_id", merchantIds);
        await supabase.from("merchants").delete().in("id", merchantIds);

        // Clean up seed auth users
        for (const uid of userIds) {
            await supabase.auth.admin.deleteUser(uid);
        }

        console.log(`  Cleaned ${merchantIds.length} merchants and their data.\n`);
    }

    // Create auth users for each merchant (FK requirement)
    console.log("Creating auth users for merchants...");
    const userIds = [];
    for (let i = 0; i < MERCHANTS.length; i++) {
        const m = MERCHANTS[i];
        const email = `seed-${m.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}@demo.twostep.local`;
        const { data: user, error: userErr } = await supabase.auth.admin.createUser({
            email,
            password: `seed-demo-${uuid().slice(0, 8)}`,
            email_confirm: true,
            user_metadata: { role: "merchant", seed: true },
        });
        if (userErr) {
            console.error(`  Failed to create user for ${m.name}:`, userErr.message);
            process.exit(1);
        }
        userIds.push(user.user.id);
    }
    console.log(`  ✓ ${userIds.length} auth users created\n`);

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
    if (merchantError) {
        console.error("Failed to insert merchants:", merchantError);
        process.exit(1);
    }
    console.log(`  ✓ ${merchantRows.length} merchants inserted\n`);

    // Insert products + stock for each merchant
    console.log("Inserting products and stock...");
    let totalProducts = 0;
    let totalPromos = 0;
    let totalEvents = 0;

    for (const merchantRow of merchantRows) {
        const merchantDef = MERCHANTS.find((m) => m.name === merchantRow.name);
        const catalog = getCatalogForMerchant(merchantDef);

        // Each merchant gets 6-8 products
        const numProducts = Math.min(catalog.length, randInt(6, 8));
        const selectedProducts = [...catalog].sort(() => Math.random() - 0.5).slice(0, numProducts);

        const productRows = selectedProducts.map((p) => ({
            id: uuid(),
            merchant_id: merchantRow.id,
            name: p.name,
            brand: p.brand,
            ean: p.ean,
            category: merchantDef.category,
            price: rand(p.priceRange[0], p.priceRange[1]),
            description: null,
            photo_url: PRODUCT_PHOTOS[p.name] || null,
        }));

        const { error: prodError } = await supabase.from("products").insert(productRows);
        if (prodError) {
            console.error(`  Failed to insert products for ${merchantRow.name}:`, prodError);
            continue;
        }

        // Insert stock for each product (90% in stock, 10% épuisé)
        const stockRows = productRows.map((p) => ({
            product_id: p.id,
            quantity: Math.random() < 0.1 ? 0 : randInt(2, 30),
        }));

        const { error: stockError } = await supabase.from("stock").insert(stockRows);
        if (stockError) {
            console.error(`  Failed to insert stock for ${merchantRow.name}:`, stockError);
        }

        // 25% of products get a promo (slightly more than before for a lively demo)
        const promoProducts = productRows.filter(() => Math.random() < 0.25);
        if (promoProducts.length > 0) {
            const promoRows = promoProducts.map((p) => ({
                product_id: p.id,
                sale_price: Math.round(p.price * (0.7 + Math.random() * 0.15) * 100) / 100,
                starts_at: pastDate(randInt(1, 7)),
                ends_at: futureDate(randInt(3, 21)),
            }));

            const { error: promoError } = await supabase.from("promotions").insert(promoRows);
            if (promoError) {
                console.error(`  Failed to insert promos for ${merchantRow.name}:`, promoError);
            } else {
                totalPromos += promoRows.length;
            }
        }

        // Feed events — new_product for all, new_promo for promo items
        const feedEvents = productRows.map((p) => ({
            merchant_id: merchantRow.id,
            product_id: p.id,
            event_type: "new_product",
            created_at: pastDate(randInt(1, 30)),
        }));

        if (promoProducts.length > 0) {
            for (const p of promoProducts) {
                feedEvents.push({
                    merchant_id: merchantRow.id,
                    product_id: p.id,
                    event_type: "new_promo",
                    created_at: pastDate(randInt(0, 5)),
                });
            }
        }

        const { error: feedError } = await supabase.from("feed_events").insert(feedEvents);
        if (feedError) {
            console.error(`  Failed to insert feed events for ${merchantRow.name}:`, feedError);
        } else {
            totalEvents += feedEvents.length;
        }

        totalProducts += productRows.length;
        console.log(`  ✓ ${merchantRow.name} — ${productRows.length} products`);
    }

    console.log(`\n─── Summary ───`);
    console.log(`  Merchants: ${merchantRows.length}`);
    console.log(`  Products:  ${totalProducts}`);
    console.log(`  Promos:    ${totalPromos}`);
    console.log(`  Feed events: ${totalEvents}`);
    console.log(`\n✅ Seed complete! L'app est prête pour la démo.\n`);
}

seed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
});
