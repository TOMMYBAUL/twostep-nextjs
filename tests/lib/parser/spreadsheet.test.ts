import { describe, it, expect } from "vitest";
import {
    assessProductName,
    detectColumns,
    extractStructured,
    looksLikeProductName,
} from "@/lib/parser/spreadsheet";

describe("looksLikeProductName — anti-faux-positif (Cycle 3)", () => {
    it("accepts un nom court de produit", () => {
        expect(looksLikeProductName("Nike Air Max 90")).toBe(true);
        expect(looksLikeProductName("Coca-Cola 33cl")).toBe(true);
        expect(looksLikeProductName("Le Labo Santal 33 EDP 50ml")).toBe(true);
    });

    it("rejects URL http(s) — bug observé 2026-04-25 (catalog/import a créé un produit avec name=URL)", () => {
        expect(looksLikeProductName("https://cdn.example.com/nike-am90-noir.jpg")).toBe(false);
        expect(looksLikeProductName("http://example.com/photo.png")).toBe(false);
        expect(looksLikeProductName("HTTPS://example.com")).toBe(false); // case-insensitive
    });

    it("rejects strings trop longues (> 200 chars) — probable description, pas un nom", () => {
        const longText = "A".repeat(201);
        expect(looksLikeProductName(longText)).toBe(false);
    });

    it("accepts string juste sous la limite", () => {
        const exactLimit = "B".repeat(200);
        expect(looksLikeProductName(exactLimit)).toBe(true);
    });

    it("rejects empty / whitespace only", () => {
        expect(looksLikeProductName("")).toBe(false);
        expect(looksLikeProductName("   ")).toBe(false);
        expect(looksLikeProductName("\t\n")).toBe(false);
    });
});

describe("assessProductName — qualité 3 niveaux (Cycle 5)", () => {
    it("clear — nom de produit court structuré", () => {
        expect(assessProductName("Nike Air Max 90").quality).toBe("clear");
        expect(assessProductName("Coca-Cola 33cl").quality).toBe("clear");
        expect(assessProductName("Le Labo Santal 33 EDP 50ml").quality).toBe("clear");
    });

    it("suspect — virgule+espace détectés (probable prose)", () => {
        expect(assessProductName("Cuir blanc, talon vert").quality).toBe("suspect");
        expect(assessProductName("Sneakers iconiques, semelle Air visible").quality).toBe("suspect");
        expect(assessProductName("Bois de santal, cardamome").quality).toBe("suspect");
    });

    it("clear — virgule sans espace après → garde clear (peut être un format type 'Coca-Cola,33cl')", () => {
        expect(assessProductName("Produit,Test").quality).toBe("clear");
    });

    it("invalid — URL", () => {
        const result = assessProductName("https://cdn.example.com/photo.jpg");
        expect(result.quality).toBe("invalid");
        expect(result.reason).toBe("url");
    });

    it("invalid — vide ou trop long", () => {
        expect(assessProductName("").quality).toBe("invalid");
        expect(assessProductName("   ").quality).toBe("invalid");
        expect(assessProductName("A".repeat(201)).quality).toBe("invalid");
    });
});

describe("detectColumns — mapping headers (Cycle 3)", () => {
    it('mappe "Désignation" en name (pas Description)', () => {
        const headers = [
            "Référence",
            "Désignation",
            "Marque",
            "Catégorie",
            "Code-barres",
            "Prix TTC",
            "Stock",
            "Taille",
            "Coloris",
            "Photo URL",
            "Description",
        ];
        const mapping = detectColumns(headers);
        expect(mapping.name).toBe(1); // Désignation, pas Description
        expect(mapping.description).toBe(10); // Description capturée séparément
        expect(mapping.sku).toBe(0); // Référence
        expect(mapping.brand).toBe(2);
        expect(mapping.ean).toBe(4);
        expect(mapping.unit_price).toBe(5);
    });

    it('si SEUL "Description" est présent comme colonne textuelle, name reste null (rejet auto)', () => {
        // Avant fix : "Description" était dans NAME_HEADERS → le mapping.name pointait dessus.
        // Après fix : description ne peut PLUS devenir name. AI fallback prendra le relais.
        const headers = ["Code", "Description", "EAN", "Prix"];
        const mapping = detectColumns(headers);
        expect(mapping.name).toBeNull(); // Rejet — AI fallback dans l'app
        expect(mapping.description).toBe(1);
        expect(mapping.ean).toBe(2);
    });

    it('mappe "Title" et "Titre" en name (verticaux EN/FR)', () => {
        expect(detectColumns(["Title", "EAN"]).name).toBe(0);
        expect(detectColumns(["Titre", "EAN"]).name).toBe(0);
    });

    it('mappe alternatives EAN : "Gencode", "UPC", "Barcode"', () => {
        expect(detectColumns(["Nom", "Gencode"]).ean).toBe(1);
        expect(detectColumns(["Nom", "UPC"]).ean).toBe(1);
        expect(detectColumns(["Nom", "Barcode"]).ean).toBe(1);
    });
});

