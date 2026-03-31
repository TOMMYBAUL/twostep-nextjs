/**
 * Process pending image jobs: download → rembg → sharp → Supabase Storage
 * Run: node scripts/process-images.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import sharp from "sharp";
config({ path: ".env.local" });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const REMBG_URL = process.env.REMBG_API_URL || "http://195.201.229.146:7000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

async function processImage(sourceUrl) {
    const res = await fetch(sourceUrl, { redirect: "follow" });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const imgBuffer = Buffer.from(await res.arrayBuffer());

    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(imgBuffer)]), "image.png");
    const rembgRes = await fetch(`${REMBG_URL}/api/remove`, { method: "POST", body: formData });
    if (!rembgRes.ok) throw new Error(`rembg: ${rembgRes.status}`);
    const transparentPng = Buffer.from(await rembgRes.arrayBuffer());

    // Trim transparent pixels on RGBA (preserves white parts of the product)
    const trimmedInfo = await sharp(transparentPng)
        .trim({ threshold: 0 })
        .toBuffer({ resolveWithObject: true });

    const trimmedBuffer = await sharp(trimmedInfo.data)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .toBuffer();
    const { width, height } = trimmedInfo.info;
    if (!width || !height) throw new Error("Bad dimensions");

    const maxDim = Math.max(width, height);
    const padding = Math.round(maxDim * 0.1);
    const canvasSize = maxDim + padding * 2;

    return sharp({
        create: { width: canvasSize, height: canvasSize, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
        .composite([{
            input: trimmedBuffer,
            left: Math.round((canvasSize - width) / 2),
            top: Math.round((canvasSize - height) / 2),
        }])
        .resize(800, 800)
        .webp({ quality: 85 })
        .toBuffer();
}

async function main() {
    // Ensure storage bucket exists
    await supabase.storage.createBucket("product-images", { public: true }).catch(() => {});

    // Reset failed jobs to pending for retry
    await supabase.from("image_jobs").update({ status: "pending" }).eq("status", "failed");
    await supabase.from("image_jobs").update({ status: "pending" }).eq("status", "processing");

    const { data: jobs } = await supabase
        .from("image_jobs")
        .select("*")
        .eq("status", "pending")
        .order("created_at")
        .limit(10);

    if (!jobs?.length) { console.log("No pending jobs."); return; }

    console.log(`Processing ${jobs.length} images...\n`);

    for (const job of jobs) {
        await supabase.from("image_jobs").update({ status: "processing" }).eq("id", job.id);

        try {
            console.log(`  Processing ${job.product_id.slice(0, 8)}...`);
            const webp = await processImage(job.source_url);
            console.log(`    rembg + sharp OK (${(webp.length / 1024).toFixed(0)} KB)`);

            // Upload to Supabase Storage
            const path = `${job.merchant_id}/${job.product_id}.webp`;
            const { error: uploadErr } = await supabase.storage
                .from("product-images")
                .upload(path, webp, { contentType: "image/webp", upsert: true });

            if (uploadErr) throw new Error(`Storage upload: ${uploadErr.message}`);

            const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
            const publicUrl = urlData.publicUrl;
            console.log(`    URL: ${publicUrl}`);

            await supabase.from("products").update({ photo_processed_url: publicUrl }).eq("id", job.product_id);
            await supabase.from("image_jobs").update({
                status: "done", result_url: publicUrl, processed_at: new Date().toISOString(),
            }).eq("id", job.id);

            console.log("    Done!");
        } catch (err) {
            console.log(`    FAILED: ${err.message}`);
            await supabase.from("image_jobs").update({
                status: "failed", error: err.message, attempts: (job.attempts || 0) + 1,
            }).eq("id", job.id);
        }
    }

    console.log("\nAll done.");
}

main().catch(console.error);
