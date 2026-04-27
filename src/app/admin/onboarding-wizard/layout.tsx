import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/auth/require-admin";

// Defense-in-depth : ce layout (Server Component) gate AVANT envoi HTML.
// Le parent src/app/admin/layout.tsx (Client Component) check après hydratation
// JS — fenêtre TOCTOU pendant laquelle la page est temporairement visible.
// Les 2 mécanismes protègent des vecteurs différents — ne pas supprimer "le doublon".
//
// Auth source de vérité : Supabase `app_metadata.role === "admin"` via
// `getAdminUser()` (server-side, plus sécurisé qu'env var ADMIN_EMAILS).

export default async function Layout({ children }: { children: React.ReactNode }) {
    const user = await getAdminUser();
    if (!user) redirect("/dashboard"); // anonymes ET non-admins → /dashboard
    return <div className="container mx-auto p-6">{children}</div>;
}
