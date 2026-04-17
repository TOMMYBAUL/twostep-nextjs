/**
 * Scoring des prospects Two-Step Toulouse
 *
 * Critères de scoring :
 * - Rue commerçante piétonne du centre (+30 pts)
 * - Segment prioritaire mode/chaussures/bijoux/sport (+20 pts)
 * - Code postal 31000 centre-ville (+15 pts)
 * - Geo score élevé (+10 pts si > 0.98)
 * - Email connu (+25 pts)
 * - Nom enseigne clair / pas générique (+5 pts)
 */

import { readFileSync, writeFileSync } from "fs";

// Load data
const commerces = JSON.parse(readFileSync("sirene-commerces-toulouse-enriched.json", "utf8"));
const emailsData = JSON.parse(readFileSync("emails-prospection-consolide.json", "utf8"));

// Build email lookup
const emailLookup = new Map();
for (const b of emailsData.boutiques) {
    emailLookup.set(b.nom.toLowerCase().trim(), b);
}

// Rues piétonnes / commerçantes premium
const RUES_PREMIUM = [
    "ALSACE LORRAINE", "POMME", "SAINT ROME", "SAINT-ROME", "CROIX BARAGNON",
    "TOURNEURS", "CHANGES", "ARTS", "COLOMBETTE", "CUJAS", "PHARAON",
    "LANGUEDOC", "FILATIERS", "BOULBONNE", "BARONIE", "POIDS DE L'HUILE",
    "VICTOR HUGO", "SAINT ETIENNE", "TRINITE", "METZ", "BAYARD",
    "REMPART SAINT ETIENNE", "OZENNE", "DALBADE"
];

// Segments prioritaires
const SEGMENTS_PRIO = ["mode", "bijoux", "sport"];

// Score each commerce
const scored = commerces.map(c => {
    let score = 0;
    const reasons = [];

    // Rue premium
    const adresseUp = (c.adresse || "").toUpperCase();
    if (RUES_PREMIUM.some(r => adresseUp.includes(r))) {
        score += 30;
        reasons.push("rue commerçante");
    }

    // Segment prioritaire
    if (SEGMENTS_PRIO.includes(c.segment)) {
        score += 20;
        reasons.push(`segment ${c.segment}`);
    }

    // Centre-ville
    if (c.code_postal === "31000") {
        score += 15;
        reasons.push("centre-ville");
    }

    // Geo score élevé
    if (c.geo_score > 0.98) {
        score += 10;
        reasons.push("geo score élevé");
    }

    // Email connu
    const nomLower = (c.nom_enseigne || c.nom_legal || "").toLowerCase().trim();
    const emailMatch = emailLookup.get(nomLower);
    let email = null;
    if (emailMatch) {
        score += 25;
        reasons.push("email connu");
        email = emailMatch.email;
    }

    // Nom enseigne clair (pas vide, pas trop générique)
    const nom = c.nom_enseigne || c.nom_legal || "";
    if (nom.length > 3 && !nom.includes("SARL") && !nom.includes("SAS") && !nom.includes("EURL")) {
        score += 5;
        reasons.push("nom clair");
    }

    return {
        rang: 0,
        nom: nom,
        adresse: c.adresse_complete || `${c.adresse} ${c.code_postal} ${c.ville}`,
        segment: c.segment,
        score,
        reasons: reasons.join(", "),
        email: email || "",
        telephone: emailMatch?.telephone || "",
        site_web: emailMatch?.site_web || "",
        lat: c.lat,
        lng: c.lng
    };
});

// Sort by score desc
scored.sort((a, b) => b.score - a.score);

// Assign rank
scored.forEach((s, i) => { s.rang = i + 1; });

// Take top 100
const top100 = scored.slice(0, 100);

// Output summary
console.log(`\n=== TOP 100 PROSPECTS TWO-STEP TOULOUSE ===\n`);
console.log(`Total commerces analysés : ${commerces.length}`);
console.log(`Score max : ${top100[0].score} | Score min (top 100) : ${top100[99].score}\n`);

console.log("--- TOP 20 ---");
for (const p of top100.slice(0, 20)) {
    console.log(`#${p.rang} [${p.score}pts] ${p.nom} — ${p.segment} — ${p.adresse}${p.email ? ` — ${p.email}` : ""}`);
}

console.log(`\n--- Répartition segments TOP 100 ---`);
const segCount = {};
top100.forEach(p => { segCount[p.segment] = (segCount[p.segment] || 0) + 1; });
Object.entries(segCount).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => {
    console.log(`  ${s}: ${c}`);
});

// Save full top 100
writeFileSync(
    "kit-prospection/top-100-prospects.json",
    JSON.stringify(top100, null, 2),
    "utf8"
);

// Save CSV for easy viewing
const csvLines = [
    "Rang,Nom,Segment,Score,Adresse,Email,Telephone,Site Web,Raisons"
];
for (const p of top100) {
    csvLines.push([
        p.rang,
        `"${p.nom}"`,
        p.segment,
        p.score,
        `"${p.adresse}"`,
        p.email,
        p.telephone,
        p.site_web,
        `"${p.reasons}"`
    ].join(","));
}
writeFileSync("kit-prospection/top-100-prospects.csv", csvLines.join("\n"), "utf8");

console.log(`\nFichiers générés :`);
console.log(`  - kit-prospection/top-100-prospects.json`);
console.log(`  - kit-prospection/top-100-prospects.csv`);
