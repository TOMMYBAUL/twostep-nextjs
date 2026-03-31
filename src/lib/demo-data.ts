/**
 * Données fictives pour le mode démo.
 * Boutique : "Sneakers & Co" — magasin de chaussures, quartier Carmes, Toulouse.
 * Activé quand NEXT_PUBLIC_DEMO_MODE=true dans .env.local
 */

import type { Merchant, Product, Invoice } from "./types";

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const MERCHANT_ID = "demo-merchant-001";
const now = new Date().toISOString();

export const demoMerchant: Merchant = {
    id: MERCHANT_ID,
    user_id: "demo-user",
    name: "Sneakers & Co",
    address: "12 rue des Filatiers",
    city: "Toulouse",
    status: "active",
    siret: "90215478300014",
    phone: "05 61 23 45 67",
    description: "Sneakers premium et chaussures de ville pour homme et femme. Marques sélectionnées depuis 2019.",
    photo_url: null,
    opening_hours: {
        monday: { open: "10:00", close: "19:00" },
        tuesday: { open: "10:00", close: "19:00" },
        wednesday: { open: "10:00", close: "19:00" },
        thursday: { open: "10:00", close: "19:00" },
        friday: { open: "10:00", close: "19:30" },
        saturday: { open: "09:30", close: "19:30" },
        sunday: null,
    },
    pos_type: "square",
    pos_last_sync: new Date(Date.now() - 3 * 60 * 1000).toISOString(), // 3 min ago
    siret_verified: true,
    naf_code: "47.72A",
    plan: "free",
    free_until: null,
    launch_cohort: 1,
    slug: "sneakers-and-co",
    created_at: "2026-03-20T10:00:00Z",
    updated_at: now,
};

type ProductWithStock = Product & { stock: { quantity: number }[] };

export const demoProducts: ProductWithStock[] = [
    {
        id: "p1", merchant_id: MERCHANT_ID,
        name: "Nike Air Force 1 '07", ean: "0194956623461", brand: "Nike", canonical_name: null,
        category: "Sneakers", price: 119.99, purchase_price: 62,
        photo_url: null, photo_processed_url: null, photo_source: null, pos_item_id: "sq-001",
        description: null, category_auto: "Chaussures", created_at: now, updated_at: now,
        stock: [{ quantity: 8 }],
    },
    {
        id: "p2", merchant_id: MERCHANT_ID,
        name: "Adidas Stan Smith", ean: "4066745172583", brand: "Adidas", canonical_name: null,
        category: "Sneakers", price: 109.99, purchase_price: 55,
        photo_url: null, photo_processed_url: null, photo_source: null, pos_item_id: "sq-002",
        description: null, category_auto: "Chaussures", created_at: now, updated_at: now,
        stock: [{ quantity: 12 }],
    },
    {
        id: "p3", merchant_id: MERCHANT_ID,
        name: "New Balance 574", ean: "0196560400033", brand: "New Balance", canonical_name: null,
        category: "Sneakers", price: 99.99, purchase_price: 48,
        photo_url: null, photo_processed_url: null, photo_source: null, pos_item_id: "sq-003",
        description: null, category_auto: "Chaussures", created_at: now, updated_at: now,
        stock: [{ quantity: 5 }],
    },
    {
        id: "p4", merchant_id: MERCHANT_ID,
        name: "Vans Old Skool", ean: "0194115827542", brand: "Vans", canonical_name: null,
        category: "Sneakers", price: 79.99, purchase_price: 38,
        photo_url: null, photo_processed_url: null, photo_source: null, pos_item_id: "sq-004",
        description: null, category_auto: "Chaussures", created_at: now, updated_at: now,
        stock: [{ quantity: 3 }],
    },
    {
        id: "p5", merchant_id: MERCHANT_ID,
        name: "Converse Chuck Taylor All Star", ean: "0888755678901", brand: "Converse", canonical_name: null,
        category: "Sneakers", price: 69.99, purchase_price: 32,
        photo_url: null, photo_processed_url: null, photo_source: null, pos_item_id: "sq-005",
        description: null, category_auto: "Chaussures", created_at: now, updated_at: now,
        stock: [{ quantity: 15 }],
    },
    {
        id: "p6", merchant_id: MERCHANT_ID,
        name: "Puma Suede Classic XXI", ean: "4065449742368", brand: "Puma", canonical_name: null,
        category: "Sneakers", price: 74.99, purchase_price: 36,
        photo_url: null, photo_processed_url: null, photo_source: null, pos_item_id: "sq-006",
        description: null, category_auto: "Chaussures", created_at: now, updated_at: now,
        stock: [{ quantity: 0 }],
    },
    {
        id: "p7", merchant_id: MERCHANT_ID,
        name: "Timberland 6-Inch Premium Boot", ean: "0889587713245", brand: "Timberland", canonical_name: null,
        category: "Boots", price: 199.99, purchase_price: 105,
        photo_url: null, photo_processed_url: null, photo_source: null, pos_item_id: "sq-007",
        description: null, category_auto: "Chaussures", created_at: now, updated_at: now,
        stock: [{ quantity: 4 }],
    },
    {
        id: "p8", merchant_id: MERCHANT_ID,
        name: "Dr. Martens 1460 Smooth", ean: "0800090276734", brand: "Dr. Martens", canonical_name: null,
        category: "Boots", price: 169.99, purchase_price: 88,
        photo_url: null, photo_processed_url: null, photo_source: null, pos_item_id: "sq-008",
        description: null, category_auto: "Chaussures", created_at: now, updated_at: now,
        stock: [{ quantity: 6 }],
    },
    {
        id: "p9", merchant_id: MERCHANT_ID,
        name: "Reebok Classic Leather", ean: "4064047264807", brand: "Reebok", canonical_name: null,
        category: "Sneakers", price: 89.99, purchase_price: 42,
        photo_url: null, photo_processed_url: null, photo_source: null, pos_item_id: "sq-009",
        description: null, category_auto: "Chaussures", created_at: now, updated_at: now,
        stock: [{ quantity: 2 }],
    },
    {
        id: "p10", merchant_id: MERCHANT_ID,
        name: "Asics Gel-Lyte III OG", ean: "4550214146835", brand: "Asics", canonical_name: null,
        category: "Sneakers", price: 129.99, purchase_price: 65,
        photo_url: null, photo_processed_url: null, photo_source: null, pos_item_id: "sq-010",
        description: null, category_auto: "Chaussures", created_at: now, updated_at: now,
        stock: [{ quantity: 0 }],
    },
];

