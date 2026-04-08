import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { uploadToR2 } from "@/lib/r2";
import { createImageJob } from "@/lib/images/jobs";

function validateImageMagicBytes(buffer: Buffer): boolean {
    if (buffer.length < 4) return false;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;

    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;

    // WebP: 52 49 46 46 ... 57 45 42 50 (RIFF....WEBP)
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;

    // GIF: 47 49 46 38
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return true;

    return false;
}

export async function POST(request: NextRequest) {
    try {
        const limited = await rateLimit(request.headers.get("x-forwarded-for") ?? null, "images-upload", 15);
        if (limited) return limited;

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("user_id", user.id)
            .single();

        if (!merchant) {
            return NextResponse.json({ error: "No merchant profile" }, { status: 403 });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const productId = formData.get("product_id") as string | null;

        if (!file || !productId) {
            return NextResponse.json({ error: "file and product_id required" }, { status: 400 });
        }

        // Validate file type and size
        const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json({ error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF" }, { status: 400 });
        }
        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 400 });
        }

        // Verify product belongs to merchant
        const { data: product } = await supabase
            .from("products")
            .select("id")
            .eq("id", productId)
            .eq("merchant_id", merchant.id)
            .single();

        if (!product) {
            return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }

        // Upload original to R2
        const buffer = Buffer.from(await file.arrayBuffer());

        // Validate actual file content (magic bytes) to prevent MIME type spoofing
        if (!validateImageMagicBytes(buffer)) {
            return NextResponse.json({ error: "Invalid image file" }, { status: 400 });
        }

        const r2Key = `originals/${merchant.id}/${productId}.webp`;
        const originalUrl = await uploadToR2(r2Key, buffer, file.type);

        // Update product
        await supabase
            .from("products")
            .update({
                photo_url: originalUrl,
                photo_source: "manual",
                photo_processed_url: null,
            })
            .eq("id", productId);

        // Create image job for processing
        await createImageJob(productId, merchant.id, originalUrl);

        return NextResponse.json({ photo_url: originalUrl });
    } catch {
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
