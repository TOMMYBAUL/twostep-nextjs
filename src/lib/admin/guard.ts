/**
 * @deprecated 2026-04-27 — utiliser `requireAdmin()` ou `getAdminUser()` de
 * `@/lib/auth/require-admin`. Check via Supabase `app_metadata.role === "admin"`
 * = server-side + plus sécurisé qu'une env var ADMIN_EMAILS. Cette fonction
 * sera supprimée après confirmation zero caller.
 */
export function isAdmin(email: string | null | undefined): boolean {
    if (!email) return false;
    const list = (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return list.includes(email);
}
