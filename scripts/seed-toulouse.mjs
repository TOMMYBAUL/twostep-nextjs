/**
 * Two-Step — Seed script: 25 realistic Toulouse merchants + 250+ products
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

// ─── Toulouse Merchants ─────────────────────────────────

const MERCHANTS = [
    {
        name: "La Maison Mode",
        address: "15 rue des Arts",
        city: "Toulouse",
        quartier: "Capitole",
        lat: 43.6042, lng: 1.4437,
        description: "Concept store mode femme — marques françaises et scandinaves, sélection pointue de prêt-à-porter et accessoires.",
        category: "mode",
        phone: "05 61 23 45 67",
        opening_hours: { monday: { open: "10:00", close: "19:00" }, tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "10:00", close: "19:00" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "19:30" }, saturday: { open: "10:00", close: "19:30" } },
    },
    {
        name: "Sneakers District",
        address: "8 rue Saint-Rome",
        city: "Toulouse",
        quartier: "Capitole",
        lat: 43.6030, lng: 1.4448,
        description: "Sneakers premium — Nike, Adidas, New Balance, Asics. Éditions limitées et classiques.",
        category: "chaussures",
        phone: "05 61 34 56 78",
        opening_hours: { monday: { open: "10:30", close: "19:00" }, tuesday: { open: "10:30", close: "19:00" }, wednesday: { open: "10:30", close: "19:00" }, thursday: { open: "10:30", close: "19:00" }, friday: { open: "10:30", close: "19:30" }, saturday: { open: "10:00", close: "20:00" } },
    },
    {
        name: "L'Écrin Doré",
        address: "22 rue de Metz",
        city: "Toulouse",
        quartier: "Esquirol",
        lat: 43.6005, lng: 1.4452,
        description: "Bijouterie — Pandora, Swarovski, Fossil, Daniel Wellington. Gravure sur place.",
        category: "bijoux",
        phone: "05 61 45 67 89",
        opening_hours: { monday: { open: "10:00", close: "19:00" }, tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "10:00", close: "19:00" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "19:00" }, saturday: { open: "10:00", close: "19:00" } },
    },
    {
        name: "Tech & Co",
        address: "45 allées Jean-Jaurès",
        city: "Toulouse",
        quartier: "Jean-Jaurès",
        lat: 43.6063, lng: 1.4491,
        description: "Accessoires tech et gadgets — coques, chargeurs, écouteurs, montres connectées. Samsung, JBL, Belkin.",
        category: "tech",
        phone: "05 61 56 78 90",
        opening_hours: { monday: { open: "10:00", close: "19:00" }, tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "10:00", close: "19:00" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "19:30" }, saturday: { open: "10:00", close: "19:30" } },
    },
    {
        name: "Beauté Carmes",
        address: "3 place des Carmes",
        city: "Toulouse",
        quartier: "Carmes",
        lat: 43.5988, lng: 1.4441,
        description: "Institut et parfumerie — Nuxe, Caudalie, Bioderma, Avène. Conseil personnalisé.",
        category: "beaute",
        phone: "05 61 67 89 01",
        opening_hours: { tuesday: { open: "09:30", close: "19:00" }, wednesday: { open: "09:30", close: "19:00" }, thursday: { open: "09:30", close: "19:00" }, friday: { open: "09:30", close: "19:00" }, saturday: { open: "09:30", close: "18:00" } },
    },
    {
        name: "Run & Trail Toulouse",
        address: "12 rue Bayard",
        city: "Toulouse",
        quartier: "Jean-Jaurès",
        lat: 43.6070, lng: 1.4530,
        description: "Spécialiste running et trail — Salomon, Hoka, Brooks, Garmin. Analyse de foulée.",
        category: "sport",
        phone: "05 61 78 90 12",
        opening_hours: { tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "10:00", close: "19:00" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "19:30" }, saturday: { open: "09:30", close: "19:00" } },
    },
    {
        name: "Le Comptoir des Marques",
        address: "28 rue Alsace-Lorraine",
        city: "Toulouse",
        quartier: "Capitole",
        lat: 43.6025, lng: 1.4465,
        description: "Multimarques homme et femme — Tommy Hilfiger, Calvin Klein, Lacoste, Levi's.",
        category: "mode",
        phone: "05 61 89 01 23",
        opening_hours: { monday: { open: "10:00", close: "19:00" }, tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "10:00", close: "19:00" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "19:30" }, saturday: { open: "10:00", close: "19:30" } },
    },
    {
        name: "Joué Club Saint-Cyprien",
        address: "56 rue de la République",
        city: "Toulouse",
        quartier: "Saint-Cyprien",
        lat: 43.5997, lng: 1.4330,
        description: "Jouets et jeux — Lego, Playmobil, Ravensburger, Djeco. Conseils par âge.",
        category: "jouets",
        phone: "05 61 90 12 34",
        opening_hours: { monday: { open: "10:00", close: "19:00" }, tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "09:30", close: "19:30" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "19:00" }, saturday: { open: "09:30", close: "19:30" } },
    },
    {
        name: "Maison Parfu'M",
        address: "17 rue Croix-Baragnon",
        city: "Toulouse",
        quartier: "Saint-Étienne",
        lat: 43.5960, lng: 1.4505,
        description: "Parfumerie de niche — Diptyque, Byredo, Le Labo, Acqua di Parma. Échantillons offerts.",
        category: "beaute",
        phone: "05 61 01 23 45",
        opening_hours: { tuesday: { open: "10:30", close: "19:00" }, wednesday: { open: "10:30", close: "19:00" }, thursday: { open: "10:30", close: "19:00" }, friday: { open: "10:30", close: "19:30" }, saturday: { open: "10:00", close: "19:00" } },
    },
    {
        name: "Ô Sport",
        address: "4 rue Peyrolières",
        city: "Toulouse",
        quartier: "Capitole",
        lat: 43.6010, lng: 1.4410,
        description: "Équipement sportif — Nike, Under Armour, Puma. Fitness, musculation, sports collectifs.",
        category: "sport",
        phone: "05 61 12 34 56",
        opening_hours: { monday: { open: "10:00", close: "19:00" }, tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "10:00", close: "19:00" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "19:30" }, saturday: { open: "10:00", close: "19:30" } },
    },
    {
        name: "Optique Victor Hugo",
        address: "31 place Victor Hugo",
        city: "Toulouse",
        quartier: "Victor Hugo",
        lat: 43.6010, lng: 1.4480,
        description: "Lunettes et solaires — Ray-Ban, Oakley, Persol, Tom Ford. Atelier de montage sur place.",
        category: "accessoires",
        phone: "05 61 23 45 89",
        opening_hours: { monday: { open: "09:30", close: "18:30" }, tuesday: { open: "09:30", close: "18:30" }, wednesday: { open: "09:30", close: "18:30" }, thursday: { open: "09:30", close: "18:30" }, friday: { open: "09:30", close: "18:30" }, saturday: { open: "10:00", close: "18:00" } },
    },
    {
        name: "Le Vestiaire",
        address: "9 rue des Filatiers",
        city: "Toulouse",
        quartier: "Carmes",
        lat: 43.5992, lng: 1.4435,
        description: "Friperie premium — pièces vintage sélectionnées de marques (Levi's, Carhartt, Ralph Lauren, Burberry).",
        category: "mode",
        phone: "05 61 34 56 90",
        opening_hours: { tuesday: { open: "11:00", close: "19:00" }, wednesday: { open: "11:00", close: "19:00" }, thursday: { open: "11:00", close: "19:00" }, friday: { open: "11:00", close: "19:30" }, saturday: { open: "10:30", close: "19:30" } },
    },
    {
        name: "Board Culture",
        address: "23 rue Gabriel Péri",
        city: "Toulouse",
        quartier: "Arnaud Bernard",
        lat: 43.6100, lng: 1.4420,
        description: "Skateshop — decks, trucks, roues Element, Santa Cruz, Vans, Dickies. Culture street.",
        category: "sport",
        phone: "05 61 45 67 01",
        opening_hours: { monday: { open: "11:00", close: "19:00" }, tuesday: { open: "11:00", close: "19:00" }, wednesday: { open: "11:00", close: "19:00" }, thursday: { open: "11:00", close: "19:00" }, friday: { open: "11:00", close: "19:30" }, saturday: { open: "10:00", close: "19:30" } },
    },
    {
        name: "Bébé & Compagnie",
        address: "14 rue des Lois",
        city: "Toulouse",
        quartier: "Capitole",
        lat: 43.6048, lng: 1.4455,
        description: "Puériculture et enfant — Chicco, Babybjörn, Cybex, Petit Bateau. Liste de naissance.",
        category: "jouets",
        phone: "05 61 56 78 12",
        opening_hours: { monday: { open: "10:00", close: "18:30" }, tuesday: { open: "10:00", close: "18:30" }, wednesday: { open: "10:00", close: "18:30" }, thursday: { open: "10:00", close: "18:30" }, friday: { open: "10:00", close: "19:00" }, saturday: { open: "10:00", close: "19:00" } },
    },
    {
        name: "L'Atelier du Cuir",
        address: "7 rue Boulbonne",
        city: "Toulouse",
        quartier: "Carmes",
        lat: 43.5985, lng: 1.4460,
        description: "Maroquinerie — sacs, ceintures, portefeuilles. Longchamp, Lancaster, Fossil, Guess.",
        category: "accessoires",
        phone: "05 61 67 89 23",
        opening_hours: { monday: { open: "10:00", close: "19:00" }, tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "10:00", close: "19:00" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "19:00" }, saturday: { open: "10:00", close: "19:00" } },
    },
    {
        name: "Cycles Occitans",
        address: "67 avenue de Muret",
        city: "Toulouse",
        quartier: "Saint-Cyprien",
        lat: 43.5945, lng: 1.4310,
        description: "Vélos et accessoires — Specialized, Trek, Shimano, Garmin. Atelier réparation.",
        category: "sport",
        phone: "05 61 78 90 34",
        opening_hours: { tuesday: { open: "09:30", close: "12:30" }, wednesday: { open: "09:30", close: "19:00" }, thursday: { open: "09:30", close: "19:00" }, friday: { open: "09:30", close: "19:00" }, saturday: { open: "09:30", close: "18:00" } },
    },
    {
        name: "Pixel Games",
        address: "19 rue du Taur",
        city: "Toulouse",
        quartier: "Capitole",
        lat: 43.6060, lng: 1.4435,
        description: "Jeux vidéo, consoles, manettes, figurines. PlayStation, Nintendo, Xbox. Retrogaming.",
        category: "tech",
        phone: "05 61 89 01 45",
        opening_hours: { monday: { open: "10:30", close: "19:00" }, tuesday: { open: "10:30", close: "19:00" }, wednesday: { open: "10:00", close: "19:30" }, thursday: { open: "10:30", close: "19:00" }, friday: { open: "10:30", close: "19:30" }, saturday: { open: "10:00", close: "20:00" } },
    },
    {
        name: "Chez Simone",
        address: "34 rue Pharaon",
        city: "Toulouse",
        quartier: "Saint-Étienne",
        lat: 43.5955, lng: 1.4490,
        description: "Boutique femme bohème-chic — Bash, Sézane, Des Petits Hauts, Marie Sixtine.",
        category: "mode",
        phone: "05 61 90 12 56",
        opening_hours: { tuesday: { open: "10:30", close: "19:00" }, wednesday: { open: "10:30", close: "19:00" }, thursday: { open: "10:30", close: "19:00" }, friday: { open: "10:30", close: "19:30" }, saturday: { open: "10:00", close: "19:30" } },
    },
    {
        name: "Montres & Style",
        address: "11 rue de la Pomme",
        city: "Toulouse",
        quartier: "Capitole",
        lat: 43.6035, lng: 1.4450,
        description: "Horlogerie et bijoux — Seiko, Tissot, Casio G-Shock, Cluse. Réparation horlogère.",
        category: "bijoux",
        phone: "05 61 01 23 67",
        opening_hours: { monday: { open: "10:00", close: "19:00" }, tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "10:00", close: "19:00" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "19:00" }, saturday: { open: "10:00", close: "18:30" } },
    },
    {
        name: "Green Beauty",
        address: "5 rue Merlane",
        city: "Toulouse",
        quartier: "Saint-Aubin",
        lat: 43.6035, lng: 1.4518,
        description: "Cosmétique bio et naturelle — Dr. Hauschka, Weleda, Cattier, Ren Clean Skincare.",
        category: "beaute",
        phone: "05 61 12 34 78",
        opening_hours: { tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "10:00", close: "19:00" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "19:00" }, saturday: { open: "10:00", close: "18:30" } },
    },
    {
        name: "Denim Factory",
        address: "42 rue des Marchands",
        city: "Toulouse",
        quartier: "Esquirol",
        lat: 43.6000, lng: 1.4445,
        description: "Jeanswear — Levi's, Nudie Jeans, Edwin, Carhartt WIP. Retouches sur place.",
        category: "mode",
        phone: "05 61 23 45 90",
        opening_hours: { monday: { open: "10:30", close: "19:00" }, tuesday: { open: "10:30", close: "19:00" }, wednesday: { open: "10:30", close: "19:00" }, thursday: { open: "10:30", close: "19:00" }, friday: { open: "10:30", close: "19:30" }, saturday: { open: "10:00", close: "19:30" } },
    },
    {
        name: "Ludik",
        address: "27 rue Gambetta",
        city: "Toulouse",
        quartier: "Les Chalets",
        lat: 43.6120, lng: 1.4510,
        description: "Jeux de société et figurines — Asmodee, Games Workshop, Ravensburger. Soirées jeux.",
        category: "jouets",
        phone: "05 61 34 56 01",
        opening_hours: { tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "10:00", close: "20:00" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "20:00" }, saturday: { open: "10:00", close: "20:00" } },
    },
    {
        name: "So Shoes",
        address: "16 rue d'Astorg",
        city: "Toulouse",
        quartier: "Victor Hugo",
        lat: 43.6015, lng: 1.4475,
        description: "Chaussures femme tendance — Steve Madden, Jonak, Minelli, Bocage.",
        category: "chaussures",
        phone: "05 61 45 67 12",
        opening_hours: { monday: { open: "10:00", close: "19:00" }, tuesday: { open: "10:00", close: "19:00" }, wednesday: { open: "10:00", close: "19:00" }, thursday: { open: "10:00", close: "19:00" }, friday: { open: "10:00", close: "19:30" }, saturday: { open: "10:00", close: "19:30" } },
    },
    {
        name: "Le Bon Bricoleur",
        address: "89 route de Seysses",
        city: "Toulouse",
        quartier: "Saint-Cyprien",
        lat: 43.5920, lng: 1.4250,
        description: "Outillage et quincaillerie — Bosch, Makita, Stanley, Fischer. Conseils pros.",
        category: "bricolage",
        phone: "05 61 56 78 23",
        opening_hours: { monday: { open: "08:30", close: "12:00" }, tuesday: { open: "08:30", close: "18:30" }, wednesday: { open: "08:30", close: "18:30" }, thursday: { open: "08:30", close: "18:30" }, friday: { open: "08:30", close: "18:30" }, saturday: { open: "09:00", close: "17:00" } },
    },
    {
        name: "Urban Mix",
        address: "38 boulevard de Strasbourg",
        city: "Toulouse",
        quartier: "Matabiau",
        lat: 43.6115, lng: 1.4555,
        description: "Streetwear — The North Face, Champion, Stüssy, New Era. Casquettes et accessoires.",
        category: "mode",
        phone: "05 61 67 89 34",
        opening_hours: { monday: { open: "10:30", close: "19:00" }, tuesday: { open: "10:30", close: "19:00" }, wednesday: { open: "10:30", close: "19:00" }, thursday: { open: "10:30", close: "19:00" }, friday: { open: "10:30", close: "19:30" }, saturday: { open: "10:00", close: "19:30" } },
    },
];

// ─── Products by Category ───────────────────────────────

const PRODUCT_CATALOGS = {
    mode: [
        { name: "T-shirt col rond", brand: "Levi's", priceRange: [25, 45], ean: "5412345678901" },
        { name: "Jean 501 Original", brand: "Levi's", priceRange: [89, 129], ean: "5412345678902" },
        { name: "Chemise Oxford slim", brand: "Tommy Hilfiger", priceRange: [69, 99], ean: "5412345678903" },
        { name: "Polo Classic Fit", brand: "Lacoste", priceRange: [95, 130], ean: "5412345678904" },
        { name: "Sweat à capuche", brand: "Calvin Klein", priceRange: [79, 119], ean: "5412345678905" },
        { name: "Veste en jean Trucker", brand: "Levi's", priceRange: [99, 149], ean: "5412345678906" },
        { name: "Robe midi fleurie", brand: "Sézane", priceRange: [120, 180], ean: "5412345678907" },
        { name: "Blouse en soie", brand: "Bash", priceRange: [150, 220], ean: "5412345678908" },
        { name: "Pantalon chino slim", brand: "Dockers", priceRange: [59, 89], ean: "5412345678909" },
        { name: "Pull col V laine mérinos", brand: "Ralph Lauren", priceRange: [129, 189], ean: "5412345678910" },
        { name: "Doudoune légère", brand: "The North Face", priceRange: [180, 250], ean: "5412345678911" },
        { name: "Parka imperméable", brand: "Carhartt WIP", priceRange: [200, 320], ean: "5412345678912" },
        { name: "Casquette 9FORTY", brand: "New Era", priceRange: [25, 35], ean: "5412345678913" },
        { name: "Hoodie Logo", brand: "Champion", priceRange: [65, 89], ean: "5412345678914" },
        { name: "Bermuda cargo", brand: "Dickies", priceRange: [45, 65], ean: "5412345678915" },
    ],
    chaussures: [
        { name: "Air Force 1 '07", brand: "Nike", priceRange: [110, 130], ean: "5412345679001" },
        { name: "Stan Smith", brand: "Adidas", priceRange: [90, 110], ean: "5412345679002" },
        { name: "574 Classic", brand: "New Balance", priceRange: [90, 120], ean: "5412345679003" },
        { name: "Gel-1130", brand: "Asics", priceRange: [120, 140], ean: "5412345679004" },
        { name: "Old Skool", brand: "Vans", priceRange: [70, 85], ean: "5412345679005" },
        { name: "Club C 85", brand: "Reebok", priceRange: [80, 95], ean: "5412345679006" },
        { name: "Chuck Taylor All Star", brand: "Converse", priceRange: [60, 80], ean: "5412345679007" },
        { name: "Boots Chelsea cuir", brand: "Minelli", priceRange: [130, 180], ean: "5412345679008" },
        { name: "Sandale compensée", brand: "Jonak", priceRange: [89, 119], ean: "5412345679009" },
        { name: "Mocassin classique", brand: "Bocage", priceRange: [110, 150], ean: "5412345679010" },
        { name: "Clifton 9", brand: "Hoka", priceRange: [140, 160], ean: "5412345679011" },
        { name: "Speedcross 6", brand: "Salomon", priceRange: [130, 150], ean: "5412345679012" },
        { name: "Ghost 15", brand: "Brooks", priceRange: [130, 150], ean: "5412345679013" },
    ],
    bijoux: [
        { name: "Bracelet Moments", brand: "Pandora", priceRange: [59, 89], ean: "5412345679101" },
        { name: "Charm Cœur", brand: "Pandora", priceRange: [29, 49], ean: "5412345679102" },
        { name: "Collier Tennis", brand: "Swarovski", priceRange: [89, 159], ean: "5412345679103" },
        { name: "Boucles d'oreilles cristal", brand: "Swarovski", priceRange: [49, 79], ean: "5412345679104" },
        { name: "Montre Neutra Chrono", brand: "Fossil", priceRange: [149, 199], ean: "5412345679105" },
        { name: "Montre Petite", brand: "Daniel Wellington", priceRange: [129, 179], ean: "5412345679106" },
        { name: "Montre Presage", brand: "Seiko", priceRange: [350, 500], ean: "5412345679107" },
        { name: "Montre PRX", brand: "Tissot", priceRange: [350, 450], ean: "5412345679108" },
        { name: "G-Shock GA-2100", brand: "Casio", priceRange: [99, 129], ean: "5412345679109" },
        { name: "Montre Minuit Mesh", brand: "Cluse", priceRange: [89, 109], ean: "5412345679110" },
    ],
    tech: [
        { name: "Coque iPhone 15 Pro", brand: "Otterbox", priceRange: [29, 49], ean: "5412345679201" },
        { name: "Chargeur MagSafe", brand: "Belkin", priceRange: [39, 59], ean: "5412345679202" },
        { name: "Écouteurs Tune 770NC", brand: "JBL", priceRange: [79, 99], ean: "5412345679203" },
        { name: "Enceinte Flip 6", brand: "JBL", priceRange: [109, 139], ean: "5412345679204" },
        { name: "Galaxy Buds3", brand: "Samsung", priceRange: [149, 179], ean: "5412345679205" },
        { name: "Webcam Brio 4K", brand: "Logitech", priceRange: [159, 199], ean: "5412345679206" },
        { name: "Clavier MX Keys Mini", brand: "Logitech", priceRange: [89, 109], ean: "5412345679207" },
        { name: "Manette DualSense", brand: "PlayStation", priceRange: [59, 69], ean: "5412345679208" },
        { name: "Joy-Con (paire)", brand: "Nintendo", priceRange: [69, 79], ean: "5412345679209" },
        { name: "Forerunner 265", brand: "Garmin", priceRange: [399, 449], ean: "5412345679210" },
        { name: "Carte microSD 256Go", brand: "SanDisk", priceRange: [29, 39], ean: "5412345679211" },
    ],
    beaute: [
        { name: "Crème Prodigieuse Boost", brand: "Nuxe", priceRange: [29, 39], ean: "5412345679301" },
        { name: "Eau Micellaire", brand: "Bioderma", priceRange: [12, 18], ean: "5412345679302" },
        { name: "Eau Thermale spray 300ml", brand: "Avène", priceRange: [9, 14], ean: "5412345679303" },
        { name: "Vinosource-Hydra sérum", brand: "Caudalie", priceRange: [28, 38], ean: "5412345679304" },
        { name: "Bougie Baies", brand: "Diptyque", priceRange: [62, 72], ean: "5412345679305" },
        { name: "Eau de parfum Gypsy Water", brand: "Byredo", priceRange: [145, 195], ean: "5412345679306" },
        { name: "Eau de parfum Santal 33", brand: "Le Labo", priceRange: [160, 220], ean: "5412345679307" },
        { name: "Rose Hand Cream", brand: "Dr. Hauschka", priceRange: [15, 22], ean: "5412345679308" },
        { name: "Skin Food crème", brand: "Weleda", priceRange: [10, 16], ean: "5412345679309" },
        { name: "Gel douche Verbena", brand: "L'Occitane", priceRange: [12, 18], ean: "5412345679310" },
    ],
    sport: [
        { name: "Ballon de foot Pro", brand: "Adidas", priceRange: [30, 45], ean: "5412345679401" },
        { name: "Legging Fly Fast", brand: "Under Armour", priceRange: [60, 80], ean: "5412345679402" },
        { name: "Brassière Impact Run", brand: "New Balance", priceRange: [35, 50], ean: "5412345679403" },
        { name: "Gants de musculation", brand: "Nike", priceRange: [25, 35], ean: "5412345679404" },
        { name: "Sac à dos Trail 15L", brand: "Salomon", priceRange: [89, 120], ean: "5412345679405" },
        { name: "Tapis de yoga Premium", brand: "Manduka", priceRange: [79, 110], ean: "5412345679406" },
        { name: "Chaussettes compression", brand: "Compressport", priceRange: [15, 25], ean: "5412345679407" },
        { name: "Skate deck 8.25", brand: "Element", priceRange: [55, 70], ean: "5412345679408" },
        { name: "Trucks 149mm", brand: "Independent", priceRange: [50, 65], ean: "5412345679409" },
        { name: "Casque vélo Aether", brand: "Giro", priceRange: [180, 250], ean: "5412345679410" },
    ],
    jouets: [
        { name: "Lego Technic Ferrari", brand: "Lego", priceRange: [49, 89], ean: "5412345679501" },
        { name: "Lego City Pompiers", brand: "Lego", priceRange: [29, 49], ean: "5412345679502" },
        { name: "Playmobil Maison Modern.", brand: "Playmobil", priceRange: [89, 129], ean: "5412345679503" },
        { name: "Puzzle 1000 pièces", brand: "Ravensburger", priceRange: [14, 19], ean: "5412345679504" },
        { name: "Jeu Dixit", brand: "Asmodee", priceRange: [29, 35], ean: "5412345679505" },
        { name: "Dobble Classic", brand: "Asmodee", priceRange: [12, 16], ean: "5412345679506" },
        { name: "Warhammer Start Set", brand: "Games Workshop", priceRange: [45, 65], ean: "5412345679507" },
        { name: "Jeu Les Aventuriers du Rail", brand: "Days of Wonder", priceRange: [35, 45], ean: "5412345679508" },
        { name: "Poussette Libelle", brand: "Cybex", priceRange: [299, 349], ean: "5412345679509" },
        { name: "Body coton bio 3-pack", brand: "Petit Bateau", priceRange: [25, 39], ean: "5412345679510" },
    ],
    accessoires: [
        { name: "Lunettes Aviator", brand: "Ray-Ban", priceRange: [139, 179], ean: "5412345679601" },
        { name: "Lunettes Frogskins", brand: "Oakley", priceRange: [110, 140], ean: "5412345679602" },
        { name: "Sac Le Pliage M", brand: "Longchamp", priceRange: [95, 120], ean: "5412345679603" },
        { name: "Portefeuille cuir", brand: "Fossil", priceRange: [45, 65], ean: "5412345679604" },
        { name: "Ceinture réversible", brand: "Tommy Hilfiger", priceRange: [49, 69], ean: "5412345679605" },
        { name: "Sac bandoulière", brand: "Guess", priceRange: [89, 129], ean: "5412345679606" },
        { name: "Sac à dos Campus", brand: "Lancaster", priceRange: [110, 150], ean: "5412345679607" },
        { name: "Lunettes carrées", brand: "Persol", priceRange: [200, 280], ean: "5412345679608" },
        { name: "Monture optique", brand: "Tom Ford", priceRange: [250, 350], ean: "5412345679609" },
    ],
    bricolage: [
        { name: "Perceuse-visseuse 18V", brand: "Bosch", priceRange: [99, 149], ean: "5412345679701" },
        { name: "Scie sauteuse", brand: "Makita", priceRange: [89, 129], ean: "5412345679702" },
        { name: "Coffret tournevis 40 pcs", brand: "Stanley", priceRange: [29, 45], ean: "5412345679703" },
        { name: "Mètre laser 30m", brand: "Bosch", priceRange: [49, 69], ean: "5412345679704" },
        { name: "Chevilles universelles x100", brand: "Fischer", priceRange: [12, 18], ean: "5412345679705" },
        { name: "Niveau laser croix", brand: "Bosch", priceRange: [69, 99], ean: "5412345679706" },
        { name: "Ponceuse excentrique", brand: "Makita", priceRange: [79, 109], ean: "5412345679707" },
        { name: "Gants de travail", brand: "Mechanix", priceRange: [25, 35], ean: "5412345679708" },
    ],
};

// Map merchant category to product catalog key
const CATEGORY_MAP = {
    mode: "mode",
    chaussures: "chaussures",
    bijoux: "bijoux",
    tech: "tech",
    beaute: "beaute",
    sport: "sport",
    jouets: "jouets",
    accessoires: "accessoires",
    bricolage: "bricolage",
};

// ─── Seed Logic ─────────────────────────────────────────

async function seed() {
    console.log("🌱 Two-Step Seed — Toulouse Demo Data\n");

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
        photo_url: null,
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
        const catalogKey = CATEGORY_MAP[merchantDef.category];
        const catalog = PRODUCT_CATALOGS[catalogKey] || [];

        // Each merchant gets 8-12 products from their category
        const numProducts = Math.min(catalog.length, randInt(8, 12));
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
            photo_url: null,
        }));

        const { error: prodError } = await supabase.from("products").insert(productRows);
        if (prodError) {
            console.error(`  Failed to insert products for ${merchantRow.name}:`, prodError);
            continue;
        }

        // Insert stock for each product
        const stockRows = productRows.map((p) => ({
            product_id: p.id,
            quantity: randInt(0, 25),
        }));

        const { error: stockError } = await supabase.from("stock").insert(stockRows);
        if (stockError) {
            console.error(`  Failed to insert stock for ${merchantRow.name}:`, stockError);
        }

        // 20% of products get a promo
        const promoProducts = productRows.filter(() => Math.random() < 0.2);
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
