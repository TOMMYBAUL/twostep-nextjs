import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type SupabaseUser = NonNullable<
    Awaited<ReturnType<Awaited<ReturnType<typeof createClient>>["auth"]["getUser"]>>["data"]["user"]
>;

type RequireAdminResult =
    | { ok: true; user: SupabaseUser; error: null }
    | { ok: false; user: null; error: NextResponse };

/**
 * Pour API routes (handlers) : retourne `{ok, user, error}` discriminé.
 * Pattern caller (compatible avec l'ancien `if ("error" in auth)`) :
 *
 *     const auth = await requireAdmin();
 *     if (auth.error) return auth.error;   // narrow ok=false → error: NextResponse
 *     // ici TS sait que auth.user est non-null
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return {
            ok: false,
            user: null,
            error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        };
    }

    if (user.app_metadata?.role !== "admin") {
        return {
            ok: false,
            user: null,
            error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        };
    }

    return { ok: true, user, error: null };
}

/**
 * Pour Server Components / Layouts : retourne le User si admin, sinon null.
 * Le caller fait `redirect(...)` selon sa logique UX.
 *
 * Source de vérité : `auth.users.app_metadata.role === "admin"` (Supabase metadata,
 * server-side, plus sécurisé qu'une env var ADMIN_EMAILS qui peut leak).
 */
export async function getAdminUser(): Promise<SupabaseUser | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    if (user.app_metadata?.role !== "admin") return null;
    return user;
}
