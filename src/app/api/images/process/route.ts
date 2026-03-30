import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processProductImage } from "@/lib/images/process";
import { uploadToR2 } from "@/lib/r2";
import { captureError } from "@/lib/error";

const BATCH_SIZE = 5;
const MAX_ATTEMPTS = 3;

export async function POST(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const supabase = createAdminClient();

        // Grab pending jobs
        const { data: jobs } = await supabase
            .from("image_jobs")
            .select("*")
            .eq("status", "pending")
            .order("created_at", { ascending: true })
            .limit(BATCH_SIZE);

        if (!jobs || jobs.length === 0) {
            return NextResponse.json({ processed: 0 });
        }

        let processed = 0;

        for (const job of jobs) {
            // Mark as processing
            await supabase
                .from("image_jobs")
                .update({ status: "processing" })
                .eq("id", job.id);

            try {
                // Process image: download → rembg → sharp → WebP
                const webpBuffer = await processProductImage(job.source_url);

                // Upload to R2
                const r2Key = `products/${job.merchant_id}/${job.product_id}.webp`;
                const resultUrl = await uploadToR2(r2Key, webpBuffer, "image/webp");

                // Update product
                await supabase
                    .from("products")
                    .update({ photo_processed_url: resultUrl })
                    .eq("id", job.product_id);

                // Mark job as done
                await supabase
                    .from("image_jobs")
                    .update({
                        status: "done",
                        result_url: resultUrl,
                        processed_at: new Date().toISOString(),
                    })
                    .eq("id", job.id);

                processed++;
            } catch (err) {
                const attempts = (job.attempts || 0) + 1;
                const failed = attempts >= MAX_ATTEMPTS;

                await supabase
                    .from("image_jobs")
                    .update({
                        status: failed ? "failed" : "pending",
                        attempts,
                        error: err instanceof Error ? err.message : String(err),
                    })
                    .eq("id", job.id);

                captureError(err, { jobId: job.id, productId: job.product_id });
            }
        }

        return NextResponse.json({ processed });
    } catch (err) {
        captureError(err, { route: "images/process" });
        return NextResponse.json({ error: "Worker failed" }, { status: 500 });
    }
}
