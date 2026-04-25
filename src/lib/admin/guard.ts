/** Whitelist d'emails admin via env ADMIN_EMAILS (séparée par virgules). */
export function isAdmin(email: string | null | undefined): boolean {
    if (!email) return false;
    const list = (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return list.includes(email);
}
