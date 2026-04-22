import { uploadToR2 } from "@/lib/r2";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Re-host an EAN photo on R2 for durability and CDN.
 * Original Serper/EAN-Search URLs may rot, rate-limit, or change CDN.
 *
 * Updates `ean_lookups.photo_url_r2` on success.
 * Returns the R2 public URL, or null on failure.
 *
 * Failures are silent — best-effort, never blocks the main flow.
 */
export async function uploadPhotoToR2({
    ean,
    sourceUrl,
}: {
    ean: string;
    sourceUrl: string;
}): Promise<string | null> {
    if (!ean || !sourceUrl) return null;

    try {
        const res = await fetch(sourceUrl);
        if (!res.ok) return null;

        const contentType = res.headers.get("content-type") ?? "image/jpeg";
        const arrayBuffer = await res.arrayBuffer();
        const body = Buffer.from(arrayBuffer);

        // Map content-type → extension (default .jpg)
        const ext = contentType.includes("webp") ? "webp"
            : contentType.includes("png") ? "png"
            : contentType.includes("gif") ? "gif"
            : "jpg";

        const key = `ean/${ean}.${ext}`;
        const r2Url = await uploadToR2(key, body, contentType);

        const supabase = createAdminClient();
        await supabase
            .from("ean_lookups")
            .update({ photo_url_r2: r2Url })
            .eq("ean", ean);

        return r2Url;
    } catch {
        return null;
    }
}
