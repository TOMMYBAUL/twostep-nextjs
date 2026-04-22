/**
 * Public reverse-search module — find an EAN from a product name.
 *
 * Re-exports the core helpers from `lib/ean/lookup.ts` so other modules
 * (sync engine, invoice validate, future scan/CSV ingestors) can import
 * from a stable surface without depending on the `ean/lookup` internals.
 */

export {
    searchEanByName,
    pickBestCandidate,
    scoreNameMatch,
    normalizeName,
    levenshtein,
} from "@/lib/ean/lookup";
