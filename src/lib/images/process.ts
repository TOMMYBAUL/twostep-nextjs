import sharp from "sharp";

const REMBG_URL = process.env.REMBG_API_URL || "http://localhost:7000";
const REMBG_KEY = process.env.REMBG_API_KEY || "";
const OUTPUT_SIZE = 800;

export async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(imageBuffer)]), "image.png");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    let res: Response;
    try {
        res = await fetch(`${REMBG_URL}/api/remove`, {
            method: "POST",
            headers: REMBG_KEY ? { Authorization: `Bearer ${REMBG_KEY}` } : {},
            body: formData,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeoutId);
    }

    if (!res.ok) {
        throw new Error(`rembg error: ${res.status} ${await res.text()}`);
    }

    return Buffer.from(await res.arrayBuffer());
}

export async function processProductImage(sourceUrl: string): Promise<Buffer> {
    // 1. Download source image (timeout 30s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    let res: Response;
    try {
        res = await fetch(sourceUrl, { signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
    if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
    const sourceBuffer = Buffer.from(await res.arrayBuffer());

    // 2. Remove background via rembg
    const transparentPng = await removeBackground(sourceBuffer);

    // 3. Trim transparent pixels on the RGBA image (before flattening)
    //    This preserves white parts of the product (e.g. white sneakers)
    const trimmedInfo = await sharp(transparentPng)
        .trim({ threshold: 0 })
        .toBuffer({ resolveWithObject: true });

    // Flatten trimmed result to white background
    const trimmedBuffer = await sharp(trimmedInfo.data)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .toBuffer();
    const { width, height } = trimmedInfo.info;

    if (!width || !height) throw new Error("Could not read trimmed image dimensions");

    // 4. Add 10% padding, place on white square, resize to 800x800
    const maxDim = Math.max(width, height);
    const padding = Math.round(maxDim * 0.1);
    const canvasSize = maxDim + padding * 2;

    const left = Math.round((canvasSize - width) / 2);
    const top = Math.round((canvasSize - height) / 2);

    const result = await sharp({
        create: {
            width: canvasSize,
            height: canvasSize,
            channels: 3,
            background: { r: 255, g: 255, b: 255 },
        },
    })
        .composite([{ input: trimmedBuffer, left, top }])
        .resize(OUTPUT_SIZE, OUTPUT_SIZE)
        .webp({ quality: 85 })
        .toBuffer();

    return result;
}
