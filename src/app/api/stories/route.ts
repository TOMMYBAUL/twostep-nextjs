import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    const merchantIds = request.nextUrl.searchParams.get("merchant_ids");
    if (!merchantIds) return NextResponse.json({ stories: [] });

    const ids = merchantIds.split(",").filter(Boolean).slice(0, 50);
    if (ids.length === 0) return NextResponse.json({ stories: [] });

    const supabase = await createClient();
    const { data: stories } = await supabase
        .from("merchant_stories")
        .select("id, merchant_id, image_url, caption, created_at, expires_at, merchants(name, photo_url)")
        .in("merchant_id", ids)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

    return NextResponse.json({ stories: stories ?? [] });
}

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Get merchant
    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .single();
    if (!merchant) return NextResponse.json({ error: "Not a merchant" }, { status: 403 });

    const formData = await request.formData();
    const image = formData.get("image") as File | null;
    const caption = (formData.get("caption") as string) || null;

    if (!image) return NextResponse.json({ error: "Image required" }, { status: 400 });
    if (caption && caption.length > 280) return NextResponse.json({ error: "Caption too long (max 280)" }, { status: 400 });

    // Upload to Supabase Storage
    const ext = image.name.split(".").pop() ?? "jpg";
    const path = `${merchant.id}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await image.arrayBuffer());

    const { error: uploadError } = await supabase.storage
        .from("stories")
        .upload(path, buffer, { contentType: image.type, upsert: false });

    if (uploadError) {
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage.from("stories").getPublicUrl(path);

    // Insert story record
    const { data: story, error } = await supabase
        .from("merchant_stories")
        .insert({ merchant_id: merchant.id, image_url: publicUrl, caption })
        .select("id, created_at, expires_at")
        .single();

    if (error) {
        return NextResponse.json({ error: "Failed to create story" }, { status: 500 });
    }

    return NextResponse.json({ story }, { status: 201 });
}