type InvoiceWithItems = Invoice & { invoice_items: Array<{
    id: string; name: string; quantity: number; unit_price_ht: number | null;
    ean: string | null; status: string; product_id: string | null;
}> };

export const demoInvoices: InvoiceWithItems[] = [
    {
        id: "inv-1", merchant_id: MERCHANT_ID,
        source: "email", status: "imported",
        file_url: null, sender_email: "commandes@nike-distribution.fr",
        supplier_name: "Nike France",
        received_at: "2026-03-18T08:30:00Z",
        parsed_at: "2026-03-18T08:31:00Z",
        validated_at: "2026-03-18T09:00:00Z",
        invoice_items: [
            { id: "ii-1", name: "Air Force 1 '07 Blanc", quantity: 4, unit_price_ht: 62, ean: "0194956623461", status: "validated", product_id: "p1" },
            { id: "ii-2", name: "Air Max 90 Noir", quantity: 3, unit_price_ht: 68, ean: "0194958123456", status: "validated", product_id: null },
        ],
    },
    {
        id: "inv-2", merchant_id: MERCHANT_ID,
        source: "email", status: "parsed",
        file_url: null, sender_email: "pro@adidas.fr",
        supplier_name: "Adidas Wholesale",
        received_at: "2026-03-20T14:15:00Z",
        parsed_at: "2026-03-20T14:16:00Z",
        validated_at: null,
        invoice_items: [
            { id: "ii-3", name: "Stan Smith H", quantity: 6, unit_price_ht: 55, ean: "4066745172583", status: "enriched", product_id: "p2" },
            { id: "ii-4", name: "Superstar Blanc/Noir", quantity: 4, unit_price_ht: 52, ean: "4066745112233", status: "detected", product_id: null },
        ],
    },
    {
        id: "inv-3", merchant_id: MERCHANT_ID,
        source: "email", status: "received",
        file_url: null, sender_email: "b2b@newbalance.eu",
        supplier_name: "New Balance EU",
        received_at: "2026-03-21T10:00:00Z",
        parsed_at: null, validated_at: null,
        invoice_items: [],
    },
];
