import { verifyEanMatchWithAI as verifyName } from "@/lib/ean/lookup";

/**
 * AI verification of an EAN candidate against an original product description.
 *
 * Wraps `verifyEanMatchWithAI` from `lib/ean/lookup.ts` with an extended
 * options-object signature that anticipates future image-based verification
 * (Claude Vision) without breaking callers when we add it.
 *
 * Today: only `originalName`, `candidateName`, and `brand` are used.
 * Tomorrow: pass `imageUrl` and the function will also verify the visual match.
 */
export async function verifyEanMatch(opts: {
    originalName: string;
    candidateName: string;
    brand?: string | null;
    /** Reserved for future Claude Vision verification (currently ignored). */
    imageUrl?: string | null;
}): Promise<boolean> {
    return verifyName(opts.originalName, opts.candidateName, opts.brand);
}

/** Re-export the legacy positional-arg helper for backward compatibility. */
export { verifyEanMatchWithAI } from "@/lib/ean/lookup";