describe("extractStructured — anti-faux-positif sur lignes (Cycle 3)", () => {
    const mapping = {
        name: 1,
        ean: 4,
        sku: 0,
        brand: 2,
        quantity: null,
        unit_price: 5,
        description: 10,
    };
    const headerRow = [
        "Référence", "Désignation", "Marque", "Catégorie",
        "Code-barres", "Prix TTC", "Stock", "Taille", "Coloris",
        "Photo URL", "Description",
    ];

    it("ligne propre Nike Air Max → produit créé avec le bon name", () => {
        const rows = [
            headerRow,
            [
                "SNK-001", "Nike Air Max 90", "Nike", "Sneakers",
                "0884776073143", "129.99", "3", "42", "Noir/Blanc",
                "https://cdn.example.com/nike.jpg",
                "Sneakers iconiques, semelle Air visible",
            ],
        ];
        const items = extractStructured(rows, mapping);
        expect(items).toHaveLength(1);
        expect(items[0].name).toBe("Nike Air Max 90");
        expect(items[0].ean).toBe("0884776073143");
        expect(items[0].brand).toBe("Nike");
    });

    it("ligne où col[1] (mapping.name) contient une URL → REJETÉE", () => {
        // Cas où le parser a foiré sur une ligne décalée et la URL atterrit en name
        const rows = [
            headerRow,
            [
                "SNK-001",
                "https://cdn.example.com/nike.jpg", // URL au lieu du nom
                "Nike", "Sneakers", "0884776073143", "129.99",
                "3", "42", "Noir/Blanc", "", "",
            ],
        ];
        const items = extractStructured(rows, mapping);
        expect(items).toHaveLength(0); // Ligne rejetée — pas de produit créé avec name=URL
    });

    it("ligne où col[1] contient une description longue (>200 chars) → REJETÉE", () => {
        const longDesc = "Sneakers iconiques avec semelle Air visible, ".repeat(10);
        const rows = [
            headerRow,
            [
                "SNK-001", longDesc, "Nike", "Sneakers", "0884776073143",
                "129.99", "3", "42", "Noir/Blanc", "", "",
            ],
        ];
        const items = extractStructured(rows, mapping);
        expect(items).toHaveLength(0);
    });

    it("plusieurs lignes : on garde les valides, on saute les invalides", () => {
        const rows = [
            headerRow,
            ["SNK-001", "Nike Air Max 90", "Nike", "", "0884776073143", "129.99", "", "", "", "", ""],
            ["SNK-002", "https://malformed-url.example", "Nike", "", "", "", "", "", "", "", ""],
            ["SNK-003", "Adidas Stan Smith", "Adidas", "", "4055017461258", "99.90", "", "", "", "", ""],
        ];
        const items = extractStructured(rows, mapping);
        expect(items).toHaveLength(2); // 1 et 3 OK, 2 rejetée
        expect(items[0].name).toBe("Nike Air Max 90");
        expect(items[1].name).toBe("Adidas Stan Smith");
    });

    it("prix avec virgule décimale FR → converti en float", () => {
        const rows = [
            headerRow,
            ["SNK-001", "Nike Air Max", "Nike", "", "", "99,90", "", "", "", "", ""],
        ];
        const items = extractStructured(rows, mapping);
        expect(items[0].unit_price).toBe(99.9);
    });

    it("ligne avec name vide → skip silencieux (pas de log warn)", () => {
        const rows = [
            headerRow,
            ["SNK-001", "", "Nike", "", "0884776073143", "129.99", "", "", "", "", ""],
        ];
        const items = extractStructured(rows, mapping);
        expect(items).toHaveLength(0);
    });

    it("Cycle 5 — ligne suspect (description courte avec virgule) → CONSERVÉE pour queue review", () => {
        // "Cuir blanc, talon vert" = description, pas un nom propre.
        // Cycle 5 : on la laisse passer (cascade Tier 6 va probablement échouer →
        // queue review via wizard step 2). On NE rejette PAS pour ne pas perdre la ligne.
        const rows = [
            headerRow,
            [
                "SNK-001", "Cuir blanc, talon vert", "Adidas", "Sneakers",
                "4055017461258", "99.90", "", "", "", "", "",
            ],
        ];
        const items = extractStructured(rows, mapping);
        expect(items).toHaveLength(1);
        expect(items[0].name).toBe("Cuir blanc, talon vert");
        // Le scoring tomber probablement sur Tier 6 EAN-Search → 0.90 → pending.
        // Le marchand verra ce produit en queue review et pourra corriger le nom.
    });
});
