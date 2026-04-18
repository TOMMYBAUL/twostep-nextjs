/**
 * Scrape ALL independent retailers in Toulouse from annuaire-entreprises.data.gouv.fr
 *
 * Uses the free API (no key needed, 400 req/min).
 * Filters: active companies, ≤5 establishments (independents only).
 * Outputs: CSV + JSON with dirigeant names, SIREN, addresses.
 *
 * Usage: node scripts/scrape-toulouse-merchants.mjs
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "docs", "prospection");

// --- Config ---
const COMMUNE = "31555"; // Toulouse INSEE code
const API_BASE = "https://recherche-entreprises.api.gouv.fr/search";
const PER_PAGE = 25;
const MAX_ETABLISSEMENTS = 5; // Above this = chain, ignore
const DELAY_MS = 200; // ~5 req/sec, well under 400/min limit

// NAF codes for Two-Step target segments
const NAF_CODES = [
  { code: "47.71Z", segment: "Mode/Vêtements" },
  { code: "47.72A", segment: "Chaussures" },
  { code: "47.72B", segment: "Maroquinerie" },
  { code: "47.75Z", segment: "Cosmétique/Beauté" },
  { code: "47.77Z", segment: "Bijouterie/Horlogerie" },
  { code: "47.59B", segment: "Déco/Équipement foyer" },
  { code: "47.64Z", segment: "Sport" },
  { code: "47.65Z", segment: "Jouets" },
  { code: "47.78A", segment: "Optique" },
  { code: "47.78C", segment: "Autre commerce spécialisé" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Relevant dirigeant roles (skip auditors)
const SKIP_ROLES = [
  "commissaire aux comptes",
  "commissaire",
  "suppléant",
];

function isRelevantDirigeant(d) {
  const q = (d.qualite || "").toLowerCase();
  return !SKIP_ROLES.some((skip) => q.includes(skip));
}

function extractDirigeantName(dirigeants) {
  if (!dirigeants?.length) return { name: "", type: "" };

  // Prefer personne physique with relevant role
  const physiques = dirigeants.filter(
    (d) => d.type_dirigeant === "personne physique" && isRelevantDirigeant(d)
  );
  if (physiques.length > 0) {
    const d = physiques[0];
    const prenom = d.prenoms
      ? d.prenoms.split(" ")[0].charAt(0).toUpperCase() +
        d.prenoms.split(" ")[0].slice(1).toLowerCase()
      : "";
    const nom = d.nom
      ? d.nom.charAt(0).toUpperCase() + d.nom.slice(1).toLowerCase()
      : "";
    return { name: `${prenom} ${nom}`.trim(), type: "physique", role: d.qualite };
  }

  // Fallback: personne morale with relevant role (holding check needed)
  const morales = dirigeants.filter(
    (d) => d.type_dirigeant === "personne morale" && isRelevantDirigeant(d)
  );
  if (morales.length > 0) {
    return {
      name: morales[0].denomination || "",
      type: "morale",
      role: morales[0].qualite,
      siren_holding: morales[0].siren,
    };
  }

  return { name: "", type: "" };
}

function extractToulouseAddress(result) {
  // Use matching_etablissements (the Toulouse location)
  const etab = result.matching_etablissements?.[0];
  if (etab) return etab.adresse || "";
  // Fallback to siege if it's in Toulouse
  if (result.siege?.commune === COMMUNE) return result.siege.adresse || "";
  return "";
}

function extractEnseigne(result) {
  const etab = result.matching_etablissements?.[0];
  if (etab?.liste_enseignes?.length) return etab.liste_enseignes[0];
  if (etab?.nom_commercial) return etab.nom_commercial;
  if (result.siege?.liste_enseignes?.length) return result.siege.liste_enseignes[0];
  return "";
}

async function fetchPage(nafCode, page) {
  const url = new URL(API_BASE);
  url.searchParams.set("activite_principale", nafCode);
  url.searchParams.set("commune", COMMUNE);
  url.searchParams.set("etat_administratif", "A");
  url.searchParams.set("page", page);
  url.searchParams.set("per_page", PER_PAGE);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error ${res.status} for ${nafCode} page ${page}`);
  return res.json();
}

async function scrapeNAF(nafCode, segment) {
  const merchants = [];
  let page = 1;
  let totalPages = 1;

  // First page to get total
  const first = await fetchPage(nafCode, 1);
  totalPages = first.total_pages;
  const totalResults = first.total_results;

  console.log(`  ${nafCode} (${segment}): ${totalResults} total, ${totalPages} pages`);

  const processResults = (results) => {
    for (const r of results) {
      const nbEtab = r.nombre_etablissements_ouverts || r.nombre_etablissements || 0;

      // Filter: independents only
      if (nbEtab > MAX_ETABLISSEMENTS) continue;

      const dirigeant = extractDirigeantName(r.dirigeants);
      const address = extractToulouseAddress(r);
      const enseigne = extractEnseigne(r);
      const displayName = enseigne || r.nom_complet || r.nom_raison_sociale || "";

      merchants.push({
        nom: displayName,
        raison_sociale: r.nom_raison_sociale || "",
        siren: r.siren,
        segment,
        naf: nafCode,
        adresse_toulouse: address,
        nb_etablissements: nbEtab,
        gerant: dirigeant.name,
        type_dirigeant: dirigeant.type,
        role_dirigeant: dirigeant.role || "",
        siren_holding: dirigeant.siren_holding || "",
        date_creation: r.date_creation || "",
        entrepreneur_individuel: r.complements?.est_entrepreneur_individuel || false,
      });
    }
  };

  processResults(first.results);

  // Remaining pages
  for (page = 2; page <= totalPages; page++) {
    await sleep(DELAY_MS);
    try {
      const data = await fetchPage(nafCode, page);
      processResults(data.results);
    } catch (e) {
      console.error(`    Error page ${page}: ${e.message}`);
    }
  }

  return merchants;
}

async function main() {
  console.log("=== Scraping commerçants indépendants de Toulouse ===\n");
  console.log(`Filtre : ≤${MAX_ETABLISSEMENTS} établissements, entreprises actives\n`);

  const allMerchants = [];

  for (const { code, segment } of NAF_CODES) {
    try {
      const merchants = await scrapeNAF(code, segment);
      allMerchants.push(...merchants);
      console.log(`    → ${merchants.length} indépendants trouvés\n`);
    } catch (e) {
      console.error(`  ERROR ${code}: ${e.message}\n`);
    }
    await sleep(DELAY_MS);
  }

  // Deduplicate by SIREN (a company might appear in multiple NAF codes)
  const seen = new Set();
  const unique = allMerchants.filter((m) => {
    if (seen.has(m.siren)) return false;
    seen.add(m.siren);
    return true;
  });

  console.log(`\n=== RÉSULTAT ===`);
  console.log(`Total brut : ${allMerchants.length}`);
  console.log(`Après dédoublonnage : ${unique.length}`);
  console.log(`Avec dirigeant identifié : ${unique.filter((m) => m.gerant).length}`);
  console.log(`Dirigeant personne physique : ${unique.filter((m) => m.type_dirigeant === "physique").length}`);
  console.log(`Dirigeant personne morale (holding?) : ${unique.filter((m) => m.type_dirigeant === "morale").length}`);

  // Sort by segment then name
  unique.sort((a, b) => a.segment.localeCompare(b.segment) || a.nom.localeCompare(b.nom));

  // --- Output JSON ---
  const jsonPath = join(OUTPUT_DIR, "toulouse-merchants-full.json");
  writeFileSync(jsonPath, JSON.stringify(unique, null, 2));
  console.log(`\nJSON : ${jsonPath}`);

  // --- Output CSV ---
  const csvHeader = "Nom,Raison sociale,SIREN,Segment,Adresse Toulouse,Gérant,Type dirigeant,Rôle,Nb établissements,Date création,SIREN holding";
  const csvRows = unique.map((m) =>
    [
      `"${m.nom.replace(/"/g, '""')}"`,
      `"${m.raison_sociale.replace(/"/g, '""')}"`,
      m.siren,
      `"${m.segment}"`,
      `"${m.adresse_toulouse.replace(/"/g, '""')}"`,
      `"${m.gerant.replace(/"/g, '""')}"`,
      m.type_dirigeant,
      `"${m.role_dirigeant}"`,
      m.nb_etablissements,
      m.date_creation,
      m.siren_holding,
    ].join(",")
  );
  const csvPath = join(OUTPUT_DIR, "toulouse-merchants-full.csv");
  writeFileSync(csvPath, [csvHeader, ...csvRows].join("\n"));
  console.log(`CSV  : ${csvPath}`);

  // --- Stats by segment ---
  console.log("\n=== Par segment ===");
  const bySegment = {};
  for (const m of unique) {
    bySegment[m.segment] = (bySegment[m.segment] || 0) + 1;
  }
  for (const [seg, count] of Object.entries(bySegment).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${seg}: ${count}`);
  }
}

main().catch(console.error);
